import { describe, expect, it } from "vitest";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { MEDIAN_SKELETONS, pinchSkeleton, type RealisticClass } from "../input/realistic-hands";
import { ASPECT, CANVAS, NEUTRAL, PINCH, cls, originForPalm, rig, skel, type Rig } from "./lab-rig";

/**
 * R17-01 REV4 end to end through LabAnalyzer: lock -> pose -> stable vote -> arming -> action -> StrokeStore -> HUD.
 * Rig and hand-motion rules: see lab-rig.ts. Evidence class: UNIT_ONLY (synthetic motion on real-landmark medians).
 * Nothing here is webcam evidence.
 */
const strokePoints = (lab: LabAnalyzer) => lab.strokes().completed.reduce((n, s) => n + s.length, 0);
const diag = (r: Rig) => r.lab.snapshot(r.now()).diag;

/** Pinch-draw along the raw x axis with the touching pinch, then open the hand in place. */
function drawStroke(r: Rig, x0: number, x1: number, y: number, steps = 24) {
  r.hold(NEUTRAL, 3);
  r.glide(NEUTRAL, x0, y);
  r.hold(NEUTRAL, 3);
  for (let i = 0; i <= steps; i++) r.put(PINCH, x0 + ((x1 - x0) * i) / steps, y);
  r.hold(NEUTRAL, 8); // release: the stroke closes
}

function strokeBox(lab: LabAnalyzer) {
  const pts = lab.strokes().completed.flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), midX: (Math.min(...xs) + Math.max(...xs)) / 2, midY: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Palm of class `c` parked (neutral glide first) at a canvas point, then held for the stable vote to settle. */
function parkPalm(r: Rig, c: RealisticClass, X: number, Y: number, frames = 6) {
  const o = originForPalm(MEDIAN_SKELETONS[c], X, Y);
  r.glide(NEUTRAL, o.cx, o.cy);
  r.hold(NEUTRAL, 3);
  r.hold(cls(c), frames);
}
/** Sweep the palm of class `c` along canvas (X0,Y0) -> (X1,Y1) in steps of `px` canvas px. */
function sweepPalm(r: Rig, c: RealisticClass, X0: number, Y0: number, X1: number, Y1: number, px = 20) {
  const n = Math.max(1, Math.ceil(Math.hypot(X1 - X0, Y1 - Y0) / px));
  for (let i = 0; i <= n; i++) {
    const o = originForPalm(MEDIAN_SKELETONS[c], X0 + ((X1 - X0) * i) / n, Y0 + ((Y1 - Y0) * i) / n);
    r.put(cls(c), o.cx, o.cy);
  }
}

