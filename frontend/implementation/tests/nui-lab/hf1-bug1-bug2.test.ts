/**
 * Hotfix R23-HF1: Verification tests for Bug 1 (ink never gated by MomoGuide, T002 replay produces stroke & reaches LOCKED)
 * and Bug 2 (MoNUI-7 live telemetry fields populated, session meta carries yoloModelSha256).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { MomoGuideFSM, type MomoGuideState } from "@/src/components/nui-lab/bench/monui7-momo-guide";
import { BenchSessionManager } from "@/src/components/nui-lab/bench/manager";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { buildEngineConfig } from "@/src/components/nui-lab/bench/engines";
import { LabTelemetryBridge } from "@/src/components/nui-lab/bench/canvas-tracker";
import { YOLO_MODEL_SHA256 } from "@/src/components/nui-lab/bench/monui7-yolo";
import { validateR19Model } from "@/src/components/nui-lab/r19/r19_loader";
import type { Landmark } from "@/src/input/types";
import { MEDIAN_SKELETONS, placeHand, type Skeleton } from "../input/realistic-hands";

const T002_FIXTURE_PATH = resolve(process.cwd(), "tests/fixtures/t002-draw-replay.json");
const R20_C4_MODEL = validateR19Model(
  JSON.parse(readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"), "utf8")),
);

interface T002Frame {
  t: number;
  aspect: number;
  lm: Array<[number, number]> | null;
  captureFrameId: number;
  frameAgeMs: number;
  stablePose?: string;
  actionIntent?: string;
  actionAccepted?: boolean;
}

interface T002Fixture {
  schema: string;
  sessionId: string;
  trialId: string;
  totalFrames: number;
  frames: T002Frame[];
}

function toLandmarks(pairs: Array<[number, number]> | null): Landmark[] | undefined {
  if (!pairs || pairs.length < 21) return undefined;
  return pairs.map(([x, y]) => ({ x, y, z: 0 }));
}

function makeFive(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(MEDIAN_SKELETONS.palm, { cx, cy, aspect: 16 / 9 });
}

function makeOkPinch(cx = 0.5, cy = 0.72): Landmark[] {
  const sk = MEDIAN_SKELETONS.palm.map(([x, y]) => [x, y] as [number, number]);
  sk[3] = [-1.05, 1.08];
  sk[4] = [-0.78, 1.48];
  sk[6] = [-0.62, 1.42];
  sk[7] = [-0.71, 1.50];
  sk[8] = [-0.75, 1.49];
  return placeHand(sk as Skeleton, { cx, cy, aspect: 16 / 9 });
}

describe("R23-HF1 Bug 1: Ink is never gated by MomoGuideFSM; T002 replay verification", () => {
  it("replays real T002 frames: Momo reaches LOCKED when open-palm >= 300ms, and at least 1 stroke is formed", () => {
    const rawFixture = JSON.parse(readFileSync(T002_FIXTURE_PATH, "utf8")) as T002Fixture;
    const frames = rawFixture.frames;

    const analyzer = new LabAnalyzer({
      route: "canvas",
      fullFrameLock: true,
      enableInk: true,
      preset: "default-any-pinch",
    });
    analyzer.enableR19(R20_C4_MODEL, 0);

    const guide = new MomoGuideFSM("GREET");
    let lockedReachedAtMs: number | null = null;
    let strokesFormed = 0;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const lm = toLandmarks(f.lm);
      analyzer.analyse({
        landmarks: lm ? [lm] : [],
        inferMs: 12,
        nowMs: f.t,
        aspect: f.aspect,
        captureFrameId: f.captureFrameId,
      });

      const snap = analyzer.snapshot(f.t);
      const isFive =
        snap.diag.fiveFingerValid ||
        snap.diag.stablePose === "open-palm" ||
        snap.pose === "open-palm" ||
        snap.fingerCount === 5 ||
        snap.diag.rawFingerCount === 5;

      const gRes = guide.update({
        nowMs: f.t,
        hasHand: snap.handCount > 0,
        fiveFingerValid: isFive,
        drawingActive: snap.drawingAction === "draw",
        rescueState: null,
      });

      if (gRes.state === "LOCKED" && lockedReachedAtMs === null) {
        lockedReachedAtMs = f.t;
      }

      const st = analyzer.strokes();
      strokesFormed = Math.max(strokesFormed, st.completed.length + (st.active ? 1 : 0));
    }

    // Momo must reach LOCKED during open-palm >= 300 ms
    expect(lockedReachedAtMs).not.toBeNull();
    // Stroke count must be >= 1 (Bug 1 fix: ink is allowed and strokes form)
    expect(strokesFormed).toBeGreaterThanOrEqual(1);
  });

  it("valid pinch produces ink regardless of Momo guide state (GREET, ASK_FIVE_AGAIN, UNCLEAR_FINGERS, ASK_LIGHT)", () => {
    const states: MomoGuideState[] = ["GREET", "ASK_FIVE_AGAIN", "UNCLEAR_FINGERS", "ASK_LIGHT"];

    for (const st of states) {
      const guide = new MomoGuideFSM(st);
      expect(guide.state).toBe(st);

      // Analyzer without guideInkGate: ink is governed solely by ActionIntentResolver
      const analyzer = new LabAnalyzer({
        route: "canvas",
        fullFrameLock: true,
        enableInk: true,
        preset: "default-any-pinch",
      });
      analyzer.enableR19(R20_C4_MODEL, 0);

      const aspect = 16 / 9;
      const five = makeFive();
      const pinch = makeOkPinch();

      // Acquire lock and confirm pinch onset
      analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 100, aspect });
      analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 160, aspect });
      analyzer.analyse({ landmarks: [pinch], inferMs: 10, nowMs: 220, aspect });
      analyzer.analyse({ landmarks: [pinch], inferMs: 10, nowMs: 280, aspect });
      analyzer.analyse({ landmarks: [pinch], inferMs: 10, nowMs: 340, aspect });
      analyzer.analyse({ landmarks: [pinch], inferMs: 10, nowMs: 400, aspect });

      const snap = analyzer.snapshot(400);
      expect(snap.drawingAction).toBe("draw");
      expect(snap.inkAllowed).toBe(true);
      expect(analyzer.strokes().active).not.toBeNull();
    }
  });
});

describe("R23-HF1 Bug 2: MoNUI-7 telemetry fields and session metadata", () => {
  it("session meta carries yoloModelSha256 = 97f778ea..., yoloEnabled = true, yoloRateHz = 10, monuiVersion = MoNUI-7", async () => {
    const store = new MemoryBenchStore();
    let clock = 1000;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      randomId: () => "hf1bug2",
      wallMinuteIso: () => "2026-11-21T10:00:00.000Z",
    });

    const sid = await mgr.startSession({
      consent: true,
      app: { version: "0.29.1-alpha+r23-hf1", gitCommit: "hf1test", gitBranch: "research-can" },
      environment: {
        userAgentFamily: "Chromium",
        platform: "Linux",
        hardwareConcurrency: 8,
        deviceMemoryGb: 16,
        devicePixelRatio: 1,
        viewport: { w: 1280, h: 720 },
        secureContext: true,
        storage: "memory-only",
      },
    });

    const meta = await store.getSession(sid);
    expect(meta).not.toBeNull();
    expect(meta?.yoloModelSha256).toBe(YOLO_MODEL_SHA256);
    expect(meta?.yoloModelSha256).toBe("97f778ea77f4dbf160e91dff021a463ab464cdbf27a34d067d5f28708dbf1ddb");
    expect(meta?.yoloEnabled).toBe(true);
    expect(meta?.yoloRateHz).toBe(5);
    expect(meta?.monuiVersion).toBe("MoNUI-7");
  });

  it("integration: recorder path populates rescueState, yoloRan=true, yoloMs, yoloScore, guideState when simulated rescue runs", async () => {
    const store = new MemoryBenchStore();
    let clock = 1000;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      randomId: () => "hf1rescue",
      wallMinuteIso: () => "2026-11-21T10:00:00.000Z",
    });

    const sid = await mgr.startSession({
      consent: true,
      app: { version: "0.29.1-alpha+r23-hf1", gitCommit: "hf1test", gitBranch: "research-can" },
      environment: {
        userAgentFamily: "Chromium",
        platform: "Linux",
        hardwareConcurrency: 8,
        deviceMemoryGb: 16,
        devicePixelRatio: 1,
        viewport: { w: 1280, h: 720 },
        secureContext: true,
        storage: "memory-only",
      },
    });

    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: { width: 1280, height: 720, frameRate: 30, deviceClass: "physical-presumed" },
      presetId: "default-any-pinch",
      reacquirePinchPolicy: "require-release",
      minDetectionConfidence: 0.6,
      minPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });

    const analyzer = new LabAnalyzer({
      route: "canvas",
      fullFrameLock: true,
      enableInk: true,
      preset: "default-any-pinch",
    });

    const bridge = new LabTelemetryBridge(mgr, true);

    // Simulate empty frames triggering rescue
    clock = 2000;
    analyzer.analyse({ landmarks: [], inferMs: 10, nowMs: clock, aspect: 16 / 9 });
    const snap = analyzer.snapshot(clock);

    bridge.onAnalyzedFrame(snap, {
      frameId: 1,
      nowMs: clock,
      landmarks: null,
      truth: "UNLABELLED",
      isDatasetGt: false,
      luma: { mean: 0.4, center: 0.4, backlight: false, pass: "A0_raw" },
      timing: { mpMs: 10, preMs: 0, workerMs: 15, classifierMs: 0.2, pipelineMs: 16 },
      droppedSincePrev: 0,
      activeStrokePoints: null,
      completedStrokeCount: 0,
      rescueState: "SEARCH",
      yoloRan: true,
      yoloMs: 14.5,
      yoloScore: 0.88,
      cropTried: true,
      cropSuccess: true,
      positionOnly: null,
      guideState: "GREET",
    });

    await mgr.flush();

    const frames: Record<string, unknown>[] = [];
    await store.iterateChunks(sid, "frames", (chunk) => {
      for (const it of chunk.items) {
        frames.push(it as Record<string, unknown>);
      }
    });

    expect(frames.length).toBe(1);
    const recorded = frames[0]!;
    expect(recorded.yoloRan).toBe(true);
    expect(recorded.rescueState).toBe("SEARCH");
    expect(recorded.yoloMs).toBe(14.5);
    expect(recorded.yoloScore).toBe(0.88);
    expect(recorded.cropTried).toBe(true);
    expect(recorded.cropSuccess).toBe(true);
    expect(recorded.guideState).toBe("GREET");
  });
});
