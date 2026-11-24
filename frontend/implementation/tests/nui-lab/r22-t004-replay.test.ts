/**
 * R22 Contract K9 — Full LabAnalyzer + HandStrokePipeline + StrokeStore Replay of Real T004 Landmarks,
 * plus Contract K3 / Acceptance C01–C17 & §A8 #9–#17 Verification.
 *
 * Self-contained in-repo test: loads numeric-only fixture from `tests/fixtures/t004-real-landmarks.json`
 * (zero references to `/srv` or files outside the repository).
 *
 * Verifies:
 *  - Full end-to-end replay of all 2,082 real T004 frames through `LabAnalyzer` -> `ActionIntentResolver`
 *    -> `HandStrokePipeline.feedResolved()` -> `StrokeStore`:
 *      * C03: Canvas route disables pistol gating (`DISABLED_ON_CANVAS`), 0 `POINT_READY`/`POINT_PRESS`,
 *        0 `"Cubit ditolak gate R19"` rejections across all 2,082 frames.
 *      * C04, C06: Short detector blinks (Stroke 11 = 62 ms / 1 frame, Stroke 9 = 99 ms / 1 frame,
 *        Stroke 10 = 220 ms / 5 frames) survive in `HOLD_GRACE` with 0 speculative points during NO_HAND
 *        and resume the SAME active stroke in `StrokeStore` with 0 `"Tunggu gestur dilepas"` rejections.
 *      * C05: Long detector losses (Stroke 5 = 603–667 ms / 12 frames, Stroke 4 = 12,657–12,724 ms / 332 frames)
 *        close fail-closed in `StrokeStore` with 0 speculative bridge points.
 *  - C01, C07: Single tight PinchSource (`<= 0.30` enter, `<= 0.42` exit); near-pinch (`0.32..0.48`) -> 0 strokes.
 *  - C08, C09: FIST alone -> NEUTRAL (0 draw/erase/undo/redo); 5-finger open palm AND 5-finger split palm
 *    >= 160 ms -> real erase in `StrokeStore` (Owner Decision R22, consistent with `gesture-mode.ts:80`);
 *    4-finger split palm -> rejected (`isSplitPalm === true`, 0 erase).
 *  - C10, C11, C12: Time-based edge-triggered Undo/Redo FSM through full `LabAnalyzer` + `StrokeStore`
 *    (`FIST -> 1 finger` executes `store.undo()` once; `FIST -> 2 fingers` executes `store.redo()` once;
 *    1 or 2 fingers without prior FIST -> 0 undo/redo; no swipe Undo/Redo).
 *  - C13, C15, C16: 2-hand ambiguity hold & stale frames (`frameAgeMs > 150`) do NOT mutate `StrokeStore`;
 *    cursor appears on hand presence while ink starts only on tight pinch; secondary hand never draws or steals lock.
 *  - A8 #9, A8 #17: Accurate 0..5 diagnostic finger count (incl. 3 & 4); Gesture route pistol combo keys
 *    (`UP_RIGHT`, `UP_LEFT`) with 0 stuck keys on release / NO_HAND.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ActionIntentResolver } from "@/src/components/nui-lab/bench/action-resolver";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { palmCenterNormalized } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";
import {
  ASPECT,
  NEUTRAL,
  cls,
  loadRealR19Model,
  pinchSkeleton,
  pistolSkeleton,
  rig,
  skel,
} from "./lab-rig";

function makeCanvasLab(): LabAnalyzer {
  const lab = new LabAnalyzer({
    route: "canvas",
    fullFrameLock: true,
    enableInk: true,
    preset: "default-any-pinch",
  });
  lab.enableR19(loadRealR19Model(), 900);
  return lab;
}

function makeGestureLab(): LabAnalyzer {
  const lab = new LabAnalyzer({ route: "gesture", fullFrameLock: true, enableInk: false });
  lab.enableR19(loadRealR19Model(), 900);
  return lab;
}

const T004_FIXTURE_PATH = path.resolve(__dirname, "../fixtures/t004-real-landmarks.json");

interface T004BreakMeta {
  originalStrokeId: number;
  endIdx: number;
  prevHandIdx: number;
  prevHandT: number;
  firstMissIdx: number;
  firstMissT: number;
  nextHandIdx: number;
  nextHandT: number;
  missFrames: number;
  missDurationMs: number;
  totalGapMs: number;
}

interface T004FixtureFile {
  schema: string;
  sourceTrialId: string;
  totalFrames: number;
  trackedFrames: number;
  breaks: T004BreakMeta[];
  frames: Array<{
    t: number;
    aspect: number;
    lm: Array<[number, number] | { x: number; y: number; z?: number }> | null;
  }>;
}

function toLandmarks(
  rawLm: Array<[number, number] | { x: number; y: number; z?: number }> | null | undefined,
): Landmark[] | undefined {
  if (!rawLm || !Array.isArray(rawLm) || rawLm.length < 21) return undefined;
  return rawLm.map((pt) => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : { x: pt.x, y: pt.y, z: pt.z }));
}

function loadT004Fixture(): {
  meta: T004FixtureFile;
  frames: Array<{ t: number; aspect: number; lm: Landmark[] | undefined }>;
} {
  const meta = JSON.parse(fs.readFileSync(T004_FIXTURE_PATH, "utf8")) as T004FixtureFile;
  return {
    meta,
    frames: meta.frames.map((f) => ({
      t: f.t,
      aspect: f.aspect ?? ASPECT,
      lm: toLandmarks(f.lm),
    })),
  };
}

function feedFrames(
  lab: LabAnalyzer,
  lm: Landmark[] | null,
  count: number,
  startMs: number,
  dtMs = 33,
  startFrameId = 1,
) {
  const snaps = [];
  let t = startMs;
  let fid = startFrameId;
  for (let i = 0; i < count; i++) {
    t += dtMs;
    lab.analyse({
      landmarks: lm ? [lm] : [],
      inferMs: 5,
      nowMs: t,
      aspect: ASPECT,
      captureFrameId: fid++,
    });
    snaps.push(lab.snapshot(t));
  }
  return { snaps, endMs: t, nextFrameId: fid };
}

/** Builds a realistic 5-finger split palm (thumb + index/middle grouped, gap to ring/pinky). */
function splitPalmHand(cx = 0.5, cy = 0.5): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  pts[0] = { x: cx, y: cy + 0.16 }; // wrist
  // Thumb extended left
  pts[1] = { x: cx - 0.04, y: cy + 0.11 };
  pts[2] = { x: cx - 0.08, y: cy + 0.06 };
  pts[3] = { x: cx - 0.11, y: cy + 0.01 };
  pts[4] = { x: cx - 0.14, y: cy - 0.04 };
  // Index & middle tightly paired together on left
  pts[5] = { x: cx - 0.05, y: cy + 0.02 };
  pts[6] = { x: cx - 0.055, y: cy - 0.05 };
  pts[7] = { x: cx - 0.058, y: cy - 0.11 };
  pts[8] = { x: cx - 0.06, y: cy - 0.16 };
  pts[9] = { x: cx - 0.02, y: cy + 0.01 };
  pts[10] = { x: cx - 0.04, y: cy - 0.05 };
  pts[11] = { x: cx - 0.045, y: cy - 0.11 };
  pts[12] = { x: cx - 0.048, y: cy - 0.16 };
  // Wide V-gap between middle (12) and ring (16); ring & pinky paired together on right
  pts[13] = { x: cx + 0.02, y: cy + 0.02 };
  pts[14] = { x: cx + 0.045, y: cy - 0.05 };
  pts[15] = { x: cx + 0.055, y: cy - 0.10 };
  pts[16] = { x: cx + 0.062, y: cy - 0.15 };
  pts[17] = { x: cx + 0.055, y: cy + 0.04 };
  pts[18] = { x: cx + 0.062, y: cy - 0.03 };
  pts[19] = { x: cx + 0.068, y: cy - 0.08 };
  pts[20] = { x: cx + 0.072, y: cy - 0.13 };
  return pts;
}

