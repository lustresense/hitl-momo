import { describe, expect, it } from "vitest";
import {
  ERASER_RADIUS_MAX_PX,
  ERASER_RADIUS_MIN_PX,
  ERASER_RADIUS_PX,
  ERASER_SIZE_PRESETS,
  EraserSizer,
  eraserRadiusFromPinch,
} from "@/src/input/eraser";

/** Feeds a constant gap for `frames` frames, the way the surface feeds it, and returns the last radius. */
function hold(sizer: EraserSizer, gap: number, frames: number, start: number): number {
  let px = start;
  for (let i = 0; i < frames; i++) px = sizer.update(gap, px);
  return px;
}

describe("eraserRadiusFromPinch: a pure, monotonic map from the gap to the radius", () => {
  it("a closed gap gives the smallest eraser and a wide gap the largest", () => {
    expect(eraserRadiusFromPinch(0.02)).toBe(ERASER_RADIUS_MIN_PX);
    expect(eraserRadiusFromPinch(2)).toBe(ERASER_RADIUS_MAX_PX);
  });

  it("never decreases as the gap widens, and stays inside the bounds", () => {
    let last = -Infinity;
    for (let g = -0.5; g <= 2; g += 0.05) {
      const r = eraserRadiusFromPinch(g);
      expect(r).toBeGreaterThanOrEqual(last);
      expect(r).toBeGreaterThanOrEqual(ERASER_RADIUS_MIN_PX);
      expect(r).toBeLessThanOrEqual(ERASER_RADIUS_MAX_PX);
      last = r;
    }
  });

  it("honours custom min and max bounds", () => {
    expect(eraserRadiusFromPinch(0.02, { minPx: 20, maxPx: 30 })).toBe(20);
    expect(eraserRadiusFromPinch(2, { minPx: 20, maxPx: 30 })).toBe(30);
  });

  it("the S / M / L presets sit inside the bounds and M is the default radius", () => {
    for (const px of Object.values(ERASER_SIZE_PRESETS)) {
      expect(px).toBeGreaterThanOrEqual(ERASER_RADIUS_MIN_PX);
      expect(px).toBeLessThanOrEqual(ERASER_RADIUS_MAX_PX);
    }
    expect(ERASER_SIZE_PRESETS.medium).toBe(ERASER_RADIUS_PX);
    expect(ERASER_SIZE_PRESETS.small).toBeLessThan(ERASER_SIZE_PRESETS.medium);
    expect(ERASER_SIZE_PRESETS.large).toBeGreaterThan(ERASER_SIZE_PRESETS.medium);
  });
});

describe("EraserSizer: the second hand sets the radius, smoothly and without a jump", () => {
  it("the first frame of a session keeps the current radius, even when the gap is far from where it started", () => {
    const sizer = new EraserSizer();
    expect(sizer.update(0.8, ERASER_RADIUS_PX)).toBe(ERASER_RADIUS_PX);
  });

  it("widening the gap grows the radius and closing it shrinks the radius", () => {
    const sizer = new EraserSizer();
    let px = sizer.update(0.3, 28);
    let last = px;
    for (let i = 0; i < 20; i++) {
      px = sizer.update(0.6, px);
      expect(px).toBeGreaterThanOrEqual(last);
      last = px;
    }
    expect(px).toBeGreaterThan(40);
    for (let i = 0; i < 30; i++) {
      px = sizer.update(0.15, px);
      expect(px).toBeLessThanOrEqual(last);
      last = px;
    }
    expect(px).toBeLessThan(28);
  });

  it("the radius never leaves the min and max bounds, however far the hand goes", () => {
    const wide = new EraserSizer();
    const wideEnd = hold(wide, 3, 200, wide.update(0.12, 28));
    expect(wideEnd).toBeLessThanOrEqual(ERASER_RADIUS_MAX_PX);
    expect(wideEnd).toBeGreaterThan(ERASER_RADIUS_MAX_PX - 2.5);

    const closed = new EraserSizer();
    const closedEnd = hold(closed, 0, 200, closed.update(0.8, 28));
    expect(closedEnd).toBeGreaterThanOrEqual(ERASER_RADIUS_MIN_PX);
    expect(closedEnd).toBeLessThan(ERASER_RADIUS_MIN_PX + 2.5);
  });

  it("a shaky second hand (gap wobbling by a hundredth of a span) does not tremble the radius", () => {
    const sizer = new EraserSizer();
    let px = sizer.update(0.3, 28);
    for (let i = 0; i < 60; i++) px = sizer.update(i % 2 === 0 ? 0.29 : 0.31, px);
    expect(px).toBe(28);
  });

  it("one large change moves the radius only part of the way per frame (smoothing)", () => {
    const sizer = new EraserSizer();
    const start = sizer.update(0.3, 28);
    const next = sizer.update(0.6, start);
    // Target is 47.4 px (28 + 0.3 span * 64.7 px per span); one frame covers 30 % of the way.
    expect(next).toBeGreaterThan(28);
    expect(next).toBeLessThan(47.4);
    expect(next).toBeCloseTo(33.8, 1);
  });

  it("a radius changed elsewhere (wheel, keys, buttons) starts a new anchor instead of snapping back", () => {
    const sizer = new EraserSizer();
    sizer.update(0.3, 28);
    expect(sizer.update(0.3, 40)).toBe(40);
  });

  it("a lost second hand holds the radius; when it returns the radius still does not jump", () => {
    const sizer = new EraserSizer();
    let px = sizer.update(0.3, 28);
    px = hold(sizer, 0.6, 10, px);
    const held = px;
    sizer.end(); // no second hand for a while: the caller keeps `held`
    expect(held).toBeGreaterThan(28);
    expect(sizer.update(0.1, held)).toBe(held);
  });
});
