// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  readPersistedBenchConsent,
  writePersistedBenchConsent,
} from "@/src/components/nui-lab/bench/config";
import {
  AUTO_RUNTIME_UI_LABEL,
  buildEngineConfig,
  ENGINE_SPECS,
  fetchEngineModel,
  formatHonestEngineDiagnostics,
} from "@/src/components/nui-lab/bench/engines";
import { getAppBuildInfo } from "@/src/components/nui-lab/bench/env";
import {
  buildSummaryCsv,
  reanalyzeExport,
  validateExportFile,
  verifyExportChecksum,
} from "@/src/components/nui-lab/bench/export";
import { BenchSessionManager } from "@/src/components/nui-lab/bench/manager";
import { BENCH_EXPORT_SCHEMA } from "@/src/components/nui-lab/bench/schema";
import { TrialAggregator } from "@/src/components/nui-lab/bench/stats";
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

  it("R22 zero-friction lifecycle: one-time consent auto-starts trials on camera-on and closes trials on route-switch, tab-hidden, camera-stop, worker-error", async () => {
    writePersistedBenchConsent(false);
    const store = new MemoryBenchStore();
    let clock = 1000;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      wallMinuteIso: () => "2026-11-19T12:00:00.000Z",
      randomId: () => "autolife",
    });

    const engine = buildEngineConfig("r20-c4", "a4", "cpu-worker", true);
    expect(engine.displayModeLabel).toBe(AUTO_RUNTIME_UI_LABEL);
    expect(engine.actualModelId).toBe("r20-c4");
    expect(engine.isTrainedR22Model).toBe(false);
    const honest = formatHonestEngineDiagnostics(engine);
    expect(honest.uiBadge).toBe(AUTO_RUNTIME_UI_LABEL);
    expect(honest.actualModelId).toBe("r20-c4");

    // Without consent: auto-start MUST refuse and store zero records
    const denied = await mgr.startCameraTrialAuto({
      route: "gesture",
      source: "gesture-lab",
      engine,
      camera: CAM,
    });
    expect(denied.started).toBe(false);
    expect(denied.reason).toBe("no-consent");
    expect(await store.listSessions()).toHaveLength(0);

    // Grant consent once (persisted in localStorage)
    mgr.grantConsent();
    expect(readPersistedBenchConsent()).toBe(true);

    const t1Res = await mgr.startCameraTrialAuto({
      route: "gesture",
      source: "gesture-lab",
      engine,
      camera: CAM,
    });
    expect(t1Res.started).toBe(true);
    expect(t1Res.trialId).toBe("S-autolife-T001");
    clock += 40;
    mgr.recordFrame(makeFrame(1, 40, true));

    // Route switch gesture -> canvas closes Trial 1 with endReason="route-switch"
    mgr.onRouteSwitch("canvas");
    expect(mgr.hasOpenTrial).toBe(false);
    const t2Res = await mgr.startCameraTrialAuto({
      route: "canvas",
      source: "canvas-lab",
      engine,
      camera: CAM,
    });
    expect(t2Res.trialId).toBe("S-autolife-T002");
    clock += 40;
    mgr.recordFrame(makeFrame(2, 80, true));

    // Tab hidden closes Trial 2 with endReason="tab-hidden"; tab visible resumes a new trial and tracks hiddenDurationMs
    mgr.onTabHidden();
    expect(mgr.hasOpenTrial).toBe(false);
    clock += 2500;
    const t3Id = mgr.onTabVisible();
    expect(t3Id).toBe("S-autolife-T003");
    expect(mgr.getSnapshot().hiddenDurationMs).toBe(2500);
    clock += 40;
    mgr.recordFrame(makeFrame(3, 2620, true));

    // Camera stop closes Trial 3 with endReason="camera-stop"
    mgr.onCameraStop("camera-stop");
    expect(mgr.hasOpenTrial).toBe(false);

    // Worker error closes Trial 4 with endReason="worker-error"
    await mgr.startCameraTrialAuto({ route: "gesture", source: "gesture-lab", engine, camera: CAM });
    mgr.onWorkerError("simulated-wasm-fault");
    expect(mgr.hasOpenTrial).toBe(false);

    await mgr.finishSession("user-finish");
    const blobText = await readBlobText(await mgr.exportAll(getAppBuildInfo()));
    const parsed = JSON.parse(blobText);
    expect(parsed.schema).toBe(BENCH_EXPORT_SCHEMA);
    expect(parsed.app.gitCommit).toBe("745bb6d840793dcab8558f65aef6bfac58807e79");
    expect(parsed.sessions[0].trials.map((t: { meta: { endReason: string } }) => t.meta.endReason)).toEqual([
      "route-switch",
      "tab-hidden",
      "camera-stop",
      "worker-error",
    ]);
    expect((await verifyExportChecksum(blobText)).ok).toBe(true);
    // Tampering 1 character inside sessions fails checksum verification
    const tampered = blobText.replace('"S-autolife-T001"', '"S-autolife-X001"');
    expect((await verifyExportChecksum(tampered)).ok).toBe(false);

    await mgr.deleteAllLocalData();
    expect(readPersistedBenchConsent()).toBe(false);
  });

  it("recovers abruptly crashed active sessions as interrupted with closed open trials and never merges distinct sessions", async () => {
    const store = new MemoryBenchStore();
    let clock = 500;
    const mgr1 = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      randomId: () => "crash002",
      heartbeatStaleMs: 10,
    });
    await mgr1.startSession({ consent: true, app: APP, environment: ENV });
    mgr1.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "a4", "cpu-worker", true),
      camera: CAM,
    });
    clock += 50;
    mgr1.recordFrame(makeFrame(1, 50, true));
    await mgr1.flush();
    // Abrupt crash: wait for heartbeat stale without calling finishSession or markInterrupted
    await new Promise((r) => setTimeout(r, 25));

    const mgr2 = new BenchSessionManager({
      openStore: async () => store,
      now: () => 2000,
      randomId: () => "fresh003",
      heartbeatStaleMs: 10,
    });
    await mgr2.init();
    const prev = mgr2.getSnapshot().previousSessions;
    expect(prev).toHaveLength(1);
    expect(prev[0]!.sessionId).toBe("S-crash002");
    expect(prev[0]!.status).toBe("interrupted");

    // Start a fresh session on mgr2: must NOT merge or double-count crash002 frames
    await mgr2.startSession({ consent: true, app: APP, environment: ENV });
    mgr2.beginTrial({
      route: "gesture",
      source: "gesture-lab",
      engine: buildEngineConfig("r20-c4", "a4", "cpu-worker", true),
      camera: CAM,
    });
    mgr2.recordFrame(makeFrame(1, 10, true));
    await mgr2.finishSession("user-finish");

    const parsed = JSON.parse(await readBlobText(await mgr2.exportAll(APP)));
    expect(parsed.sessions).toHaveLength(2);
    const crashed = parsed.sessions.find((s: { meta: { sessionId: string } }) => s.meta.sessionId === "S-crash002");
    const fresh = parsed.sessions.find((s: { meta: { sessionId: string } }) => s.meta.sessionId === "S-fresh003");
    expect(crashed.frames).toHaveLength(1);
    expect(crashed.trials[0].meta.endReason).toBe("interrupted");
    expect(fresh.frames).toHaveLength(1);
  });

  it("separates rawNoHandRate vs activeWindowMissRate, counts 1-3 / 4-15 / >15 streaks, derives RULE_DERIVED tags, and refuses self-GT", () => {
    const agg = new TrialAggregator("T-aw", "camera-stop", "canvas");
    let t = 0;
    const pushF = (fid: number, hasHand: boolean, extra: Partial<Parameters<TrialAggregator["addFrame"]>[0]> = {}) => {
      t += 40;
      agg.addFrame({
        ...makeFrame(fid, t, hasHand, "UNLABELLED"),
        trialId: "T-aw",
        captureFrameId: fid,
        processedFrameId: fid,
        lumaP10: 0.08,
        lumaP50: 0.24,
        lumaP95: 0.96,
        // R22B B7.1: GLARE_CANDIDATE recalibrated to nearWhiteHandPct >= 25% (removed p95 >= 0.94).
        nearWhiteHandPct: hasHand ? 28.4 : null,
        blurProxy: 28,
        noiseProxy: 6.1,
        framesSkippedDuplicate: fid === 5 ? 3 : 0,
        runtimeSetOptionsCalls: 0,
        labelSource: "RULE_DERIVED",
        labelSources: {
          truth: "MODEL_PREDICTION", // deliberately invalid GT source — must NEVER be treated as GT!
          posePred: "RULE_DERIVED",
          actionIntent: "RULE_DERIVED",
          captureQuality: "RULE_DERIVED",
        },
        ...extra,
      });
    };

    let fid = 1;
    // 4 lead-in no-hand frames (excluded from active window!)
    for (let i = 0; i < 4; i++) pushF(fid++, false);
    // Active window starts: 2 hand frames
    pushF(fid++, true);
    pushF(fid++, true);
    // Flicker streak (2 frames <= 3)
    pushF(fid++, false);
    pushF(fid++, false);
    pushF(fid++, true);
    // Short loss streak (5 frames in 4..15)
    for (let i = 0; i < 5; i++) pushF(fid++, false);
    pushF(fid++, true);
    // Long absence streak (17 frames > 15)
    for (let i = 0; i < 17; i++) pushF(fid++, false);
    pushF(fid++, true);
    // Active window ends here; 10 tail no-hand frames (excluded from active window!)
    for (let i = 0; i < 10; i++) pushF(fid++, false);

    const s = agg.summary();
    expect(s.frames).toBe(43);
    expect(s.rawNoHandRate).toBe(Math.round(((4 + 2 + 5 + 17 + 10) / 43) * 1000) / 1000);
    expect(s.activeWindow.frames).toBe(29);
    expect(s.activeWindow.leadInNoHandFrames).toBe(4);
    expect(s.activeWindow.tailNoHandFrames).toBe(10);
    expect(s.activeWindow.missFrames).toBe(24);
    expect(s.activeWindowMissRate).toBe(Math.round((24 / 29) * 1000) / 1000);
    expect(s.flickerStreaks_1_3).toBe(1);
    expect(s.shortLossStreaks_4_15).toBe(1);
    expect(s.longAbsenceStreaks_gt15).toBe(1);
    expect(s.duplicateFrameSkippedCount).toBe(3);
    expect(s.runtimeSetOptionsCalls).toBe(0);
    expect(s.autoConditionTagsSource).toBe("RULE_DERIVED");
    expect(s.autoConditionTags).toEqual(["BLUR_CANDIDATE", "DIM_CANDIDATE", "GLARE_CANDIDATE", "NOISE_CANDIDATE"]);

    // STRICT A06 / B06 / E05: no independent GT -> MUST NOT emit falsePressFrames: 0 or confusion: {}
    expect(s.independentGroundTruthAvailable).toBe(false);
    expect(s.gesture.labelledFrames).toBe(0);
    expect(s.gesture.falsePressFrames).toBeNull();
    expect(s.gesture.missedPressFrames).toBeNull();
    expect(s.gesture.confusion).toBeNull();
  });

  it("records Canvas B08 events (UNDO/REDO via gesture vs button, 5-finger ERASE, grace STROKE_GAP/STROKE_RESUME, ACTION_REJECTED labelSource) and validates v2 export + privacy", async () => {
    const store = new MemoryBenchStore();
    let clock = 100;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      randomId: () => "canv22",
    });
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
    const hand = pistolSkeleton(0, false, { aspect: 16 / 9 });
    analyzer.analyse({ landmarks: [hand], inferMs: 18, nowMs: clock, aspect: 16 / 9 });
    clock += 33;
    analyzer.analyse({ landmarks: [hand], inferMs: 18, nowMs: clock, aspect: 16 / 9 });

    // Frame 1: active stroke
    bridge.onAnalyzedFrame(analyzer.snapshot(clock), {
      frameId: 1,
      captureFrameId: 10,
      processedFrameId: 10,
      captureTimestampMs: clock - 20,
      displayTimestampMs: clock,
      uniqueCaptureFps: 15,
      framesSkippedDuplicateCumulative: 4,
      runtimeSetOptionsCallsCumulative: 0,
      nowMs: clock,
      landmarks: hand,
      truth: "UNLABELLED",
      luma: { mean: 0.42, center: 0.4, backlight: false, pass: "A0_raw", p10: 0.12, p50: 0.42, p95: 0.85, nearWhiteHandPct: 1.2, blurProxy: 80, noiseProxy: 2.1 },
      timing: { mpMs: 18, preMs: 0.5, workerMs: 20, classifierMs: 0.1, pipelineMs: 22 },
      droppedSincePrev: 0,
      activeStrokePoints: [{ x: 100, y: 100 }, { x: 110, y: 110 }],
      completedStrokeCount: 0,
      actionResolution: {
        actionIntent: "DRAW",
        actionAccepted: true,
        rejectReason: null,
        labelSource: "RULE_DERIVED",
        fingerCount: 2,
        inGrace: false,
      },
    });

    // Frame 2: short 99ms detector blink -> stays in grace without STROKE_END (STROKE_GAP)
    clock += 99;
    bridge.onAnalyzedFrame(analyzer.snapshot(clock), {
      frameId: 2,
      captureFrameId: 11,
      processedFrameId: 11,
      captureTimestampMs: clock - 18,
      displayTimestampMs: clock,
      uniqueCaptureFps: 15,
      framesSkippedDuplicateCumulative: 6,
      runtimeSetOptionsCallsCumulative: 0,
      nowMs: clock,
      landmarks: null,
      truth: "UNLABELLED",
      luma: { mean: 0.42, center: 0.4, backlight: false, pass: "A0_raw", p10: 0.12, p50: 0.42, p95: 0.85, nearWhiteHandPct: 99, blurProxy: 80, noiseProxy: 2.1 },
      timing: { mpMs: 18, preMs: 0.5, workerMs: 20, classifierMs: null, pipelineMs: 20 },
      droppedSincePrev: 0,
      activeStrokePoints: [{ x: 100, y: 100 }, { x: 110, y: 110 }],
      completedStrokeCount: 0,
      actionResolution: {
        actionIntent: "HOLD_GRACE",
        actionAccepted: true,
        rejectReason: null,
        labelSource: "RULE_DERIVED",
        inGrace: true,
        gapReason: "short-blink-grace",
      },
    });

    // Frame 3: hand recovers within grace -> STROKE_RESUME!
    clock += 40;
    bridge.onAnalyzedFrame(analyzer.snapshot(clock), {
      frameId: 3,
      captureFrameId: 12,
      processedFrameId: 12,
      captureTimestampMs: clock - 15,
      displayTimestampMs: clock,
      uniqueCaptureFps: 15,
      framesSkippedDuplicateCumulative: 6,
      runtimeSetOptionsCallsCumulative: 0,
      nowMs: clock,
      landmarks: hand,
      truth: "UNLABELLED",
      luma: { mean: 0.42, center: 0.4, backlight: false, pass: "A0_raw", p10: 0.12, p50: 0.42, p95: 0.85, nearWhiteHandPct: 0.8, blurProxy: 82, noiseProxy: 2.0 },
      timing: { mpMs: 16, preMs: 0.5, workerMs: 18, classifierMs: 0.1, pipelineMs: 19 },
      droppedSincePrev: 0,
      activeStrokePoints: [{ x: 100, y: 100 }, { x: 110, y: 110 }, { x: 125, y: 125 }],
      completedStrokeCount: 0,
      actionResolution: {
        actionIntent: "DRAW",
        actionAccepted: true,
        rejectReason: null,
        labelSource: "RULE_DERIVED",
        inGrace: false,
      },
    });

    // Frame 4: pinch-release closes stroke cleanly + rejected near-pinch logged
    clock += 40;
    bridge.onAnalyzedFrame(analyzer.snapshot(clock), {
      frameId: 4,
      captureFrameId: 13,
      processedFrameId: 13,
      captureTimestampMs: clock - 15,
      displayTimestampMs: clock,
      uniqueCaptureFps: 15,
      framesSkippedDuplicateCumulative: 6,
      runtimeSetOptionsCallsCumulative: 0,
      nowMs: clock,
      landmarks: hand,
      truth: "UNLABELLED",
      luma: { mean: 0.42, center: 0.4, backlight: false, pass: "A0_raw" },
      timing: { mpMs: 16, preMs: 0.5, workerMs: 18, classifierMs: 0.1, pipelineMs: 19 },
      droppedSincePrev: 0,
      activeStrokePoints: null,
      completedStrokeCount: 1,
      actionResolution: {
        actionIntent: "DRAW",
        actionAccepted: false,
        rejectReason: "near-pinch-not-touching",
        labelSource: "RULE_DERIVED",
        endReason: "pinch-release",
      },
    });

    // Gesture UNDO/REDO + button UNDO + 5-finger ERASE events
    mgr.event("ERASE_START", { fingerCount: 5, latencyMs: 18 }, "gesture", true, "RULE_DERIVED");
    mgr.event("UNDO", { changed: true, via: "gesture-fist-one", latencyMs: 18 }, "gesture", true, "RULE_DERIVED");
    mgr.event("REDO", { changed: true, via: "gesture-fist-two", latencyMs: 18 }, "gesture", true, "RULE_DERIVED");
    bridge.onManualCanvasAction("undo");

    await mgr.finishSession("user-finish");
    const blobText = await readBlobText(await mgr.exportAll(getAppBuildInfo()));
    expect(validateExportFile(blobText)).toEqual([]);
    const parsed = JSON.parse(blobText);
    expect(reanalyzeExport(parsed).ok).toBe(true);

    const sess = parsed.sessions[0];
    // Privacy check: Frame 2 had no hand -> nearWhiteHandPct MUST be null (not 99)
    expect(sess.frames[1].nearWhiteHandPct).toBeNull();
    expect(sess.frames[1].labelSource).toBe("RULE_DERIVED");
    const sum = sess.trials[0].summary;
    expect(sum.canvas.strokes).toBe(1);
    expect(sum.canvas.strokeGapEvents).toBe(1);
    expect(sum.canvas.continuedStrokesAfterGrace).toBe(1);
    expect(sum.canvas.strokeEndReasons["pinch-release"]).toBe(1);
    expect(sum.canvas.undoVia).toEqual({ "gesture-fist-one": 1, button: 1 });
    expect(sum.canvas.redoVia).toEqual({ "gesture-fist-two": 1 });
    expect(sum.canvas.actionRejectedReasons["near-pinch-not-touching"]).toBe(1);
    expect(sum.duplicateFrameSkippedCount).toBe(6);
    expect(sum.independentGroundTruthAvailable).toBe(false);
    expect(sum.gesture.falsePressFrames).toBeNull();
  });

  it("maintains full v1 reader compatibility on in-repo v1 benchmark export fixture", () => {
    const fixturePath = resolve(__dirname, "../fixtures/bench-v1-compat-sample.json");
    const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(parsed.schema).toBe("nui-lab-bench-export/1");
    expect(validateExportFile(parsed)).toEqual([]);
    const re = reanalyzeExport(parsed);
    expect(re.ok).toBe(true);
    expect(re.mismatches).toEqual([]);
    const t1 = re.sessions[0]!.trialSummaries["S-v1compat-T001"]!;
    expect(t1.independentGroundTruthAvailable).toBe(false);
    expect(t1.frames).toBe(12);
    expect(t1.handFrames).toBe(5);
    expect(t1.detectorMissFrames).toBe(7);
    expect(t1.rawNoHandRate).toBe(0.5);
    expect(t1.activeWindow.leadInNoHandFrames).toBeGreaterThan(0);
    expect(t1.activeWindow.tailNoHandFrames).toBeGreaterThan(0);
    expect(t1.activeWindowMissRate).not.toBeNull();
    expect(t1.rawNoHandRate).not.toBeNull();
    expect(t1.activeWindowMissRate!).toBeLessThan(t1.rawNoHandRate!);
    expect(t1.gesture.falsePressFrames).toBeNull();
  });
});