describe("high-five (five fingers, thumb out) erases locally and the store really changes", () => {
  it("pinch draw -> release -> high-five sweep cuts the stroke locally; one Undo restores it", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    const before = strokePoints(r.lab);
    expect(before).toBeGreaterThan(10);
    expect(diag(r).strokes.completed).toBe(1);

    const b = strokeBox(r.lab);
    // Approach from below the stroke so the palm never touches it on the way, then sweep up through the middle.
    parkPalm(r, "palm", b.midX, b.maxY + 150);
    sweepPalm(r, "palm", b.midX, b.maxY + 150, b.midX, b.minY - 150);
    const d = diag(r);
    expect(d.rawFingerCount).toBe(5);
    expect(d.fiveFingerValid).toBe(true);
    expect(strokePoints(r.lab)).not.toBe(before);
    expect(r.lab.strokes().completed.length).toBeGreaterThanOrEqual(1); // a local cut, not a clear of the canvas
    expect(d.pipeline?.erasing).toBe(true);

    // Leave the palm; Undo of the erase step restores exactly what was there.
    r.hold(NEUTRAL, 6);
    r.lab.canvasAction("undo");
    expect(strokePoints(r.lab)).toBe(before);
  });

  it("the HUD says HAPUS AKTIF while the palm is over ink and TIDAK ADA STROKE DI AREA when it is not", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    const b = strokeBox(r.lab);
    parkPalm(r, "palm", b.midX, b.maxY + 250, 8);
    expect(diag(r).handStatus).toBe("TIDAK ADA STROKE DI AREA");
    sweepPalm(r, "palm", b.midX, b.maxY + 250, b.midX, b.midY, 20);
    expect(diag(r).handStatus).toBe("HAPUS AKTIF");
  });

  it("a stroke made of sparse vertices (fast hand) is cut BETWEEN its vertices", () => {
    const r = rig();
    drawStroke(r, 0.7, 0.3, 0.5, 5); // ~100 px between samples
    const pts = r.lab.strokes().completed.flat();
    const gaps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
    expect(Math.max(...gaps)).toBeGreaterThan(70); // precondition: a vertex-only eraser could slip through
    const before = strokePoints(r.lab);
    const b = strokeBox(r.lab);
    // Cross the stroke at the middle of its longest gap, where no vertex lies within the 32 px eraser radius.
    const i = gaps.indexOf(Math.max(...gaps));
    const gx = (pts[i]!.x + pts[i + 1]!.x) / 2;
    parkPalm(r, "palm", gx, b.maxY + 150);
    sweepPalm(r, "palm", gx, b.maxY + 150, gx, b.minY - 150);
    expect(strokePoints(r.lab)).not.toBe(before);
    expect(diag(r).pipeline?.lastEraseHit).not.toBeNull();
  });

  it("four fingers with the thumb tucked over the same stroke never erases, and the HUD says why", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    const before = strokePoints(r.lab);
    const b = strokeBox(r.lab);
    parkPalm(r, "four", b.midX, b.maxY + 150);
    sweepPalm(r, "four", b.midX, b.maxY + 150, b.midX, b.minY - 150);
    const d = diag(r);
    const s = r.lab.snapshot(r.now());
    expect(strokePoints(r.lab)).toBe(before);
    expect(d.pipeline?.erasing).toBeFalsy();
    expect(s.r19.guards.eraseActive).toBe(false);
    expect(d.rawFingerCount).toBe(4);
    expect(d.legacyFingerCount).toBe(5); // the legacy rule would have said five: the false Hapus this removes
    expect(d.handStatus).toBe("LANDMARK ADA / 5 JARI BELUM TERBACA");
  });

  it("a fist over the stroke never erases", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    const before = strokePoints(r.lab);
    const b = strokeBox(r.lab);
    parkPalm(r, "fist", b.midX, b.maxY + 150);
    sweepPalm(r, "fist", b.midX, b.maxY + 150, b.midX, b.minY - 150);
    expect(strokePoints(r.lab)).toBe(before);
  });

  it("a palm shown the moment a hand is first acquired does nothing; once released and shown again it erases", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    const before = strokePoints(r.lab);
    const b = strokeBox(r.lab);
    for (let i = 0; i < 12; i++) r.feedLm(null); // empty camera > 300 ms: the owner is released
    // A fresh hand that is a palm at once, already over the ink.
    const o = originForPalm(MEDIAN_SKELETONS.palm, b.midX, b.maxY + 150);
    for (let i = 0; i < 8; i++) r.put(cls("palm"), o.cx, o.cy);
    expect(diag(r).handStatus).toBe("TELAPAK TERBACA / TUNGGU REARM");
    sweepPalm(r, "palm", b.midX, b.maxY + 150, b.midX, b.minY - 150);
    expect(strokePoints(r.lab)).toBe(before); // no early action from the very first frames of a hand

    // Release the pose (neutral), show it again: now it erases.
    const back = originForPalm(MEDIAN_SKELETONS.palm, b.midX, b.maxY + 150);
    r.glide(NEUTRAL, back.cx, back.cy);
    r.hold(NEUTRAL, 4);
    r.hold(cls("palm"), 4);
    sweepPalm(r, "palm", b.midX, b.maxY + 150, b.midX, b.minY - 150);
    expect(strokePoints(r.lab)).not.toBe(before);
  });
});