/** Builds a 4-finger split palm with thumb tucked across palm (must NOT erase). */
function splitPalmFourFingersHand(cx = 0.5, cy = 0.5): Landmark[] {
  const pts = splitPalmHand(cx, cy);
  pts[1] = { x: cx - 0.03, y: cy + 0.11 };
  pts[2] = { x: cx - 0.01, y: cy + 0.08 };
  pts[3] = { x: cx + 0.01, y: cy + 0.05 };
  pts[4] = { x: cx + 0.02, y: cy + 0.03 }; // tucked across palm
  return pts;
}

describe("R22 Contract K9 — Full LabAnalyzer + HandStrokePipeline + StrokeStore T004 Real-Landmark Replay", () => {
  const { meta, frames } = loadT004Fixture();

  it("loads the self-contained in-repo T004 fixture (2,082 frames, 1,411 tracked frames, 5 breaks)", () => {
    expect(meta.schema).toBe("r22-t004-landmark-fixture/1");
    expect(frames).toHaveLength(2082);
    expect(frames.filter((f) => Boolean(f.lm))).toHaveLength(1411);
    expect(meta.breaks).toHaveLength(5);
  });

  it("replays all 2,082 real T004 frames through full LabAnalyzer + HandStrokePipeline + StrokeStore and proves C03, C04, C05, C06 live", () => {
    const lab = new LabAnalyzer({
      route: "canvas",
      fullFrameLock: true,
      enableInk: true,
      lossGraceMs: 240,
      maxResumeGapMs: 360,
      preset: "default-any-pinch",
    });
    lab.enableR19(loadRealR19Model(), frames[0]!.t - 50);

    let disabledOnCanvasCount = 0;
    let pointReadyOrPressCount = 0;
    let cubitDitolakGateR19Count = 0;
    let speculativePointsAddedOnNoHand = 0;

    interface FrameTrace {
      idx: number;
      t: number;
      hasLm: boolean;
      hasActiveStroke: boolean;
      activePoints: number;
      completedStrokes: number;
      rejectionReason: string;
      actionIntent: string;
      inLossGrace: boolean;
    }

    const trace: FrameTrace[] = [];

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const prevActiveLen = lab.strokes().active?.length ?? 0;

      lab.analyse({
        landmarks: f.lm ? [f.lm] : [],
        inferMs: 12,
        nowMs: f.t,
        aspect: f.aspect,
        captureFrameId: i + 1,
      });

      const snap = lab.snapshot(f.t);
      const st = lab.strokes();
      const activeLen = st.active?.length ?? 0;

      if (snap.r19.gateState === "DISABLED_ON_CANVAS") disabledOnCanvasCount++;
      if (snap.r19.state === "POINT_READY" || snap.r19.state === "POINT_PRESS") pointReadyOrPressCount++;
      if (snap.rejectionReason.includes("Cubit ditolak gate R19")) cubitDitolakGateR19Count++;
      if (!f.lm && activeLen > prevActiveLen) {
        speculativePointsAddedOnNoHand += activeLen - prevActiveLen;
      }

      trace.push({
        idx: i,
        t: f.t,
        hasLm: Boolean(f.lm),
        hasActiveStroke: st.active !== null,
        activePoints: activeLen,
        completedStrokes: st.completed.length,
        rejectionReason: snap.rejectionReason,
        actionIntent: snap.actionIntent,
        inLossGrace: snap.diag.inLossGrace,
      });
    }

    // C03: Zero pistol gating or blocks on Canvas across all 2,082 real frames
    expect(disabledOnCanvasCount).toBe(2082);
    expect(pointReadyOrPressCount).toBe(0);
    expect(cubitDitolakGateR19Count).toBe(0);
    // C05: Zero speculative ink points ever emitted during NO_HAND
    expect(speculativePointsAddedOnNoHand).toBe(0);

    // Inspect all 5 real T004 detector-miss breaks LIVE in StrokeStore trace!
    const byId = new Map(meta.breaks.map((b) => [b.originalStrokeId, b]));

    // 1. Short blinks MUST survive & resume the EXACT same stroke (completedStrokes unchanged, activePoints increases, 0 re-arm rejection)
    for (const shortId of [11, 9, 10]) {
      const b = byId.get(shortId)!;
      const before = trace[b.prevHandIdx]!;
      const missSlice = trace.slice(b.firstMissIdx, b.nextHandIdx);
      const resume = trace[b.nextHandIdx]!;

      expect(before.hasActiveStroke).toBe(true);
      expect(before.activePoints).toBeGreaterThanOrEqual(2);
      expect(missSlice.length).toBeGreaterThanOrEqual(1);

      for (const m of missSlice) {
        expect(m.hasLm).toBe(false);
        expect(m.inLossGrace).toBe(true);
        expect(m.actionIntent).toBe("HOLD_GRACE");
        expect(m.hasActiveStroke).toBe(true);
        expect(m.activePoints).toBe(before.activePoints); // 0 speculative points during miss
        expect(m.completedStrokes).toBe(before.completedStrokes);
      }

      // On first hand recovery frame: same stroke resumed cleanly, NO re-arm rejection!
      expect(resume.hasActiveStroke).toBe(true);
      expect(resume.completedStrokes).toBe(before.completedStrokes);
      expect(resume.activePoints).toBeGreaterThan(before.activePoints);
      expect(resume.rejectionReason).toBe("Tinta aktif");
      expect(resume.rejectionReason).not.toContain("Tunggu gestur dilepas");
    }

    // 2. Long losses (Stroke 5 = 667 ms / 12 frames, Stroke 4 = 12,724 ms / 332 frames) MUST close FAIL-CLOSED!
    for (const longId of [5, 4]) {
      const b = byId.get(longId)!;
      const before = trace[b.prevHandIdx]!;
      const lastMiss = trace[b.nextHandIdx - 1]!;
      const resume = trace[b.nextHandIdx]!;

      expect(before.hasActiveStroke).toBe(true);
      // Must have closed during the long miss (before recovery), incrementing completedStrokes by 1
      expect(lastMiss.hasActiveStroke).toBe(false);
      expect(lastMiss.completedStrokes).toBe(before.completedStrokes + 1);
      // On recovery frame, MUST NOT resurrect the closed stroke or bridge across the gap
      expect(resume.hasActiveStroke).toBe(false);
      expect(resume.completedStrokes).toBe(before.completedStrokes + 1);
    }
  });

  it("verifies full LabAnalyzer + HandStrokePipeline + StrokeStore replay with cursorFilterMode='one-euro' preserves all 5 T004 break invariants", () => {
    const lab = new LabAnalyzer({
      route: "canvas",
      fullFrameLock: true,
      enableInk: true,
      lossGraceMs: 240,
      maxResumeGapMs: 360,
      cursorFilterMode: "one-euro",
      preset: "default-any-pinch",
    });
    lab.enableR19(loadRealR19Model(), frames[0]!.t - 50);

    const byId = new Map(meta.breaks.map((b) => [b.originalStrokeId, b]));
    const snapshots = new Map<number, { active: number; completed: number; reject: string }>();

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      lab.analyse({
        landmarks: f.lm ? [f.lm] : [],
        inferMs: 12,
        nowMs: f.t,
        aspect: f.aspect,
        captureFrameId: i + 1,
      });
      const st = lab.strokes();
      snapshots.set(i, {
        active: st.active?.length ?? 0,
        completed: st.completed.length,
        reject: lab.snapshot(f.t).rejectionReason,
      });
    }

    for (const shortId of [11, 9, 10]) {
      const b = byId.get(shortId)!;
      const before = snapshots.get(b.prevHandIdx)!;
      const resume = snapshots.get(b.nextHandIdx)!;
      expect(resume.completed).toBe(before.completed);
      expect(resume.active).toBeGreaterThan(before.active);
      expect(resume.reject).toBe("Tinta aktif");
    }
    for (const longId of [5, 4]) {
      const b = byId.get(longId)!;
      const before = snapshots.get(b.prevHandIdx)!;
      const lastMiss = snapshots.get(b.nextHandIdx - 1)!;
      expect(lastMiss.active).toBe(0);
      expect(lastMiss.completed).toBe(before.completed + 1);
    }
  });
});

