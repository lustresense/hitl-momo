import { describe, expect, it } from "vitest";
import {
  ARM_THRESHOLD_PX,
  LOCK_MAX,
  LOCK_RESIST,
  NOTCHES_TO_ARM,
  NOTCH_PX,
  PULL_MAX,
  RIBBON_SHADOW_PX,
  computeNotchCount,
  computePullProgress,
  computeVisualPull,
  createRibbonPullController,
  elasticOut,
  isPullArmed,
  outerRibbonPath,
  ribbonRestLength,
  sampleSpringRebound,
  selectNearestRibbon,
  shelfGap,
  shelfLayout,
  stitchRibbonPath,
  type RibbonRectLike,
  type RibbonSlotMeta,
} from "@/src/features/level-select/ribbon-pull";

const SLOTS: readonly RibbonSlotMeta[] = [
  { stage: 1, locked: false, restLength: 320 },
  { stage: 2, locked: true, restLength: 211 },
  { stage: 3, locked: true, restLength: 211 },
];

const RECTS: readonly RibbonRectLike[] = [
  { stage: 1, locked: false, left: 100, top: 80, width: 140, height: 320 },
  { stage: 2, locked: true, left: 320, top: 80, width: 140, height: 211 },
  { stage: 3, locked: true, left: 540, top: 80, width: 140, height: 211 },
];

