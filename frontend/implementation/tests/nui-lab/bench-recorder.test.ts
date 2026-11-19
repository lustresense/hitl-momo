// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildEngineConfig, ENGINE_SPECS, fetchEngineModel } from "@/src/components/nui-lab/bench/engines";
import { buildSummaryCsv, reanalyzeExport, validateExportFile } from "@/src/components/nui-lab/bench/export";
import { BenchSessionManager } from "@/src/components/nui-lab/bench/manager";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { ChunkWriter } from "@/src/components/nui-lab/bench/writer";
import { LabTelemetryBridge } from "@/src/components/nui-lab/bench/canvas-tracker";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { validateR19Model } from "@/src/components/nui-lab/r19/r19_loader";
import { loadRealR19Model, pistolSkeleton } from "./lab-rig";

const APP = { version: "0.26.0-alpha-test", gitCommit: "testsha" };
const ENV = {
  userAgentFamily: "Chromium",
  platform: "Linux",
  hardwareConcurrency: 4,
  deviceMemoryGb: 8,
  devicePixelRatio: 1,
  viewport: { w: 1280, h: 720 },
  secureContext: true,
  storage: "memory-only" as const,
};
const CAM = { width: 1280, height: 720, frameRate: 30, deviceClass: "physical-presumed" as const };

function makeFrame(fid: number, t: number, hasHand: boolean, truth: "UNLABELLED" | "POINT_PRESS" | "OTHER" | "NO_LANDMARK" = "UNLABELLED") {
  return {
    t,
    fid,
    det: hasHand ? ("HAND" as const) : ("DETECTOR_MISS" as const),
    lm: hasHand ? Array.from({ length: 21 }, (_, i): [number, number] => [0.3 + i * 0.01, 0.4 + i * 0.01]) : null,
    session: hasHand ? 1 : 0,
    lock: hasHand ? "locked" : "waiting",
    aspect: 1.7778,
    rawPose: hasHand ? "one-finger" : "none",
    stablePose: hasHand ? "one-finger" : "none",
    fingers: hasHand ? 2 : 0,
    fingersLegacy: hasHand ? 2 : 0,
    fingerStates: hasHand ? ["extended", "curled", "curled", "curled"] : null,
    thumb: hasHand ? { legacyRatio: 1.5, lateral: 1.5, ipAngleDeg: 170, open: true } : null,
    pinchRatio: null,
    r19State: hasHand ? ("POINT_PRESS" as const) : ("NO_HAND" as const),
    r19SubClass: hasHand ? "pistol" : "no-hand",
    vkeyEvent: hasHand ? ("KEYDOWN" as const) : ("NONE" as const),
    r19Probs: hasHand ? { ready: 0.05, press: 0.92, other: 0.03 } : null,
    truth,
    reject: hasHand ? "Tinta dinonaktifkan" : "no-hand",
    action: "none" as const,
    hands: hasHand ? 1 : 0,
    farHands: 0,
    luma: { mean: 0.18, center: 0.16, backlight: false, pass: "A4_denoise_reinhard320" },
    timing: { mpMs: 28, preMs: 2.1, workerMs: 31, classifierMs: 0.05, pipelineMs: 34 },
    top3: hasHand ? [{ label: "POINT_PRESS", p: 0.92 }, { label: "POINT_READY", p: 0.05 }, { label: "OTHER", p: 0.03 }] : null,
    direction: hasHand ? "RIGHT" : "NEUTRAL",
    geometry: { pinchActive: false, eraseActive: false, swipe: null, thumbUp: false, isPinch: false },
    fsm: { state: hasHand ? "PRESS" : "NO_HAND", event: hasHand ? "KEYDOWN" : "NONE", zone: hasHand ? "walk-right" : "stop", left: false, right: hasHand, jump: false, releaseReason: null },
    rejectDetail: hasHand ? "pistol" : "no-hand",
    jitter: null,
    droppedSincePrev: 0,
  };
}

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(blob);
  });
}

