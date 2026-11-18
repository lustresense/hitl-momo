import { describe, expect, it } from "vitest";
import { inkFootprint } from "../../src/game/runtime/footprint";
import { inkInset, fitInkToBox } from "../../src/game/sketch-renderer";
import { getStageGeometry } from "../../src/game/stage-geometry";
import { createPendingCreation } from "../../src/game/runtime/creations";
import type { DrawingInput } from "../../src/domain/types";

const limits = getStageGeometry(1).objectLimits;
const plank = getStageGeometry(1).object;

/** Strokes the way normalizeStrokes stores them: aspect kept, centred in the unit square. */
function ink(wPx: number, hPx: number, shape: "box" | "line-h" | "line-v" | "dot" | "heart" = "box"): DrawingInput {
  const scale = Math.max(wPx, hPx);
  const ox = (scale - wPx) / 2 / scale;
  const oy = (scale - hPx) / 2 / scale;
  const nx = (px: number) => ox + px / scale;
  const ny = (py: number) => oy + py / scale;
  let strokes: Array<Array<{ x: number; y: number }>>;
  if (shape === "line-h") strokes = [[{ x: nx(0), y: ny(0) }, { x: nx(wPx), y: ny(0) }]];
  else if (shape === "line-v") strokes = [[{ x: nx(0), y: ny(0) }, { x: nx(0), y: ny(hPx) }]];
  else if (shape === "dot") strokes = [[{ x: 0.5, y: 0.5 }]];
  else strokes = [[{ x: nx(0), y: ny(0) }, { x: nx(wPx), y: ny(0) }, { x: nx(wPx), y: ny(hPx) }, { x: nx(0), y: ny(hPx) }, { x: nx(0), y: ny(0) }]];
  return { strokes, hasInk: true, aspectRatio: wPx / hPx };
}

describe("inkFootprint: the collider is the drawing's own box", () => {
  it("a square drawing gets a square box, not the old 130 x 20 plank", () => {
    const f = inkFootprint(ink(100, 100), limits, plank);
    expect(f.w / f.h).toBeCloseTo(1, 1);
    expect(f.h).toBeGreaterThan(plank.h * 2);
    expect(f.h).toBeLessThanOrEqual(limits.maxH + 1e-6);
  });

  it("a wide drawing fills the width and keeps its proportions", () => {
    const f = inkFootprint(ink(280, 100), limits, plank); // 2.8 : 1
    expect(f.w).toBeCloseTo(limits.maxW, 1);
    // The inset on both sides is the same for width and height, so the ink proportions are exact.
    const m = inkInset(f.w, f.h);
    expect((f.w - 2 * m) / (f.h - 2 * m)).toBeCloseTo(2.8, 1);
  });

  it("a tall drawing fills the height and gets a narrow box", () => {
    const f = inkFootprint(ink(40, 200), limits, plank);
    expect(f.h).toBeCloseTo(limits.maxH, 1);
    expect(f.w).toBeLessThan(f.h);
    expect(f.w).toBeGreaterThanOrEqual(limits.minW);
  });

  it("a flat horizontal line becomes a thin plank at full width", () => {
    const f = inkFootprint(ink(300, 1, "line-h"), limits, plank);
    expect(f.w).toBeCloseTo(limits.maxW, 1);
    expect(f.h).toBeCloseTo(limits.minH, 1);
  });

  it("a vertical line becomes a thin post at full height", () => {
    const f = inkFootprint(ink(1, 300, "line-v"), limits, plank);
    expect(f.h).toBeCloseTo(limits.maxH, 1);
    expect(f.w).toBeCloseTo(limits.minW, 1);
  });

  it("a dot gets the smallest box", () => {
    const f = inkFootprint(ink(1, 1, "dot"), limits, plank);
    expect(f.w).toBeCloseTo(limits.minW, 1);
    expect(f.h).toBeCloseTo(limits.minH, 1);
  });

  it("no ink at all keeps the old plank, so nothing changes for an empty drawing", () => {
    expect(inkFootprint(null, limits, plank)).toEqual({ w: plank.w, h: plank.h });
    expect(inkFootprint({ strokes: [], hasInk: false, aspectRatio: 1 }, limits, plank)).toEqual({ w: plank.w, h: plank.h });
  });

  it("never leaves the limits, whatever the drawing", () => {
    for (const [w, h] of [[1000, 3], [3, 1000], [50, 50], [500, 480], [5, 5], [120, 60]] as const) {
      const f = inkFootprint(ink(w, h), limits, plank);
      expect(f.w).toBeGreaterThanOrEqual(limits.minW - 1e-6);
      expect(f.w).toBeLessThanOrEqual(limits.maxW + 1e-6);
      expect(f.h).toBeGreaterThanOrEqual(limits.minH - 1e-6);
      expect(f.h).toBeLessThanOrEqual(limits.maxH + 1e-6);
    }
  });

  it("the drawn ink fills the box up to the stroke margin on its limiting side", () => {
    // What the renderer draws in this box must reach (almost) both edges of the box: no air to stand on.
    for (const [w, h] of [[100, 100], [280, 100], [60, 200]] as const) {
      const input = ink(w, h);
      const f = inkFootprint(input, limits, plank);
      const marks = fitInkToBox(input.strokes, { w: Math.round(f.w), h: Math.round(f.h) }, { inset: inkInset(Math.round(f.w), Math.round(f.h)) });
      const xs = marks.flat().map((p) => p.x);
      const ys = marks.flat().map((p) => p.y);
      const air = (a: number) => Math.round(a * 10) / 10;
      const gapX = Math.min(Math.min(...xs), f.w - Math.max(...xs));
      const gapY = Math.min(Math.min(...ys), f.h - Math.max(...ys));
      expect(air(Math.min(gapX, gapY)), `${w}x${h}`).toBeLessThanOrEqual(3);
    }
  });
});

describe("createPendingCreation uses the drawing's footprint", () => {
  it("sits on the spawn platform with the drawing's own height", () => {
    const g = getStageGeometry(1);
    const c = createPendingCreation({ finalLabel: "balok", behavior: "solid", drawingInput: ink(100, 100) }, g);
    expect(c.w / c.h).toBeCloseTo(1, 1);
    const spawnPlatform = g.platforms.find((p) => Math.abs(p.y - g.spawn.y) < 1)!;
    expect(c.y + c.h).toBeCloseTo(spawnPlatform.y, 5);
    expect(c.x + c.w).toBeLessThanOrEqual(g.world.width);
  });
});

import { hazardZone, HAZARD_FORGIVENESS } from "../../src/game/runtime/footprint";
describe("hazardZone: a spike hurts inside its drawing, not on the empty corners", () => {
  it("is smaller than the box on every side and centred", () => {
    const z = hazardZone(130, 50);
    expect(z.x).toBeCloseTo(130 * HAZARD_FORGIVENESS, 5);
    expect(z.y).toBeCloseTo(50 * HAZARD_FORGIVENESS, 5);
    expect(z.w).toBeCloseTo(130 - 2 * z.x, 5);
    expect(z.h).toBeCloseTo(50 - 2 * z.y, 5);
  });
  it("never collapses a tiny box", () => {
    const z = hazardZone(8, 4);
    expect(z.w).toBeGreaterThan(0);
    expect(z.h).toBeGreaterThan(0);
  });
});
