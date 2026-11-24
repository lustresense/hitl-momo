// @vitest-environment jsdom
/**
 * R22B Comprehensive Verification & Replay Test Suite (B1.1–B1.10, B2, B3, B4, B7).
 *
 * Covers:
 *  - B1.10 Fixture 1 (`s970_t004_handstate_weaklabels_v1.json`): G1' onset gate blocks 13/13
 *    `FIST_OR_TRANSITION`, 0/44 FIST, 0/110 ONE, 0/186 FIVE, 0/4 TRANSITION while retaining
 *    >= 98% S-970 CLOSED pinch, 100% S-970 OK pinch, and >= 99% T004 pinch.
 *  - B1.10 Fixture 2 (`s970-t002-landmark-replay-v1.json`): full LabAnalyzer + LabTelemetryBridge
 *    replay of Owner session S-970f4cb0-T002 yields 0 STROKE_START inside `undoWindowMs`
 *    ([155800, 168000]), UNDO >= 5 each preceded by ARMED_FIST, and retains all long strokes
 *    (2, 6, 9, 10, 11, 12, 15, 16) outside the undo window.
 *  - B1.2 Onset confirmation (2 frames normal; >= 300 ms time-based post-FIST/ONE/TWO/non-NEUTRAL) + backfill.
 *  - B1.3 Release debounce >= 150 ms (`PINCH_RELEASE_BRIDGED`) + retro-trim on confirmed release.
 *  - B1.4 Fist hold tolerance <= 100 ms flicker & G1'-blocked FIST compatibility.
 *  - B1.5 Strict FIVE when PINCH_OK + FIVE coexist.
 *  - B1.6 `lastCommand` expiry after 1,500 ms or >= 300 ms hand loss.
 *  - B1.7 All 5 K11 CanvasMechanismPresets (`default-any-pinch`, `ok-pinch-only`, `closed-pinch-only`,
 *         `three-imr-action`, `three-mrp-vs-ok`) + `?preset=` URL parsing.
 *  - B1.8 `reacquirePinchPolicy` (`require-release` default vs `allow-after-confirm`).
 *  - B2.5 Guided Capture protocol & 700ms/300ms edge masking (`truthMasked` excluded from GT).
 *  - B3 Export v2.1 schema fields & SHA-256 verification.
 *  - B4.1 `?mdc=&mpc=&mtc=` URL parsing & 0 runtime `setOptions`.
 *  - B7.1 Recalibrated `backlightCandidate` & `GLARE_CANDIDATE >= 25%` + `lastRoiLumaP50`.
 *  - B2/B8.2 UI checks on `/nui-lab/canvas`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  ActionIntentResolver,
  GeometricPinchSource,
  GeometricPoseSource,
} from "@/src/components/nui-lab/bench/action-resolver";
import { LabTelemetryBridge } from "@/src/components/nui-lab/bench/canvas-tracker";
import {
  parseDetectorConfidenceUrlOverride,
  parseLabDevUrlFlags,
  writePersistedBenchConsent,
} from "@/src/components/nui-lab/bench/config";
import { buildEngineConfig } from "@/src/components/nui-lab/bench/engines";
import { verifyExportChecksum } from "@/src/components/nui-lab/bench/export";
import {
  buildGuidedCaptureSteps,
  isGuidedCaptureFrameMasked,
} from "@/src/components/nui-lab/bench/guided-capture-protocol";
import { BenchSessionManager, resetBenchManagerForTest } from "@/src/components/nui-lab/bench/manager";
import {
  CANVAS_PRESETS,
  getCanvasPreset,
  parsePresetUrlOverride,
  parseReacquirePolicyUrlOverride,
} from "@/src/components/nui-lab/bench/presets";
import {
  analyzeFrameLuma,
  isBacklightCandidateR22B,
  isGlareCandidateR22B,
} from "@/src/components/nui-lab/bench/r20-lowlight";
import { LabCpuWorkerClient } from "@/src/components/nui-lab/bench/r20-worker-client";
import { BENCH_EXPORT_SCHEMA, BENCH_EXPORT_SCHEMA_V2_1, BENCH_EXPORT_SCHEMA_V2_2 } from "@/src/components/nui-lab/bench/schema";
import { deriveConditionTags, TrialAggregator } from "@/src/components/nui-lab/bench/stats";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { LabAnalyzer, LAST_COMMAND_HAND_LOST_CLEAR_MS, LAST_COMMAND_TTL_MS } from "@/src/components/nui-lab/lab-analyzer";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";
import { validateR19Model } from "@/src/components/nui-lab/r19/r19_loader";
import type { Landmark } from "@/src/input/types";
import { MEDIAN_SKELETONS, pinchSkeleton, placeHand, type Skeleton } from "../input/realistic-hands";

const WEAKLABELS_PATH = resolve(process.cwd(), "tests/fixtures/s970_t004_handstate_weaklabels_v1.json");
const REPLAY_PATH = resolve(process.cwd(), "tests/fixtures/s970-t002-landmark-replay-v1.json");
const R20_C4_MODEL = validateR19Model(
  JSON.parse(readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"), "utf8")),
);

interface WeakLabelFrame {
  sessionId: string;
  trialId: string;
  t: number;
  captureFrameId: number;
  aspect: number;
  lm: Array<[number, number]>;
  rule: {
    rawPose: string;
    pinchRatio: number | null;
    fingerStates: string[];
    thumbOpen: boolean;
  };
  label: {
    pose: string;
    contact: string;
    variant: "CLOSED" | "OK" | null;
  };
}

interface ReplayFixture {
  sourceTrialId: string;
  totalFrames: number;
  trackedFrames: number;
  undoWindowMs: [number, number];
  originalEvents: Array<{ t: number; type: string; data: Record<string, unknown> }>;
  frames: Array<{
    t: number;
    aspect: number;
    lm: Array<[number, number]> | null;
    captureFrameId: number;
    frameAgeMs: number;
  }>;
}

function toLandmarks(pairs: Array<[number, number]>): Landmark[] {
  return pairs.map(([x, y]) => ({ x, y, z: 0 }));
}

function makeReadyCanvasAnalyzer(opts?: ConstructorParameters<typeof LabAnalyzer>[0]): LabAnalyzer {
  const analyzer = new LabAnalyzer({
    route: "canvas",
    fullFrameLock: true,
    enableInk: true,
    ...opts,
  });
  analyzer.enableR19(R20_C4_MODEL, 0);
  return analyzer;
}

// Realistic 21-point hands anchored on HaGRIDv2 median skeletons (aspect 16:9).
function makeClosedPinch(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(pinchSkeleton(0.08), { cx, cy, aspect: 16 / 9 });
}

function makeOkPinch(cx = 0.5, cy = 0.72): Landmark[] {
  // Start from open palm (MRP clearly extended), then curve thumb + index tips together into an OK ring
  const sk = MEDIAN_SKELETONS.palm.map(([x, y]) => [x, y] as [number, number]);
  sk[3] = [-1.05, 1.08];
  sk[4] = [-0.78, 1.48];
  sk[6] = [-0.62, 1.42];
  sk[7] = [-0.71, 1.50];
  sk[8] = [-0.75, 1.49]; // gap ~ 0.03 spans -> TOUCH, MRP extended -> OK!
  return placeHand(sk as Skeleton, { cx, cy, aspect: 16 / 9 });
}

function makeThreeImr(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(MEDIAN_SKELETONS.three, { cx, cy, aspect: 16 / 9 });
}

function makeThreeMrp(cx = 0.5, cy = 0.72): Landmark[] {
  // Middle, ring, pinky extended (from palm); index curled down toward palm; thumb folded away from index tip (OPEN)
  const sk = MEDIAN_SKELETONS.palm.map(([x, y]) => [x, y] as [number, number]);
  sk[3] = [-0.25, 0.75];
  sk[4] = [0.22, 0.70]; // folded across palm, far from index tip -> OPEN
  sk[6] = [-0.48, 1.25];
  sk[7] = [-0.46, 0.92];
  sk[8] = [-0.44, 0.72]; // index clearly curled, d(4,8) ~ 0.66 spans > 0.50 -> OPEN
  return placeHand(sk as Skeleton, { cx, cy, aspect: 16 / 9 });
}

function makeFist(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(MEDIAN_SKELETONS.fist, { cx, cy, aspect: 16 / 9 });
}

function makeOne(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(MEDIAN_SKELETONS.one, { cx, cy, aspect: 16 / 9 });
}

function makeTwo(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(MEDIAN_SKELETONS.two_up, { cx, cy, aspect: 16 / 9 });
}

function makeFive(cx = 0.5, cy = 0.72): Landmark[] {
  return placeHand(MEDIAN_SKELETONS.palm, { cx, cy, aspect: 16 / 9 });
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  writePersistedBenchConsent(false);
  resetBenchManagerForTest(null);
});

describe("R22B B1.10 Fixture 1: G1' Pinch Onset Gate on s970_t004_handstate_weaklabels_v1.json", () => {
  it("blocks 13/13 FIST_OR_TRANSITION and 100% of FIST/ONE/FIVE/TRANSITION while keeping >=98% S-970 CLOSED, 100% S-970 OK, >=99% T004", () => {
    const raw = JSON.parse(readFileSync(WEAKLABELS_PATH, "utf8")) as { frames: WeakLabelFrame[] };
    const pinchSrc = new GeometricPinchSource();
    const counts = new Map<string, { total: number; allowed: number }>();

    for (const f of raw.frames) {
      const lm = toLandmarks(f.lm);
      // Evaluate G1' gate directly via GeometricPinchSource (exact parity with eval_fist_pinch_gate.py:
      // mid-stroke frames may sit in hold-hysteresis band 0.30..0.42, so test rule_pinch && gate.passed,
      // AND separately verify GeometricPinchSource.evaluate(..., held=false).contact blocks 100% of negatives).
      const readingOnset = pinchSrc.evaluate(lm, f.aspect, f.t, false);
      const allowedGate = f.rule.rawPose === "pinch" && readingOnset.gate.passed;
      const key = `${f.trialId}:${f.label.pose}/${f.label.contact}/${f.label.variant ?? "None"}`;
      const bucket = counts.get(key) ?? { total: 0, allowed: 0 };
      bucket.total++;
      if (allowedGate) bucket.allowed++;
      counts.set(key, bucket);

      // Negatives must also have readingOnset.contact === false
      if (f.label.pose !== "PINCH") {
        expect(readingOnset.contact, `onset contact must be false on ${key} @ t=${f.t}`).toBe(false);
      }
    }

    const getBucket = (k: string) => {
      const b = counts.get(k);
      expect(b, `missing bucket ${k}`).toBeDefined();
      return b!;
    };

    // Mandatory B1.10 assertions
    const fistOrTrans = getBucket("S-970f4cb0-T002:FIST_OR_TRANSITION/NOT_PINCH/None");
    expect(fistOrTrans.total).toBe(13);
    expect(fistOrTrans.allowed).toBe(0);

    expect(getBucket("S-970f4cb0-T002:FIST/NONE/None").allowed).toBe(0);
    expect(getBucket("S-970f4cb0-T002:ONE/OPEN/None").allowed).toBe(0);
    expect(getBucket("S-970f4cb0-T002:FIVE/OPEN/None").allowed).toBe(0);
    expect(getBucket("S-970f4cb0-T002:TRANSITION/NOT_PINCH/None").allowed).toBe(0);

    const s970Closed = getBucket("S-970f4cb0-T002:PINCH/TOUCH/CLOSED");
    expect(s970Closed.allowed / s970Closed.total).toBeGreaterThanOrEqual(0.98);

    const s970Ok = getBucket("S-970f4cb0-T002:PINCH/TOUCH/OK");
    expect(s970Ok.allowed / s970Ok.total).toBe(1.0);

    const t004Closed = getBucket("S-07ba0cde-T004:PINCH/TOUCH/CLOSED");
    const t004None = getBucket("S-07ba0cde-T004:PINCH/TOUCH/None");
    expect((t004Closed.allowed + t004None.allowed) / (t004Closed.total + t004None.total)).toBeGreaterThanOrEqual(0.99);
  });
});

describe("R22B B1.10 Fixture 2 & B3: Full S-970 T002 Landmark Replay + Export v2.1 Verification", () => {
  it("produces 0 STROKE_START inside undoWindowMs, >= 5 UNDO each preceded by ARMED_FIST, retains long strokes, and exports valid v2.1 JSON", async () => {
    const fixture = JSON.parse(readFileSync(REPLAY_PATH, "utf8")) as ReplayFixture;
    const [undoStart, undoEnd] = fixture.undoWindowMs;

    const store = new MemoryBenchStore();
    let clock = 0;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      randomId: () => "r22bs970",
      wallMinuteIso: () => "2026-11-20T03:00:00.000Z",
    });
    await mgr.startSession({
      consent: true,
      app: { version: "0.29.1-alpha+r22b", gitCommit: "r22btest", gitBranch: "r22b-handstate" },
      environment: {
        userAgentFamily: "Chromium",
        platform: "Linux",
        hardwareConcurrency: 4,
        deviceMemoryGb: 8,
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

    const analyzer = makeReadyCanvasAnalyzer({ preset: "default-any-pinch" });
    const bridge = new LabTelemetryBridge(mgr, true);

    const strokeWindows: Array<{ startT: number; endT: number; points: number }> = [];
    let openStart: number | null = null;
    let openPts = 0;
    const undoEvents: Array<{ t: number; armedBefore: boolean }> = [];
    let lastArmedT = -Infinity;
    let lastCmdAtMs: number | null = null;

    for (const f of fixture.frames) {
      clock = f.t;
      const lm = f.lm ? [toLandmarks(f.lm)] : [];
      analyzer.analyse({
        landmarks: lm,
        inferMs: 12,
        nowMs: f.t,
        aspect: f.aspect,
        captureFrameId: f.captureFrameId,
        frameAgeMs: Math.min(f.frameAgeMs, 140),
        isStale: false,
      });
      const snap = analyzer.snapshot(f.t);
      const st = analyzer.strokes();

      if (snap.undoRedoFsmState === "ARMED_FIST") {
        lastArmedT = f.t;
      }
      if (snap.diag.lastCommand && snap.diag.lastCommand.atMs !== lastCmdAtMs) {
        lastCmdAtMs = snap.diag.lastCommand.atMs;
        if (snap.diag.lastCommand.kind === "undo") {
          undoEvents.push({ t: f.t, armedBefore: f.t - lastArmedT <= 2500 });
        }
      }

      if (st.active && openStart === null) {
        openStart = f.t;
        openPts = st.active.length;
      } else if (st.active && openStart !== null) {
        openPts = Math.max(openPts, st.active.length);
      } else if (!st.active && openStart !== null) {
        strokeWindows.push({ startT: openStart, endT: f.t, points: openPts });
        openStart = null;
        openPts = 0;
      }

      bridge.onAnalyzedFrame(snap, {
        frameId: f.captureFrameId,
        nowMs: f.t,
        landmarks: lm[0] ?? null,
        truth: "UNLABELLED",
        luma: { mean: 0.5, center: 0.45, backlight: false, pass: "A0_raw", clippedPct: 2.1, handRoiLumaP50: 0.48 },
        timing: { mpMs: 12, preMs: 0.2, workerMs: 14, classifierMs: 0.1, pipelineMs: 15 },
        droppedSincePrev: 0,
        activeStrokePoints: st.active,
        completedStrokeCount: st.completed.length,
        captureFrameId: f.captureFrameId,
        processedFrameId: f.captureFrameId,
        captureTimestampMs: f.t,
        displayTimestampMs: f.t,
        frameAgeMs: Math.min(f.frameAgeMs, 140),
        mpRawHandCount: lm.length,
        mpHandednessScores: lm.length ? [0.95] : [],
      });
    }
    if (openStart !== null) {
      strokeWindows.push({ startT: openStart, endT: fixture.frames[fixture.frames.length - 1]!.t, points: openPts });
    }

    mgr.endTrial("camera-stop");
    await mgr.finishSession("user-finish");

    const blobText = await readBlobText(await mgr.exportAll({ version: "0.29.1-alpha+r22b", gitCommit: "r22btest" }));
    const parsed = JSON.parse(blobText);
    expect(parsed.schema).toBe(BENCH_EXPORT_SCHEMA);
    expect(parsed.schemaVersion).toBe(BENCH_EXPORT_SCHEMA_V2_2);
    expect((await verifyExportChecksum(blobText)).ok).toBe(true);

    const events = parsed.sessions[0].events as Array<{ t: number; type: string; detail: Record<string, unknown> }>;
    const strokeStartsInUndoWindow = events.filter(
      (e) => e.type === "STROKE_START" && e.t >= undoStart && e.t <= undoEnd,
    );
    expect(strokeStartsInUndoWindow).toHaveLength(0);

    // >= 5 UNDO fired, each preceded by ARMED_FIST
    expect(undoEvents.length).toBeGreaterThanOrEqual(5);
    expect(undoEvents.every((u) => u.armedBefore)).toBe(true);

    // All long strokes from original S-970 T002 (2, 6, 9, 10, 11, 12, 15, 16) still overlap real recorded strokes!
    const origStarts = new Map<number, number>();
    const origEnds = new Map<number, number>();
    for (const ev of fixture.originalEvents) {
      const sid = Number(ev.data?.strokeId);
      if (ev.type === "STROKE_START") origStarts.set(sid, ev.t);
      if (ev.type === "STROKE_END") origEnds.set(sid, ev.t);
    }
    for (const longId of [2, 6, 9, 10, 11, 12, 15, 16]) {
      const s0 = origStarts.get(longId)!;
      const s1 = origEnds.get(longId)!;
      const matched = strokeWindows.some((w) => w.startT <= s1 && w.endT >= s0);
      expect(matched, `long stroke #${longId} [${s0}..${s1}] should still be produced`).toBe(true);
    }

    // Verify v2.1 TrialMeta & per-frame fields exist
    const trialMeta = parsed.sessions[0].trials[0].meta;
    expect(trialMeta.presetId).toBe("default-any-pinch");
    expect(trialMeta.reacquirePinchPolicy).toBe("require-release");
    expect(trialMeta.detectorConfig.minDetectionConfidence).toBe(0.6);
    const sampleHandFrame = parsed.sessions[0].frames.find((fr: { det: string }) => fr.det === "HAND");
    expect(sampleHandFrame.pinchGate).toBeTruthy();
    expect(sampleHandFrame.handState).toBeTruthy();
    expect(sampleHandFrame.mpRawHandCount).toBe(1);
    expect(sampleHandFrame.clippedPct).toBe(2.1);
  });
});

describe("R22B B1.2–B1.8 Core Resolver & StrokeDriver Invariants", () => {
  it("B1.2: requires 2 consecutive frames for normal onset and backfills point 1; enforces >= 300 ms hold post-FIST", () => {
    const anyPinchOpts = { preset: "default-any-pinch" };
    const analyzer = makeReadyCanvasAnalyzer(anyPinchOpts);
    const aspect = 16 / 9;
    const five = makeFive();
    const pinch1 = makeClosedPinch(0.45, 0.72);
    const pinch2 = makeClosedPinch(0.48, 0.72);

    // Lock hand with FIVE first (3 frames so fullFrameLock confirms locked & arms draw)
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 100, aspect });
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 160, aspect });
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 220, aspect });

    // Frame 1 of pinch: PENDING (no stroke started yet)
    analyzer.analyse({ landmarks: [pinch1], inferMs: 10, nowMs: 300, aspect });
    let snap = analyzer.snapshot(300);
    expect(snap.actionResolution.pinchOnset).toBe("PENDING");
    expect(analyzer.strokes().active).toBeNull();

    // Frame 2 of pinch: CONFIRMED and backfills pending point -> >= 2 points immediately!
    analyzer.analyse({ landmarks: [pinch2], inferMs: 10, nowMs: 360, aspect });
    snap = analyzer.snapshot(360);
    expect(snap.actionIntent).toBe("DRAW");
    expect(snap.actionResolution.onsetConfirmedMeta).not.toBeNull();
    expect(snap.lastBackfilledPoints).toBeGreaterThanOrEqual(1);
    expect(analyzer.strokes().active?.length).toBeGreaterThanOrEqual(2);

    // Now test post-FIST 300 ms onset guard
    const a2 = makeReadyCanvasAnalyzer(anyPinchOpts);
    const fist = makeFist();
    a2.analyse({ landmarks: [five], inferMs: 10, nowMs: 900, aspect });
    a2.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1000, aspect });
    a2.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1080, aspect });
    a2.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1200, aspect }); // ARMED_FIST

    // R23-HF2: Updated post-FIST onset hold requirement from 300ms to 200ms per FX13 tuning (0/16 onset >= 330ms, 0 false strokes).
    // Within 400 ms after FIST, pinch for 100 ms (< 200 ms) must stay PENDING / NOT draw
    a2.analyse({ landmarks: [pinch1], inferMs: 10, nowMs: 1260, aspect });
    a2.analyse({ landmarks: [pinch2], inferMs: 10, nowMs: 1360, aspect });
    expect(a2.strokes().active).toBeNull();

    // Once sustained >= 200 ms (1260 -> 1480 ms), onset confirms!
    a2.analyse({ landmarks: [pinch2], inferMs: 10, nowMs: 1480, aspect });
    expect(a2.snapshot(1480).actionIntent).toBe("DRAW");
    expect(a2.strokes().active).not.toBeNull();

    // Regression (review finding #3): onset starting at +320 ms after FIST (still within 400 ms window)
    // must latch the 200 ms guard and NOT confirm prematurely at +450 ms (only 130 ms held)!
    const a3 = makeReadyCanvasAnalyzer(anyPinchOpts);
    a3.analyse({ landmarks: [five], inferMs: 10, nowMs: 850, aspect });
    a3.analyse({ landmarks: [five], inferMs: 10, nowMs: 900, aspect });
    a3.analyse({ landmarks: [fist], inferMs: 10, nowMs: 950, aspect });
    a3.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1000, aspect });
    a3.analyse({ landmarks: [five], inferMs: 10, nowMs: 1120, aspect }); // NEUTRAL FSM, lastFistOrFsmGuardMs=1000
    a3.analyse({ landmarks: [pinch1], inferMs: 10, nowMs: 1320, aspect }); // +320ms <= 400ms -> latched guarded!
    a3.analyse({ landmarks: [pinch2], inferMs: 10, nowMs: 1450, aspect }); // +450ms > 400ms, only 130ms held -> MUST NOT draw!
    expect(a3.strokes().active).toBeNull();
    a3.analyse({ landmarks: [pinch2], inferMs: 10, nowMs: 1540, aspect }); // 220ms held >= 200ms -> confirms!
    expect(a3.snapshot(1540).actionIntent).toBe("DRAW");
  });

  it("B1.3: bridges brief <150ms pinch release without splitting stroke, and retro-trims confirmed >=150ms release", () => {
    const analyzer = makeReadyCanvasAnalyzer({ preset: "default-any-pinch" });
    const aspect = 16 / 9;
    const p1 = makeClosedPinch(0.45, 0.72);
    const p2 = makeClosedPinch(0.47, 0.72);
    const p3 = makeClosedPinch(0.50, 0.72);
    const open = makeFive(0.50, 0.72);

    // Lock and confirm draw
    analyzer.analyse({ landmarks: [open], inferMs: 10, nowMs: 100, aspect });
    analyzer.analyse({ landmarks: [open], inferMs: 10, nowMs: 160, aspect });
    analyzer.analyse({ landmarks: [p1], inferMs: 10, nowMs: 220, aspect });
    analyzer.analyse({ landmarks: [p2], inferMs: 10, nowMs: 280, aspect });
    expect(analyzer.strokes().active).not.toBeNull();

    // Brief drop for 70 ms (< 150 ms) then back to pinch -> bridged, 0 completed splits!
    analyzer.analyse({ landmarks: [open], inferMs: 10, nowMs: 340, aspect });
    expect(analyzer.strokes().completed).toHaveLength(0);
    analyzer.analyse({ landmarks: [p3], inferMs: 10, nowMs: 410, aspect });
    const bridgedSnap = analyzer.snapshot(410);
    expect(bridgedSnap.actionResolution.releaseBridgedGapMs).not.toBeNull();
    expect(analyzer.strokes().completed).toHaveLength(0);
    expect(analyzer.strokes().active).not.toBeNull();

    // Genuine release for >= 150 ms -> closes stroke and retro-trims tail points
    analyzer.analyse({ landmarks: [open], inferMs: 10, nowMs: 470, aspect });
    analyzer.analyse({ landmarks: [open], inferMs: 10, nowMs: 540, aspect });
    analyzer.analyse({ landmarks: [open], inferMs: 10, nowMs: 650, aspect }); // 650 - 470 = 180 ms >= 150 ms
    const endSnap = analyzer.snapshot(650);
    expect(analyzer.strokes().active).toBeNull();
    expect(analyzer.strokes().completed).toHaveLength(1);
    expect(endSnap.lastRetroTrimmedPoints).toBeGreaterThanOrEqual(1);
  });

  it("B1.4 & B1.6: tolerates <=100ms flicker during fist arming and expires lastCommand after 1500ms or 300ms hand loss", () => {
    const analyzer = makeReadyCanvasAnalyzer({ preset: "default-any-pinch" });
    const aspect = 16 / 9;
    const fist = makeFist();
    const one = makeOne();
    const two = makeTwo();
    const five = makeFive();
    const threeImr = makeThreeImr(); // non-ONE/TWO/FIVE transient flicker

    // Lock hand & draw one stroke so undo changes store
    const p1 = makeClosedPinch(0.4, 0.72);
    const p2 = makeClosedPinch(0.5, 0.72);
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 100, aspect });
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 160, aspect });
    analyzer.analyse({ landmarks: [p1], inferMs: 10, nowMs: 220, aspect });
    analyzer.analyse({ landmarks: [p2], inferMs: 10, nowMs: 280, aspect });
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 360, aspect });
    analyzer.analyse({ landmarks: [five], inferMs: 10, nowMs: 560, aspect });
    expect(analyzer.strokes().completed.length).toBe(1);

    // Fist arming with a 60 ms brief OTHER flicker (<= 100 ms tolerance) must stay intact and arm!
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1000, aspect });
    analyzer.analyse({ landmarks: [threeImr], inferMs: 10, nowMs: 1060, aspect }); // 60 ms OTHER flicker
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1120, aspect });
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 1200, aspect });
    expect(analyzer.snapshot(1200).undoRedoFsmState).toBe("ARMED_FIST");

    // Transition to ONE -> UNDO fires
    analyzer.analyse({ landmarks: [one], inferMs: 10, nowMs: 1260, aspect });
    analyzer.analyse({ landmarks: [one], inferMs: 10, nowMs: 1450, aspect });
    expect(analyzer.snapshot(1450).diag.lastCommand?.kind).toBe("undo");
    expect(analyzer.strokes().completed.length).toBe(0);

    // B1.6 TTL expiry after 1,500 ms
    expect(analyzer.snapshot(1450 + LAST_COMMAND_TTL_MS - 10).diag.lastCommand).not.toBeNull();
    expect(analyzer.snapshot(1450 + LAST_COMMAND_TTL_MS + 10).diag.lastCommand).toBeNull();

    // Re-trigger Redo (step frames continuously so FullFrameHandLock stays locked & fist arms >= 150ms) and test hand-lost >= 300 ms expiry
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 3400, aspect });
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 3460, aspect });
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 3560, aspect });
    analyzer.analyse({ landmarks: [fist], inferMs: 10, nowMs: 3720, aspect });
    expect(analyzer.snapshot(3720).undoRedoFsmState).toBe("ARMED_FIST");
    analyzer.analyse({ landmarks: [two], inferMs: 10, nowMs: 3780, aspect });
    analyzer.analyse({ landmarks: [two], inferMs: 10, nowMs: 3960, aspect });
    expect(analyzer.snapshot(3960).diag.lastCommand?.kind).toBe("redo");
    analyzer.analyse({ landmarks: [], inferMs: 10, nowMs: 4000, aspect });
    expect(analyzer.snapshot(4000 + LAST_COMMAND_HAND_LOST_CLEAR_MS + 20).diag.lastCommand).toBeNull();
  });

  it("B1.5 & B1.7: enforces strict FIVE and all 5 K11 CanvasMechanismPresets cleanly", () => {
    expect(CANVAS_PRESETS).toHaveLength(5);
    expect(parsePresetUrlOverride("?preset=ok-pinch-only").preset.id).toBe("ok-pinch-only");
    expect(parsePresetUrlOverride("?preset=bogus").preset.id).toBe("ok-pinch-only");
    expect(parseReacquirePolicyUrlOverride("?reacquire=allow-after-confirm").policy).toBe("allow-after-confirm");
    expect(parseReacquirePolicyUrlOverride("").policy).toBe("require-release");

    const aspect = 16 / 9;
    const closedPinch = makeClosedPinch();
    const okPinch = makeOkPinch();
    const threeImr = makeThreeImr();
    const threeMrp = makeThreeMrp();
    const five = makeFive();

    // 1. ok-pinch-only blocks CLOSED pinch, allows OK pinch, never confuses OK pinch with FIVE
    const aOk = makeReadyCanvasAnalyzer({ preset: "ok-pinch-only" });
    aOk.analyse({ landmarks: [five], inferMs: 10, nowMs: 100, aspect });
    aOk.analyse({ landmarks: [five], inferMs: 10, nowMs: 160, aspect });
    aOk.analyse({ landmarks: [closedPinch], inferMs: 10, nowMs: 220, aspect });
    aOk.analyse({ landmarks: [closedPinch], inferMs: 10, nowMs: 280, aspect });
    expect(aOk.strokes().active).toBeNull();
    expect(aOk.snapshot(280).actionResolution.onsetBlockedReason).toBe("blocked-by-preset-variant");

    aOk.analyse({ landmarks: [okPinch], inferMs: 10, nowMs: 400, aspect });
    aOk.analyse({ landmarks: [okPinch], inferMs: 10, nowMs: 460, aspect });
    expect(aOk.snapshot(460).actionIntent).toBe("DRAW");
    expect(aOk.snapshot(460).actionIntent).not.toBe("ERASE");

    // 2. closed-pinch-only blocks OK pinch, allows CLOSED pinch
    const aClosed = makeReadyCanvasAnalyzer({ preset: "closed-pinch-only" });
    aClosed.analyse({ landmarks: [five], inferMs: 10, nowMs: 100, aspect });
    aClosed.analyse({ landmarks: [five], inferMs: 10, nowMs: 160, aspect });
    aClosed.analyse({ landmarks: [okPinch], inferMs: 10, nowMs: 220, aspect });
    aClosed.analyse({ landmarks: [okPinch], inferMs: 10, nowMs: 280, aspect });
    expect(aClosed.strokes().active).toBeNull();
    expect(aClosed.snapshot(280).actionResolution.onsetBlockedReason).toBe("blocked-by-preset-variant");

    // 3. three-imr-action triggers THREE_ACTION on IMR and NOT on MRP
    const aImr = makeReadyCanvasAnalyzer({ preset: "three-imr-action" });
    aImr.analyse({ landmarks: [five], inferMs: 10, nowMs: 50, aspect });
    aImr.analyse({ landmarks: [threeMrp], inferMs: 10, nowMs: 120, aspect });
    aImr.analyse({ landmarks: [threeMrp], inferMs: 10, nowMs: 220, aspect });
    aImr.analyse({ landmarks: [threeMrp], inferMs: 10, nowMs: 360, aspect });
    expect(aImr.snapshot(360).actionIntent).not.toBe("THREE_ACTION");

    aImr.analyse({ landmarks: [threeImr], inferMs: 10, nowMs: 450, aspect });
    aImr.analyse({ landmarks: [threeImr], inferMs: 10, nowMs: 550, aspect });
    aImr.analyse({ landmarks: [threeImr], inferMs: 10, nowMs: 650, aspect });
    expect(aImr.snapshot(650).actionIntent).toBe("THREE_ACTION");

    // 4. three-mrp-vs-ok triggers THREE_ACTION on MRP without drawing
    const aMrp = makeReadyCanvasAnalyzer({ preset: getCanvasPreset("three-mrp-vs-ok") });
    aMrp.analyse({ landmarks: [five], inferMs: 10, nowMs: 50, aspect });
    aMrp.analyse({ landmarks: [threeMrp], inferMs: 10, nowMs: 120, aspect });
    aMrp.analyse({ landmarks: [threeMrp], inferMs: 10, nowMs: 220, aspect });
    aMrp.analyse({ landmarks: [threeMrp], inferMs: 10, nowMs: 320, aspect });
    expect(aMrp.snapshot(320).actionIntent).toBe("THREE_ACTION");
    expect(aMrp.strokes().active).toBeNull();
  });

  it("B1.8: compares reacquirePinchPolicy require-release vs allow-after-confirm cleanly", () => {
    const aspect = 16 / 9;
    const pinch = makeClosedPinch(0.5, 0.72);
    const five = makeFive(0.5, 0.72);
    const runScenario = (policy: "require-release" | "allow-after-confirm") => {
      const resolver = new ActionIntentResolver({
        pinchSource: new GeometricPinchSource(),
        poseSource: new GeometricPoseSource(),
        config: { reacquirePinchPolicy: policy, presetId: "default-any-pinch" },
      });
      const base = {
        route: "canvas" as const,
        aspect,
        modelReady: true,
        ambiguousHold: false,
        lockReason: null,
        hasActiveStroke: false,
        isErasing: false,
        requireFreshHandRearm: true,
      };
      // Initial draw
      resolver.resolve({ ...base, nowMs: 100, landmarks: five, ownerLocked: true, acquisitionId: 1 });
      resolver.resolve({ ...base, nowMs: 160, landmarks: pinch, ownerLocked: true, acquisitionId: 1 });
      resolver.resolve({ ...base, nowMs: 220, landmarks: pinch, ownerLocked: true, acquisitionId: 1 });
      // Hand lost for 600 ms (> maxResumeGapMs 360 ms, <= 1500 ms)
      resolver.resolve({ ...base, nowMs: 280, landmarks: undefined, ownerLocked: false, lockReason: "temporary-loss", acquisitionId: 1 });
      resolver.resolve({ ...base, nowMs: 700, landmarks: undefined, ownerLocked: false, lockReason: "empty-reset", acquisitionId: 1 });
      // Hand returns still pinched at same position for 4 frames (new acquisitionId = 2)
      let lastRes = resolver.resolve({ ...base, nowMs: 880, landmarks: pinch, ownerLocked: true, acquisitionId: 2 });
      lastRes = resolver.resolve({ ...base, nowMs: 940, landmarks: pinch, ownerLocked: true, acquisitionId: 2 });
      lastRes = resolver.resolve({ ...base, nowMs: 1000, landmarks: pinch, ownerLocked: true, acquisitionId: 2 });
      lastRes = resolver.resolve({ ...base, nowMs: 1060, landmarks: pinch, ownerLocked: true, acquisitionId: 2 });
      lastRes = resolver.resolve({ ...base, nowMs: 1120, landmarks: pinch, ownerLocked: true, acquisitionId: 2 });
      return lastRes;
    };

    const strict = runScenario("require-release");
    expect(strict.allowDrawMutation).toBe(false);
    expect(strict.onsetBlockedReason).toBe("blocked-by-reacquire-policy");

    const relaxed = runScenario("allow-after-confirm");
    expect(relaxed.actionIntent).toBe("DRAW");
    expect(relaxed.allowDrawMutation).toBe(true);

    // Regression (review finding #1): teleporting > 12% diagonal during loss MUST stay blocked on frame 2..5!
    const pinchFar = makeClosedPinch(0.85, 0.72);
    const rTeleport = new ActionIntentResolver({
      pinchSource: new GeometricPinchSource(),
      poseSource: new GeometricPoseSource(),
      config: { reacquirePinchPolicy: "allow-after-confirm", presetId: "default-any-pinch" },
    });
    const base = {
      route: "canvas" as const,
      aspect,
      modelReady: true,
      ambiguousHold: false,
      lockReason: null,
      hasActiveStroke: false,
      isErasing: false,
      requireFreshHandRearm: true,
    };
    rTeleport.resolve({ ...base, nowMs: 100, landmarks: five, ownerLocked: true, acquisitionId: 1 });
    rTeleport.resolve({ ...base, nowMs: 160, landmarks: pinch, ownerLocked: true, acquisitionId: 1 });
    rTeleport.resolve({ ...base, nowMs: 220, landmarks: pinch, ownerLocked: true, acquisitionId: 1 });
    rTeleport.resolve({ ...base, nowMs: 280, landmarks: undefined, ownerLocked: false, lockReason: "temporary-loss", acquisitionId: 1 });
    rTeleport.resolve({ ...base, nowMs: 700, landmarks: undefined, ownerLocked: false, lockReason: "empty-reset", acquisitionId: 1 });
    let farRes = rTeleport.resolve({ ...base, nowMs: 880, landmarks: pinchFar, ownerLocked: true, acquisitionId: 2 });
    for (const t of [940, 1000, 1060, 1120]) {
      farRes = rTeleport.resolve({ ...base, nowMs: t, landmarks: pinchFar, ownerLocked: true, acquisitionId: 2 });
    }
    expect(farRes.allowDrawMutation).toBe(false);
    expect(farRes.onsetBlockedReason).toBe("blocked-by-reacquire-policy");
  });
});

describe("R22B B2.5, B4, B7 & UI Contracts", () => {
  it("B2.5: Guided capture protocol has 100 P1 steps, masks first 700ms & last 300ms, and excludes masked frames from GT stats", () => {
    const p1Steps = buildGuidedCaptureSteps("p1-full");
    expect(p1Steps).toHaveLength(12 * 6 + 7 + 7 * 3);
    expect(isGuidedCaptureFrameMasked(0, 6000)).toBe(true);
    expect(isGuidedCaptureFrameMasked(699, 6000)).toBe(true);
    expect(isGuidedCaptureFrameMasked(700, 6000)).toBe(false);
    expect(isGuidedCaptureFrameMasked(5699, 6000)).toBe(false);
    expect(isGuidedCaptureFrameMasked(5700, 6000)).toBe(true);

    // TrialAggregator ignores truthMasked frames for independentGroundTruthAvailable
    const agg = new TrialAggregator("T-mask", "camera-stop", "canvas");
    agg.addFrame({
      t: 100,
      fid: 1,
      trialId: "T-mask",
      det: "HAND",
      lm: Array.from({ length: 21 }, () => [0.5, 0.5] as [number, number]),
      session: 1,
      lock: "locked",
      aspect: 1.77,
      rawPose: "fist",
      stablePose: "fist",
      fingers: 0,
      fingersLegacy: 0,
      fingerStates: ["curled", "curled", "curled", "curled"],
      thumb: null,
      pinchRatio: 0.4,
      r19State: "OTHER",
      r19SubClass: "fist",
      vkeyEvent: "NONE",
      r19Probs: null,
      truth: "FIST",
      truthMasked: true,
      labelSource: "DATASET_GT",
      labelSources: { truth: "DATASET_GT", posePred: "RULE_DERIVED", actionIntent: "RULE_DERIVED", captureQuality: "RULE_DERIVED" },
      reject: "ok",
      action: "none",
      hands: 1,
      farHands: 0,
      luma: { mean: 0.5, center: 0.5, backlight: false, pass: "A0_raw" },
      timing: { mpMs: 10, preMs: 0, workerMs: 12, classifierMs: 0.1, pipelineMs: 13 },
      top3: null,
      direction: "NEUTRAL",
      geometry: { pinchActive: false, eraseActive: false, swipe: null, thumbUp: false, isPinch: false },
      fsm: { state: "IDLE", event: "NONE", zone: "stop", left: false, right: false, jump: false, releaseReason: null },
      rejectDetail: "ok",
      jitter: null,
      droppedSincePrev: 0,
    });
    expect(agg.summary().independentGroundTruthAvailable).toBe(false);
  });

  it("B4.1: parses & clamps ?mdc=&mpc=&mtc= and forwards them once at worker INIT with 0 runtime setOptions", async () => {
    const parsed = parseDetectorConfidenceUrlOverride("?mdc=0.5&mpc=0.35&mtc=0.35");
    expect(parsed.minDetectionConfidence).toBe(0.5);
    expect(parsed.minPresenceConfidence).toBe(0.35);
    expect(parsed.minTrackingConfidence).toBe(0.35);
    expect(parsed.confidenceOverride).toBe("url:?mdc=0.5&mpc=0.35&mtc=0.35");

    const clamped = parseDetectorConfidenceUrlOverride("?mdc=0.05&mpc=1.5&mtc=abc");
    expect(clamped.minDetectionConfidence).toBe(0.2);
    expect(clamped.minPresenceConfidence).toBe(0.9);
    expect(clamped.minTrackingConfidence).toBe(0.45);

    expect(parseLabDevUrlFlags("?capture=1&rawrec=1&camdev=1")).toEqual({
      captureMode: true,
      rawRecMode: true,
      camDevMode: true,
    });
    expect(parseLabDevUrlFlags("")).toEqual({
      captureMode: false,
      rawRecMode: false,
      camDevMode: false,
    });

    const posted: unknown[] = [];
    const fakeWorker = {
      onmessage: null as ((ev: MessageEvent) => void) | null,
      onerror: null as ((ev: ErrorEvent) => void) | null,
      postMessage: (msg: { type: string; sessionEpoch: number }) => {
        posted.push(msg);
        if (msg.type === "INIT") {
          setTimeout(() => {
            fakeWorker.onmessage?.({
              data: {
                type: "READY",
                sessionEpoch: msg.sessionEpoch,
                delegate: "CPU",
                numHandsActive: 2,
                initSetOptionsCalls: 0,
                runtimeSetOptionsCalls: 0,
              },
            } as MessageEvent);
          }, 0);
        }
      },
      terminate: vi.fn(),
    } as unknown as Worker;

    const client = new LabCpuWorkerClient({
      wasmRoot: "/wasm",
      modelUrl: "/model.task",
      preprocess: "raw",
      minDetectionConfidence: 0.5,
      minPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
      createWorker: () => fakeWorker,
      onResult: () => undefined,
    });
    await client.init();
    const initMsg = posted[0] as Record<string, unknown>;
    expect(initMsg.type).toBe("INIT");
    expect(initMsg.minDetectionConfidence).toBe(0.5);
    expect(initMsg.minPresenceConfidence).toBe(0.35);
    expect(initMsg.minTrackingConfidence).toBe(0.35);
    expect(client.getTelemetry().runtimeSetOptionsCalls).toBe(0);
    client.close("test-done");
  });

  it("B7.1: recalibrated backlightCandidate & GLARE_CANDIDATE eliminate S-970 99-100% false positives and compute lastRoiLumaP50", () => {
    expect(isBacklightCandidateR22B(12.0, 0.28, null)).toBe(true);
    expect(isBacklightCandidateR22B(12.0, 0.52, null)).toBe(false); // well-lit hand -> NOT backlit!
    expect(isBacklightCandidateR22B(3.0, 0.25, null)).toBe(false); // no bright clipped background -> dim, not backlit
    expect(isBacklightCandidateR22B(15.0, null, 0.25)).toBe(true); // lost frame with dark last ROI + bright window

    expect(isGlareCandidateR22B(15.0)).toBe(false);
    expect(isGlareCandidateR22B(25.0)).toBe(true);
    expect(
      deriveConditionTags({ lumaP50: 0.45, lumaP95: 0.99, nearWhiteHandPct: 14.0, blurProxy: null, noiseProxy: null, backlight: false }),
    ).not.toContain("GLARE_CANDIDATE");
    expect(
      deriveConditionTags({ lumaP50: 0.45, lumaP95: 0.70, nearWhiteHandPct: 26.5, blurProxy: null, noiseProxy: null, backlight: false }),
    ).toContain("GLARE_CANDIDATE");

    // Verify analyzeFrameLuma computes clippedPct, handRoiLumaP50, and lastRoiLumaP50 on RGBA buffer
    const w = 40;
    const h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Top strip bright clipped window (25% of frame), center dark hand ROI (luma ~ 0.20)
        const v = y < 10 ? 252 : 51;
        rgba[i] = v;
        rgba[i + 1] = v;
        rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    const roi = { minX: 0.35, minY: 0.4, maxX: 0.65, maxY: 0.7 };
    const diagWithHand = analyzeFrameLuma(rgba, w, h, { step: 1, handRoi: roi });
    expect(diagWithHand.clippedPct).toBeGreaterThanOrEqual(20);
    expect(diagWithHand.handRoiLumaP50).toBeLessThanOrEqual(0.25);
    expect(diagWithHand.lastRoiLumaP50).toBeNull();
    expect(diagWithHand.isBacklight).toBe(true);

    const diagLost = analyzeFrameLuma(rgba, w, h, { step: 1, handRoi: null, lastHandRoi: roi });
    expect(diagLost.handRoiLumaP50).toBeNull();
    expect(diagLost.lastRoiLumaP50).not.toBeNull();
    expect(diagLost.lastRoiLumaP50!).toBeLessThanOrEqual(0.35);
    expect(diagLost.isBacklight).toBe(true);
  });

  it("B2 & B8.2: Canvas UI renders preset selector, compositional HUD, r22b version badge, and hides dev panels by default", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    render(<NuiLabPage variant="canvas" />);
    expect(screen.getByTestId("canvas-preset-selector")).toBeTruthy();
    expect(screen.getByTestId("lab-compositional-hud").textContent).toContain("Kontak:");
    expect(screen.getByTestId("nui-lab-version-badge").textContent).toContain("r22b");
    expect(screen.queryByTestId("guided-capture-panel")).toBeNull();
    expect(screen.queryByTestId("rawrec-panel")).toBeNull();
    expect(screen.queryByTestId("camdev-panel")).toBeNull();
  });
});