describe("BenchSessionManager: consent, missing hands, export round-trip, crash recovery, engine separation", () => {
  it("refuses to start without explicit consent and stores zero records", async () => {
    const store = new MemoryBenchStore();
    const mgr = new BenchSessionManager({ openStore: async () => store });
    await expect(mgr.startSession({ consent: false, app: APP, environment: ENV })).rejects.toThrow(/persetujuan/i);
    expect(await store.listSessions()).toHaveLength(0);
    expect(mgr.recordFrame(makeFrame(1, 0, true))).toBe(false);
  });

  it("persists multiple trials across engines/routes including 0-hand trials, keeps R19 vs R20 separate, and passes export re-analysis", async () => {
    const store = new MemoryBenchStore();
    let clock = 1000;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      wallMinuteIso: () => "2026-11-19T12:00:00.000Z",
      randomId: () => "abcd1234",
    });

    const sid = await mgr.startSession({ consent: true, app: APP, environment: ENV });
    expect(sid).toBe("S-abcd1234");

    // Trial 1: R19 C0 on Gesture Lab with 2 hand frames + 1 miss frame
    mgr.setScenario("N1_single_room_lamp", "lampu 1x");
    mgr.beginTrial({
      route: "gesture",
      source: "gesture-lab",
      engine: buildEngineConfig("r19-c0", "raw", "cpu-worker", true),
      camera: CAM,
    });
    clock += 40;
    mgr.recordFrame(makeFrame(1, 40, true, "POINT_PRESS"));
    mgr.event("KEYDOWN", { zone: "walk-right" }, "gesture");
    clock += 40;
    mgr.recordFrame(makeFrame(2, 80, true, "OTHER")); // labelled false press
    clock += 40;
    mgr.recordFrame(makeFrame(3, 120, false, "NO_LANDMARK"));

    // Route transition -> Trial 2: R20 C4 on Canvas Lab with 100% DETECTOR_MISS frames (0-hand trial!)
    mgr.endTrial("route-unmount");
    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "a4", "cpu-worker", true),
      camera: CAM,
    });
    clock += 40;
    mgr.recordFrame(makeFrame(4, 160, false));
    clock += 40;
    mgr.recordFrame(makeFrame(5, 200, false));

    await mgr.finishSession("finished-by-tester");

    const blob = await mgr.exportAll(APP);
    const parsed = JSON.parse(await readBlobText(blob));
    expect(validateExportFile(parsed)).toEqual([]);

    const re = reanalyzeExport(parsed);
    expect(re.ok).toBe(true);
    expect(re.mismatches).toEqual([]);

    const session = parsed.sessions[0];
    expect(session.trials).toHaveLength(2);
    // R19 C0 and R20 C4 MUST be in distinct groups
    expect(session.benchmarkSummary.groups).toHaveLength(2);
    expect(session.benchmarkSummary.groups.map((g: { key: { engineId: string } }) => g.key.engineId).sort()).toEqual([
      "r19-c0",
      "r20-c4",
    ]);

    // Trial 1 checks
    const t1 = session.trials[0].summary;
    expect(t1.frames).toBe(3);
    expect(t1.handFrames).toBe(2);
    expect(t1.detectorMissFrames).toBe(1);
    expect(t1.gesture.falsePressFrames).toBe(1);

    // Trial 2 (0-hand trial) MUST be saved with 100% missingHandRate
    const t2 = session.trials[1].summary;
    expect(t2.frames).toBe(2);
    expect(t2.handFrames).toBe(0);
    expect(t2.detectorMissFrames).toBe(2);
    expect(t2.missingHandRate).toBe(1);

    // CSV export
    const csv = await buildSummaryCsv(store, [sid]);
    expect(csv).toContain("r19-c0");
    expect(csv).toContain("r20-c4");
    expect(csv.trim().split("\n")).toHaveLength(3); // header + 2 trials

    // Explicit delete wipes all local data
    await mgr.deleteAllLocalData();
    expect(await store.listSessions()).toHaveLength(0);
    expect(await store.listTrials(sid)).toHaveLength(0);
  });

  it("marks crashed/pagehide sessions interrupted on recovery without losing stored data", async () => {
    const store = new MemoryBenchStore();
    const mgr1 = new BenchSessionManager({
      openStore: async () => store,
      randomId: () => "crash001",
      heartbeatStaleMs: 10,
    });
    const sid = await mgr1.startSession({ consent: true, app: APP, environment: ENV });
    mgr1.beginTrial({
      route: "gesture",
      source: "gesture-lab",
      engine: buildEngineConfig("r20-c7", "a4", "cpu-worker", true),
      camera: CAM,
    });
    mgr1.recordFrame(makeFrame(1, 20, true));
    // Simulate pagehide
    mgr1.markInterrupted("pagehide");
    await new Promise((r) => setTimeout(r, 30));

    // Simulate brand new page load opening same persistent store
    const mgr2 = new BenchSessionManager({ openStore: async () => store, heartbeatStaleMs: 10 });
    await mgr2.init();
    const st = mgr2.getSnapshot();
    expect(st.previousSessions).toHaveLength(1);
    expect(st.previousSessions[0]!.sessionId).toBe(sid);
    expect(st.previousSessions[0]!.status).toBe("interrupted");

    const blob = await mgr2.exportAll(APP);
    const parsed = JSON.parse(await readBlobText(blob));
    expect(parsed.sessions[0].frames).toHaveLength(1);
    expect(parsed.sessions[0].validation.status).toBe("interrupted");
  });

  it("never drops records silently under storage failure or queue saturation: counts droppedRecords and warns", async () => {
    const store = new MemoryBenchStore();
    store.failNextWrites = 2;
    const warnings: string[] = [];
    const writer = new ChunkWriter(store, "S-drop", {
      chunkSize: 2,
      flushMs: 50,
      maxQueueItems: 4,
      retryMs: 20,
      onWarning: (m) => warnings.push(m),
    });

    expect(writer.push("frames", { id: 1 })).toBe(true);
    expect(writer.push("frames", { id: 2 })).toBe(true); // seals & triggers write failure #1
    expect(writer.push("frames", { id: 3 })).toBe(true);
    expect(writer.push("frames", { id: 4 })).toBe(true);
    // Queue now holds 4 items (maxQueueItems=4) -> 5th item must be counted as dropped, NEVER silent!
    expect(writer.push("frames", { id: 5 })).toBe(false);

    await writer.flush(2000);
    const st = writer.stats();
    expect(st.written.frames).toBe(4);
    expect(st.dropped.frames).toBe(1);
    expect(st.failures).toBeGreaterThanOrEqual(1);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    writer.dispose();
  });

  it("separates pointer fallback strokes from gesture strokes in LabTelemetryBridge and flags unexpected breaks", async () => {
    const store = new MemoryBenchStore();
    let clock = 500;
    const mgr = new BenchSessionManager({ openStore: async () => store, now: () => clock });
    await mgr.startSession({ consent: true, app: APP, environment: ENV });
    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "a4", "cpu-worker", true),
      camera: CAM,
    });

    const analyzer = new LabAnalyzer({ fullFrameLock: true, enableInk: true });
    analyzer.enableR19(loadRealR19Model(), clock);
    const bridge = new LabTelemetryBridge(mgr, true);

    // Pointer stroke (must be tagged source: "pointer")
    bridge.onPointerDown("pen", { x: 10, y: 10 }, clock);
    bridge.onPointerMove({ x: 40, y: 50 });
    clock += 100;
    bridge.onPointerUp(clock);

    // Simulate gesture stroke started then broken by hand loss (DETECTOR_MISS)
    const hand = pistolSkeleton(0, false, { aspect: 16 / 9 });
    analyzer.analyse({ landmarks: [hand], inferMs: 20, nowMs: clock, aspect: 16 / 9 });
    clock += 33;
    analyzer.analyse({ landmarks: [hand], inferMs: 20, nowMs: clock, aspect: 16 / 9 });
    bridge.onAnalyzedFrame(analyzer.snapshot(clock), {
      frameId: 1,
      nowMs: clock,
      landmarks: hand,
      truth: "PINCH_TOUCH",
      luma: { mean: 0.4, center: 0.4, backlight: false, pass: "A0_raw" },
      timing: { mpMs: 20, preMs: 0, workerMs: 22, classifierMs: 0.05, pipelineMs: 25 },
      droppedSincePrev: 0,
      activeStrokePoints: [{ x: 100, y: 100 }, { x: 130, y: 140 }],
      completedStrokeCount: 0,
    });
    clock += 33;
    analyzer.analyse({ landmarks: [], inferMs: 18, nowMs: clock, aspect: 16 / 9 });
    bridge.onAnalyzedFrame(analyzer.snapshot(clock), {
      frameId: 2,
      nowMs: clock,
      landmarks: null,
      truth: "NO_LANDMARK",
      luma: { mean: 0.4, center: 0.4, backlight: false, pass: "A0_raw" },
      timing: { mpMs: 18, preMs: 0, workerMs: 20, classifierMs: null, pipelineMs: 22 },
      droppedSincePrev: 0,
      activeStrokePoints: null,
      completedStrokeCount: 1,
    });

    await mgr.finishSession();
    const parsed = JSON.parse(await readBlobText(await mgr.exportAll(APP)));
    const summary = parsed.sessions[0].trials[0].summary;
    expect(summary.canvas.pointerStrokes).toBe(1);
    expect(summary.canvas.gestureStrokes).toBe(1);
    expect(summary.canvas.unexpectedStrokeBreaks).toBe(1);
  });

  it("verifies real pinned SHA-256 hashes of R19 C0, R20 C4, and R20 C7 and fails closed on tampered bytes", async () => {
    const modelsDir = resolve(process.cwd(), "public/models");
    for (const [engineId, filename] of [
      ["r19-c0", "r19-pistol-model.json"],
      ["r20-c4", "r20-c4-model.json"],
      ["r20-c7", "r20-c7-t4-model.json"],
    ] as const) {
      const rawBuf = readFileSync(resolve(modelsDir, filename));
      const okFetcher = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength),
        json: async () => JSON.parse(rawBuf.toString("utf8")),
      })) as unknown as typeof fetch;

      const loaded = await fetchEngineModel(engineId, okFetcher);
      expect(loaded.hashVerified).toBe(true);
      expect(loaded.bytes).toBe(ENGINE_SPECS[engineId].bytes);
      const validated = validateR19Model(loaded.json);
      expect(validated.labels).toEqual(["POINT_READY", "POINT_PRESS", "OTHER"]);

      // Tamper 1 byte -> MUST reject fail-closed!
      const badBuf = Buffer.from(rawBuf);
      badBuf[badBuf.length - 1] = badBuf[badBuf.length - 1]! ^ 0x20;
      const badFetcher = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => badBuf.buffer.slice(badBuf.byteOffset, badBuf.byteOffset + badBuf.byteLength),
      })) as unknown as typeof fetch;
      await expect(fetchEngineModel(engineId, badFetcher)).rejects.toThrow(/SHA-256/);
    }
  });
});