describe("Undo / Redo by swipe in the lab: motion, the store's own answer, no ghost actions", () => {
  /** Park a command pose at (x, y), hold it still to arm SafeSwipeGuard (>= 220 ms), then swipe >= 2 palm-scales. */
  const swipe = (r: Rig, c: RealisticClass, x: number, y: number, dx: number, frames = 8) => {
    r.glide(NEUTRAL, x, y);
    r.hold(NEUTRAL, 3);
    r.hold(cls(c), 8);
    for (let i = 1; i <= frames; i++) r.put(cls(c), x + (dx * i) / frames, y);
  };
  // Raw x increasing = hand moves to user's LEFT on mirrored preview (palmCenterNormalized.x decreases -> dx < 0 = undo).
  const UNDO_LEFT_DX = 0.42;
  const REDO_RIGHT_DX = -0.42;

  it("one-finger swipe left undoes the last stroke, two-finger swipe right redoes it, and the HUD shows the store's answer", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    expect(diag(r).strokes.completed).toBe(1);

    swipe(r, "one", 0.3, 0.6, UNDO_LEFT_DX);
    let d = diag(r);
    expect(d.lastCommand).toMatchObject({ kind: "undo", changed: true, via: "swipe" });
    expect(d.strokes.completed).toBe(0);

    r.hold(NEUTRAL, 32); // wait out the 900 ms cooldown in a neutral hand
    swipe(r, "two_up", 0.7, 0.6, REDO_RIGHT_DX);
    d = diag(r);
    expect(d.lastCommand).toMatchObject({ kind: "redo", changed: true, via: "swipe" });
    expect(d.strokes.completed).toBe(1);
    expect(d.commandCount).toBe(2);
  });

  it("Undo with nothing to undo is reported as a no-op (changed=false), not as a success", () => {
    const r = rig();
    swipe(r, "one", 0.3, 0.6, UNDO_LEFT_DX);
    expect(diag(r).lastCommand).toMatchObject({ kind: "undo", changed: false });
  });

  it("holding one finger or two fingers still for 2 s sends nothing in swipe mode", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.5);
    r.glide(NEUTRAL, 0.5, 0.6);
    r.hold(cls("one"), 60);
    r.hold(NEUTRAL, 4);
    r.hold(cls("two_up"), 60);
    const d = diag(r);
    expect(d.commandMode).toBe("swipe");
    expect(d.commandCount).toBe(0);
    expect(d.strokes.completed).toBe(1);
  });

  it("fail-closed mode (unloaded R19 model) blocks swipe undo/redo and ink completely", () => {
    const r = rig({ enableModel: false });
    r.lab.beginPointerStroke({ x: 100, y: 100 });
    r.lab.movePointerStroke({ x: 200, y: 100 });
    r.lab.endPointerStroke();
    expect(diag(r).strokes.completed).toBe(1);

    swipe(r, "one", 0.3, 0.6, UNDO_LEFT_DX);
    expect(diag(r).lastCommand).toBeNull();
    expect(diag(r).commandCount).toBe(0);
    expect(diag(r).strokes.completed).toBe(1);
  });

  it("a swipe never draws, erases or moves ink", () => {
    const r = rig();
    drawStroke(r, 0.62, 0.38, 0.3);
    const before = strokePoints(r.lab);
    swipe(r, "two_up", 0.7, 0.75, REDO_RIGHT_DX);
    expect(strokePoints(r.lab)).toBe(before);
    expect(r.lab.strokes().active).toBeNull();
  });
});

describe("near pinch through the analyzer", () => {
  it("a thumb hovering 0.5 span from the index tip draws nothing in R19 G4 Hybrid mode", () => {
    const r = rig();
    r.hold(NEUTRAL, 3);
    r.glide(NEUTRAL, 0.4, 0.5);
    r.hold(NEUTRAL, 3);
    const near = skel(pinchSkeleton(0.5));
    for (let i = 0; i < 30; i++) r.put(near, 0.4 + i * 0.004, 0.5);
    const s = r.lab.snapshot(r.now());
    expect(s.classifierMode).toBe("r19-g4-hybrid");
    expect(s.modelState).toBe("ready");
    expect(s.r19.guards.pinchActive).toBe(false);
    expect(s.drawingAction).toBeNull();
    expect(strokePoints(r.lab)).toBe(0);
    expect(r.lab.strokes().active).toBeNull();
  });
});