describe("ribbon-pull pure mechanics (bab.js parity)", () => {
  it("computes shelf layout and SVG paths matching bab.js", () => {
    expect(shelfGap(400)).toBe(14);
    expect(shelfGap(1200)).toBe(60);
    expect(shelfGap(2000)).toBe(76);

    const desktop = shelfLayout(3, 1280, 720);
    expect(desktop.perRow).toBe(3);
    expect(desktop.h).toBe(270);
    expect(desktop.w).toBe(Math.round(Math.min(184, 270 * 0.4)));

    const mobile = shelfLayout(3, 375, 700);
    expect(mobile.perRow).toBe(2);
    expect(mobile.h).toBeLessThanOrEqual(330);

    expect(ribbonRestLength(300, false)).toBe(300);
    expect(ribbonRestLength(300, true)).toBe(198);
    expect(RIBBON_SHADOW_PX).toBe(7);
    expect(outerRibbonPath(100, 300)).toBe("M3 3H97V297L50 253L3 297Z");
    expect(stitchRibbonPath(100, 300)).toBe("M15 15H85V285L50 250L15 285Z");
  });

  it("computes visual pull, notches, arm threshold, and 0..1 progress", () => {
    expect(NOTCH_PX).toBe(38);
    expect(NOTCHES_TO_ARM).toBe(4);
    expect(ARM_THRESHOLD_PX).toBe(152);

    expect(computeVisualPull(25, false)).toBe(25);
    expect(computeVisualPull(90, false)).toBe(40 + 50 * 0.8);
    expect(computeVisualPull(500, false)).toBe(PULL_MAX);

    expect(computeNotchCount(0, false)).toBe(0);
    expect(computeNotchCount(38, false)).toBe(1);
    expect(computeNotchCount(151, false)).toBe(3);
    expect(computeNotchCount(152, false)).toBe(4);
    expect(computeNotchCount(400, false)).toBe(4);

    expect(computePullProgress(0, false)).toBe(0);
    expect(computePullProgress(76, false)).toBeCloseTo(0.5, 5);
    expect(computePullProgress(152, false)).toBe(1);
    expect(computePullProgress(300, false)).toBe(1);

    expect(isPullArmed(151, false)).toBe(false);
    expect(isPullArmed(152, false)).toBe(true);

    expect(computeVisualPull(100, true)).toBeCloseTo(100 * LOCK_RESIST, 5);
    expect(computeVisualPull(500, true)).toBe(LOCK_MAX);
    expect(computeNotchCount(250, true)).toBe(0);
    expect(computePullProgress(250, true)).toBe(0);
    expect(isPullArmed(250, true)).toBe(false);
  });

  it("provides spring elastic easing when released below threshold", () => {
    expect(elasticOut(0)).toBeCloseTo(0, 6);
    expect(elasticOut(1)).toBe(1);
    expect(elasticOut(0.2)).toBeGreaterThan(1);

    const startLen = 400;
    const restLen = 320;
    expect(sampleSpringRebound(startLen, restLen, 0)).toBeCloseTo(startLen, 6);
    expect(sampleSpringRebound(startLen, restLen, 1)).toBe(restLen);
    expect(sampleSpringRebound(startLen, restLen, 0.2)).toBeLessThan(restLen);
  });

  it("selects nearest ribbon under Rule B regardless of vertical coordinate on single row", () => {
    expect(selectNearestRibbon(RECTS, 120, 600)?.stage).toBe(1);
    expect(selectNearestRibbon(RECTS, 380, 600)?.stage).toBe(2);
    expect(selectNearestRibbon(RECTS, 620, 600)?.stage).toBe(3);
    expect(selectNearestRibbon([], 100, 100)).toBeNull();
  });

  it("partitions horizontal 2-3 ribbons into equal camera zones with 5% hysteresis and direct-hit priority", () => {
    const centered: readonly RibbonRectLike[] = [
      { stage: 1, locked: false, left: 414, top: 80, width: 108, height: 270 },
      { stage: 2, locked: true, left: 586, top: 80, width: 108, height: 178 },
      { stage: 3, locked: true, left: 758, top: 80, width: 108, height: 178 },
    ];
    // Equal bands on 1200px viewport: [0,400), [400,800), [800,1200], hysteresis = 60px
    expect(selectNearestRibbon(centered, 200, 500, 1200)?.stage).toBe(1);
    expect(selectNearestRibbon(centered, 550, 500, 1200)?.stage).toBe(2);
    expect(selectNearestRibbon(centered, 1050, 500, 1200)?.stage).toBe(3);
    // Direct hit inside ribbon 1 ([414, 522]) overrides band 1 ([400, 800))
    expect(selectNearestRibbon(centered, 450, 500, 1200, 2)?.stage).toBe(1);
    // Hysteresis keeps prevStage=1 within [0-60, 400+60] when outside direct hits
    expect(selectNearestRibbon(centered, 405, 500, 1200, 1)?.stage).toBe(1);
    // Moving past hysteresis switches to band 1 (stage 2)
    expect(selectNearestRibbon(centered, 550, 500, 1200, 1)?.stage).toBe(2);
    // 2 ribbons split into two equal halves
    expect(selectNearestRibbon(centered.slice(0, 2), 200, 500, 1200)?.stage).toBe(1);
    expect(selectNearestRibbon(centered.slice(0, 2), 900, 500, 1200)?.stage).toBe(2);
  });

  it("rebounds unlocked ribbon when pulled below arm threshold and suppresses trailing click", () => {
    const ctrl = createRibbonPullController(SLOTS);
    expect(ctrl.beginPull(1, 200)).toBe(true);

    const step1 = ctrl.movePull(200 + 38 * 2);
    expect(step1?.notch).toBe(2);
    expect(step1?.notchIncreased).toBe(true);
    expect(step1?.armed).toBe(false);
    expect(step1?.progress).toBeCloseTo(0.5, 5);

    const rel = ctrl.endPull(false);
    expect(rel.action).toBe("rebound");
    if (rel.action === "rebound") {
      expect(rel.stage).toBe(1);
      expect(rel.restLength).toBe(320);
    }

    expect(ctrl.consumeSuppressedClick(1)).toBe(true);
    expect(ctrl.consumeSuppressedClick(1)).toBe(false);
  });

  it("launches unlocked level when pulled past 4th notch and blocks double launch", () => {
    const ctrl = createRibbonPullController(SLOTS);
    ctrl.beginVirtualPull(RECTS, 165, 100);
    expect(ctrl.getState().litStage).toBe(1);

    const armedStep = ctrl.movePull(100 + ARM_THRESHOLD_PX);
    expect(armedStep?.armed).toBe(true);
    expect(armedStep?.progress).toBe(1);

    const rel = ctrl.endPull(false);
    expect(rel.action).toBe("launch");
    if (rel.action === "launch") {
      expect(rel.stage).toBe(1);
    }

    expect(ctrl.beginPull(1, 100)).toBe(false);
    expect(ctrl.activate(1).action).toBe("ignored");
  });

  it("rejects locked ribbon pull and returns Momo/status locked message", () => {
    const ctrl = createRibbonPullController(SLOTS);
    ctrl.beginVirtualPull(RECTS, 390, 200);
    expect(ctrl.getState().litStage).toBe(2);

    const step = ctrl.movePull(420);
    expect(step?.locked).toBe(true);
    expect(step?.armed).toBe(false);
    expect(step?.progress).toBe(0);
    expect(step?.pull).toBe(LOCK_MAX);

    const rel = ctrl.endPull(false);
    expect(rel.action).toBe("rebound-locked");
    if (rel.action === "rebound-locked") {
      expect(rel.tugged).toBe(true);
      expect(rel.message).toBe("Selesaikan Level 1 dulu");
    }
    expect(ctrl.getState().launching).toBe(false);

    const act = ctrl.activate(3);
    expect(act).toEqual({ action: "locked", stage: 3, message: "Selesaikan Level 2 dulu" });
  });

  it("supports keyboard navigation (ArrowLeft/ArrowRight) and Enter/Space/1-3 activation", () => {
    const ctrl = createRibbonPullController([
      { stage: 1, locked: false, restLength: 320 },
      { stage: 2, locked: false, restLength: 320 },
      { stage: 3, locked: true, restLength: 211 },
    ]);

    expect(ctrl.handleKeyDown("ArrowRight")).toEqual({ action: "focus", stage: 1 });
    expect(ctrl.handleKeyDown("ArrowRight")).toEqual({ action: "focus", stage: 2 });
    expect(ctrl.handleKeyDown("ArrowRight")).toEqual({ action: "focus", stage: 3 });
    expect(ctrl.handleKeyDown("ArrowRight")).toEqual({ action: "focus", stage: 3 });
    expect(ctrl.handleKeyDown("ArrowLeft")).toEqual({ action: "focus", stage: 2 });
    expect(ctrl.handleKeyDown(" ")).toEqual({ action: "launch", stage: 2 });

    const ctrl2 = createRibbonPullController(SLOTS);
    expect(ctrl2.handleKeyDown("ArrowRight")).toEqual({ action: "focus", stage: 1 });
    expect(ctrl2.handleKeyDown("ArrowRight")).toEqual({ action: "focus", stage: 2 });
    expect(ctrl2.handleKeyDown("Enter")).toEqual({ action: "locked", stage: 2, message: "Selesaikan Level 1 dulu" });
    expect(ctrl2.handleKeyDown("2")).toEqual({ action: "locked", stage: 2, message: "Selesaikan Level 1 dulu" });
    expect(ctrl2.handleKeyDown("1")).toEqual({ action: "launch", stage: 1 });
  });
});