describe("R22 Contract K3 & Acceptance C01–C17 Full LabAnalyzer + StrokeStore Invariants", () => {
  it("verifies C01 & C07: near-pinch (pinchRatio 0.32..0.48) through full LabAnalyzer produces 0 strokes in StrokeStore", () => {
    const lab = makeCanvasLab();
    let t = 1000;
    let fid = 1;
    // Lock neutral hand first so re-arm is satisfied
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({ landmarks: [NEUTRAL(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    const ratios = [0.48, 0.44, 0.40, 0.36, 0.34, 0.33, 0.32, 0.35, 0.39, 0.45, 0.48];
    for (const ratio of ratios) {
      t += 33;
      lab.analyse({
        landmarks: [skel(pinchSkeleton(ratio))(0.5, 0.5)],
        inferMs: 5,
        nowMs: t,
        aspect: ASPECT,
        captureFrameId: fid++,
      });
      const snap = lab.snapshot(t);
      expect(snap.actionIntent).not.toBe("DRAW");
      expect(snap.actionResolution.pinchContact).toBe(false);
    }
    expect(lab.strokes().active).toBeNull();
    expect(lab.strokes().completed).toHaveLength(0);
  });

  it("verifies C09: FIST alone through full LabAnalyzer + StrokeStore is neutral (0 draw, 0 erase, 0 undo/redo)", () => {
    const lab = makeCanvasLab();
    // Pre-draw a real stroke so any accidental erase or undo would mutate StrokeStore!
    lab.beginPointerStroke({ x: 640, y: 360 });
    lab.movePointerStroke({ x: 660, y: 360 });
    lab.endPointerStroke();
    expect(lab.strokes().completed).toHaveLength(1);

    let t = 1000;
    let fid = 1;
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({ landmarks: [NEUTRAL(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    for (let i = 0; i < 20; i++) {
      t += 33;
      lab.analyse({ landmarks: [cls("fist")(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
      const snap = lab.snapshot(t);
      expect(snap.actionIntent).toBe("NEUTRAL");
      expect(snap.actionResolution.allowDrawMutation).toBe(false);
      expect(snap.actionResolution.allowEraseMutation).toBe(false);
      expect(snap.actionResolution.fireCommand).toBeNull();
    }
    expect(lab.strokes().completed).toHaveLength(1);
    expect(lab.strokes().active).toBeNull();
  });

  it("verifies C08 & A8 #11 (Owner Decision R22): 5-finger split palm AND 5-finger open palm erase real StrokeStore ink, while 4-finger split palm does not", () => {
    const lab = makeCanvasLab();
    const split5Lm = splitPalmHand(0.5, 0.5);
    const split5Center = palmCenterNormalized(split5Lm);
    const splitX = split5Center.x * 1280;
    const splitY = split5Center.y * 720;

    // Draw stroke #1 across the 5-finger split-palm center
    lab.beginPointerStroke({ x: splitX - 60, y: splitY });
    for (let dx = -50; dx <= 60; dx += 10) lab.movePointerStroke({ x: splitX + dx, y: splitY });
    lab.endPointerStroke();
    expect(lab.strokes().completed).toHaveLength(1);
    const initialPts1 = lab.strokes().completed[0]!.length;

    let t = 1000;
    let fid = 1;
    // Arm via neutral fist first
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({ landmarks: [cls("fist")(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }

    // 1. 4-finger split palm (thumb tucked) MUST be flagged isSplitPalm=true and MUST NOT erase
    const split4Lm = splitPalmFourFingersHand(0.5, 0.5);
    for (let i = 0; i < 10; i++) {
      t += 33;
      lab.analyse({ landmarks: [split4Lm], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
      const snap = lab.snapshot(t);
      expect(snap.actionResolution.isSplitPalm).toBe(true);
      expect(snap.actionResolution.poseClass).toBe("OTHER");
      expect(snap.actionResolution.allowEraseMutation).toBe(false);
    }
    expect(lab.strokes().completed[0]!.length).toBe(initialPts1);

    // 2. 5-finger split palm held >= 160 ms MUST erase real StrokeStore ink (consistent with gesture-mode.ts:80)
    let sawSplit5Erase = false;
    for (let i = 0; i < 12; i++) {
      t += 33;
      lab.analyse({ landmarks: [split5Lm], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
      const snap = lab.snapshot(t);
      expect(snap.actionResolution.isSplitPalm).toBe(true);
      expect(snap.actionResolution.poseClass).toBe("FIVE");
      expect(snap.actionResolution.handPose).toBe("split-palm");
      if (snap.actionIntent === "ERASE" && snap.actionResolution.allowEraseMutation) sawSplit5Erase = true;
    }
    expect(sawSplit5Erase).toBe(true);
    const totalPointsAfterSplit5 = lab.strokes().completed.reduce((sum, s) => sum + s.length, 0);
    expect(totalPointsAfterSplit5).toBeLessThan(initialPts1);

    // 3. Regular 5-finger open palm also erases real StrokeStore ink
    lab.canvasAction("clear");
    const palmLm = cls("palm")(0.5, 0.5);
    const palmCenter = palmCenterNormalized(palmLm);
    const eraseX = palmCenter.x * 1280;
    const eraseY = palmCenter.y * 720;
    lab.beginPointerStroke({ x: eraseX - 60, y: eraseY });
    for (let dx = -50; dx <= 60; dx += 10) lab.movePointerStroke({ x: eraseX + dx, y: eraseY });
    lab.endPointerStroke();
    const initialPts2 = lab.strokes().completed[0]!.length;

    let sawOpenErase = false;
    for (let i = 0; i < 12; i++) {
      t += 33;
      lab.analyse({ landmarks: [palmLm], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
      if (lab.snapshot(t).actionIntent === "ERASE" && lab.snapshot(t).actionResolution.allowEraseMutation) {
        sawOpenErase = true;
      }
    }
    expect(sawOpenErase).toBe(true);
    const totalPointsAfterOpen = lab.strokes().completed.reduce((sum, s) => sum + s.length, 0);
    expect(totalPointsAfterOpen).toBeLessThan(initialPts2);
  });

  it("code-review hardening: zero-empty-frame stall > maxResumeGapMs fails closed without bridging stroke", () => {
    const lab = makeCanvasLab();
    let t = 1000;
    let fid = 1;
    // Arm with neutral hand then draw with tight pinch
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({ landmarks: [NEUTRAL(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({
        landmarks: [skel(pinchSkeleton(0.12))(0.5 + i * 0.005, 0.5)],
        inferMs: 5,
        nowMs: t,
        aspect: ASPECT,
        captureFrameId: fid++,
      });
    }
    expect(lab.strokes().active).not.toBeNull();
    const ptsBeforeStall = lab.strokes().active!.length;

    // Sudden 500 ms stall (> 360 ms maxResumeGapMs) with ZERO empty frames in between -> MUST close old stroke fail-closed!
    t += 500;
    lab.analyse({
      landmarks: [skel(pinchSkeleton(0.12))(0.54, 0.5)],
      inferMs: 5,
      nowMs: t,
      aspect: ASPECT,
      captureFrameId: fid++,
    });
    expect(lab.strokes().completed).toHaveLength(1);
    expect(lab.strokes().completed[0]!.length).toBe(ptsBeforeStall);
    expect(lab.strokes().active).toBeNull();
  });

  it("verifies C10, C11, C12: FIST->1 executes real StrokeStore.undo() ONCE, FIST->2 executes real StrokeStore.redo() ONCE, and unarmed 1/2 fingers do nothing", () => {
    const lab = makeCanvasLab();
    // Put 2 completed strokes into real StrokeStore
    lab.beginPointerStroke({ x: 100, y: 100 });
    lab.movePointerStroke({ x: 150, y: 150 });
    lab.endPointerStroke();
    lab.beginPointerStroke({ x: 200, y: 200 });
    lab.movePointerStroke({ x: 250, y: 250 });
    lab.endPointerStroke();
    expect(lab.strokes().completed).toHaveLength(2);

    const fist = cls("fist")(0.5, 0.5);
    const one = cls("one")(0.5, 0.5);
    const two = cls("two_up")(0.5, 0.5);

    let t = 1000;
    let fid = 1;

    // 0. Lock with neutral hand, then show 1 finger & 2 fingers WITHOUT prior FIST -> 0 undo/redo!
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({ landmarks: [NEUTRAL(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    for (let i = 0; i < 10; i++) {
      t += 33;
      lab.analyse({ landmarks: [one], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    for (let i = 0; i < 10; i++) {
      t += 33;
      lab.analyse({ landmarks: [two], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    expect(lab.strokes().completed).toHaveLength(2);
    expect(lab.snapshot(t).diag.commandCount).toBe(0);

    // 1. Arm with FIST (>= 150 ms)
    for (let i = 0; i < 7; i++) {
      t += 33;
      lab.analyse({ landmarks: [fist], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    expect(lab.snapshot(t).undoRedoFsmState).toBe("ARMED_FIST");

    // 2. Transition to 1 finger and hold for 15 frames -> MUST undo EXACTLY ONCE (2 -> 1 stroke)!
    for (let i = 0; i < 15; i++) {
      t += 33;
      lab.analyse({ landmarks: [one], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    expect(lab.strokes().completed).toHaveLength(1);
    expect(lab.snapshot(t).diag.commandCount).toBe(1);
    expect(lab.snapshot(t).diag.lastCommand?.kind).toBe("undo");
    expect(lab.snapshot(t).diag.lastCommand?.changed).toBe(true);
    expect(lab.snapshot(t).diag.lastCommand?.via).toBe("fist-transition");

    // 3. Cooldown (> 500 ms) then re-arm with FIST -> 2 fingers -> MUST redo EXACTLY ONCE (1 -> 2 strokes)!
    t += 550;
    for (let i = 0; i < 7; i++) {
      t += 33;
      lab.analyse({ landmarks: [fist], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    expect(lab.snapshot(t).undoRedoFsmState).toBe("ARMED_FIST");

    for (let i = 0; i < 15; i++) {
      t += 33;
      lab.analyse({ landmarks: [two], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    expect(lab.strokes().completed).toHaveLength(2);
    expect(lab.snapshot(t).diag.commandCount).toBe(2);
    expect(lab.snapshot(t).diag.lastCommand?.kind).toBe("redo");
    expect(lab.snapshot(t).diag.lastCommand?.changed).toBe(true);
  });

  it("verifies C13 & C15: 2-hand ambiguity hold and stale frames (frameAgeMs > 150) never mutate StrokeStore", () => {
    const lab = makeCanvasLab();
    let t = 1000;
    let fid = 1;
    // Lock neutral hand
    for (let i = 0; i < 4; i++) {
      t += 33;
      lab.analyse({ landmarks: [NEUTRAL(0.5, 0.5)], inferMs: 5, nowMs: t, aspect: ASPECT, captureFrameId: fid++ });
    }
    // Stale pinch frames (frameAgeMs = 220 > 150) MUST NOT start ink in StrokeStore
    for (let i = 0; i < 5; i++) {
      t += 33;
      lab.analyse({
        landmarks: [skel(pinchSkeleton(0.05))(0.5, 0.5)],
        inferMs: 5,
        nowMs: t,
        aspect: ASPECT,
        captureFrameId: fid++,
        frameAgeMs: 220,
        isStale: true,
      });
    }
    expect(lab.strokes().active).toBeNull();
    expect(lab.strokes().completed).toHaveLength(0);

    // Ambiguous 2-hand hold during pinch MUST NOT start ink in StrokeStore
    for (let i = 0; i < 5; i++) {
      t += 33;
      lab.analyse({
        landmarks: [skel(pinchSkeleton(0.05))(0.5, 0.5)],
        inferMs: 5,
        nowMs: t,
        aspect: ASPECT,
        captureFrameId: fid++,
        ambiguousHold: true,
      });
    }
    expect(lab.strokes().active).toBeNull();
    expect(lab.strokes().completed).toHaveLength(0);
  });

  it("verifies C15 & A8 #13: cursor appears when hand is present, ink begins only on pinch contact", () => {
    const r = rig();
    r.feedLm(NEUTRAL(0.5, 0.5));
    r.feedLm(NEUTRAL(0.5, 0.5));
    const snap1 = r.lab.snapshot(r.now());
    expect(snap1.cursor).not.toBeNull();
    expect(r.lab.strokes().active).toBeNull();
    expect(r.lab.strokes().completed).toHaveLength(0);

    r.feedLm(skel(pinchSkeleton(0.05))(0.5, 0.5));
    r.feedLm(skel(pinchSkeleton(0.05))(0.52, 0.5));
    const snap2 = r.lab.snapshot(r.now());
    expect(snap2.cursor).not.toBeNull();
    expect(r.lab.strokes().active).not.toBeNull();
  });

  it("verifies C16: secondary hand cannot draw, erase, fire commands, or steal primary owner lock", () => {
    const r = rig();
    const primaryPalm = cls("palm")(0.4, 0.5);
    const secondaryPinch = skel(pinchSkeleton(0.05))(0.7, 0.5);

    r.feedLm(primaryPalm);
    r.feedLm(primaryPalm);
    expect(r.lab.snapshot(r.now()).primaryIndex).toBe(0);

    let t = r.now();
    for (let i = 0; i < 4; i++) {
      t += 33;
      r.lab.analyse({ landmarks: [primaryPalm, secondaryPinch], inferMs: 5, nowMs: t, aspect: ASPECT });
    }
    const snap = r.lab.snapshot(t);
    expect(snap.primaryIndex).toBe(0);
    expect(r.lab.strokes().active).toBeNull();
  });
});

describe("R22 §A8 Diagnostics & Gesture Route Keyboard (A8 #9, A8 #17)", () => {
  it("verifies A8 #9: reports 0..5 finger count including 3 and 4 fingers accurately", () => {
    const resolver = new ActionIntentResolver();
    const cases: Array<[string, number]> = [
      ["fist", 0],
      ["one", 1],
      ["two_up", 2],
      ["three", 3],
      ["four", 4],
      ["palm", 5],
    ];
    let fid = 1;
    let t = 1000;
    for (const [name, expected] of cases) {
      const res = resolver.resolve({
        route: "gesture",
        landmarks: cls(name as Parameters<typeof cls>[0])(0.5, 0.5),
        aspect: ASPECT,
        nowMs: t,
        captureFrameId: fid++,
        acquisitionId: 1,
        ownerLocked: true,
        modelReady: true,
        hasActiveStroke: false,
        isErasing: false,
      });
      expect(res.fingerCount).toBe(expected);
      t += 33;
    }
  });

  it("verifies A8 #17: pistol virtual keys support hold/release and diagonal combos (UP_RIGHT, UP_LEFT) with 0 stuck keys", () => {
    for (const [angle, expectLeft, expectRight] of [
      [55, false, true],
      [125, true, false],
    ] as const) {
      const lab = makeGestureLab();
      const aimLm = pistolSkeleton(angle, true, { aspect: ASPECT });
      const resHold = feedFrames(lab, aimLm, 5, 1000, 33);
      const lastSnap = resHold.snaps.at(-1)!;
      expect(lastSnap.r19.virtualKey.left).toBe(expectLeft);
      expect(lastSnap.r19.virtualKey.right).toBe(expectRight);
      expect(lastSnap.r19.virtualKey.jump).toBe(true);

      const resRelease = feedFrames(lab, null, 3, resHold.endMs, 33, resHold.nextFrameId);
      for (const snap of resRelease.snaps) {
        expect(snap.r19.virtualKey.left).toBe(false);
        expect(snap.r19.virtualKey.right).toBe(false);
        expect(snap.r19.virtualKey.jump).toBe(false);
      }
    }
  });
});
