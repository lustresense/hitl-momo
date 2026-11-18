/**
 * Level 1 x footprint family: which boxes can solve the level with how many objects (kinematic model).
 * Doc: docs/execution/gameplay/LEVEL-1-FOOTPRINT.md. The browser E2E stays the authority.
 *
 * Level 1: left cliff -> gap -> right cliff with the flag. The rules the design needs:
 *   - ONE object alone never solves the level (not even with a late "coyote" jump);
 *   - 2 (and more) objects of any footprint except a dot-sized one always solve it, placements legal;
 *   - the e2e plan (cycles with the footprint of the drawing the journey uses) is legal and wins.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWorld, runPlan, simulateAction, solve } from "./level-reachability";
import { getStageGeometry, type Rect } from "../../src/game/stage-geometry";
import { integratedPlacementAllowed } from "../../src/game/kaplay-runtime";
import { inkFootprint } from "../../src/game/runtime/footprint";
import type { DrawingInput } from "../../src/domain/types";

const g = getStageGeometry(1);
const plans = JSON.parse(readFileSync(new URL("../../e2e/lib/level-plans.json", import.meta.url), "utf8"));
const [leftCliff, rightCliff] = g.platforms as unknown as [Rect, Rect];
const L = leftCliff.x + leftCliff.w; // the left cliff edge
const R = rightCliff.x; // the right cliff edge
const spawnBody: Rect = { x: g.spawn.x - 12, y: g.spawn.y - 40, w: 24, h: 40 };

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** The engine placement rule plus the lead's extra rule: never on Thinman's spawn body or on the flag. */
function legal(rects: Rect[]): boolean {
  return rects.every((r, i) => {
    const placed = rects.slice(0, i).map((o, j) => ({ id: `p${j}`, label: "x", behavior: "solid" as const, drawingInput: null, ...o }));
    return integratedPlacementAllowed(r, g, placed) && !overlaps(r, spawnBody) && !overlaps(r, g.goal);
  });
}

/** Strokes the way normalizeStrokes stores them: aspect kept, centred in the unit square. */
function ink(wPx: number, hPx: number, shape: "box" | "line-h" | "dot" = "box"): DrawingInput {
  const scale = Math.max(wPx, hPx);
  const nx = (px: number) => (scale - wPx) / 2 / scale + px / scale;
  const ny = (py: number) => (scale - hPx) / 2 / scale + py / scale;
  const strokes =
    shape === "line-h" ? [[{ x: nx(0), y: ny(0) }, { x: nx(wPx), y: ny(0) }]]
    : shape === "dot" ? [[{ x: 0.5, y: 0.5 }]]
    : [[{ x: nx(0), y: ny(0) }, { x: nx(wPx), y: ny(0) }, { x: nx(wPx), y: ny(hPx) }, { x: nx(0), y: ny(hPx) }, { x: nx(0), y: ny(0) }]];
  return { strokes, hasInk: true, aspectRatio: wPx / hPx };
}

const FOOTPRINTS = {
  flat: inkFootprint(ink(300, 1, "line-h"), g.objectLimits, g.object), // a straight line
  block: inkFootprint(ink(140, 50), g.objectLimits, g.object), // e2e "block" scribble (2.8 : 1)
  square: inkFootprint(ink(100, 100), g.objectLimits, g.object),
  tall: inkFootprint(ink(40, 100), g.objectLimits, g.object),
  spike: inkFootprint(ink(140, 100), g.objectLimits, g.object), // e2e "spike" scribble (1.4 : 1)
  dot: inkFootprint(ink(1, 1, "dot"), g.objectLimits, g.object),
} as const;
type Name = keyof typeof FOOTPRINTS;
const NAMES = Object.keys(FOOTPRINTS) as Name[];

/** `n` objects: two bridge the gap (equal gaps, tops level with the left cliff); the rest wait in the sky out of the jump. */
function layout(f: { w: number; h: number }, n: number): Rect[] {
  const gap = (R - L - 2 * f.w) / 3;
  const chain = [0, 1].map((i) => ({ x: L + gap + i * (f.w + gap), y: leftCliff.y, w: f.w, h: f.h }));
  const parked = Array.from({ length: Math.max(0, n - 2) }, (_, i) => ({ x: 20 + (i % 4) * (f.w + 12), y: i < 4 ? 10 : 80, w: f.w, h: f.h }));
  return [...chain, ...parked].slice(0, Math.max(n, 2));
}

/**
 * Fine two-jump search for ONE object (the BFS `solve` samples launch points too coarsely for a 5 px window):
 * jump from the left cliff edge onto the object, then from the object's far edge to the right cliff or flag.
 * `coyote` adds the late jump the engine allows (5 steps after leaving a ledge: ~13 px further, ~8 px lower).
 */
function singleObjectBridge(f: { w: number; h: number }, coyote: boolean): string | null {
  const extra = coyote ? 13 : 0;
  const sag = coyote ? 8 : 0;
  for (let gap1 = Math.max(0, R - L - f.w - 130); gap1 <= 130; gap1 += 1) {
    for (let y = leftCliff.y - 60; y <= leftCliff.y + 60; y += 2) {
      const o: Rect = { x: L + gap1, y, w: f.w, h: f.h };
      if (o.x + o.w > R || !legal([o])) continue;
      const world = buildWorld(1, [{ ...o, behavior: "solid" }]);
      let onObject = false;
      for (let x = L - 24; x < L + extra && !onObject; x += 0.5) {
        const r = simulateAction(world, { x, y: leftCliff.y - 40 + (x > L - 1 ? sag : 0) }, 1, true, 999, 400);
        onObject = r.outcome === "landed" && Math.abs(r.end.y + 40 - y) < 1;
      }
      if (!onObject) continue;
      for (let x = o.x + o.w - 24; x < o.x + o.w + extra; x += 0.5) {
        const r = simulateAction(world, { x, y: y - 40 + (x > o.x + o.w - 1 ? sag : 0) }, 1, true, 999, 400);
        if (r.outcome === "goal" || (r.outcome === "landed" && Math.abs(r.end.y + 40 - rightCliff.y) < 1)) return `object at x=${o.x.toFixed(1)} y=${y}, second launch x=${x.toFixed(1)}`;
      }
    }
  }
  return null;
}

describe("Level 1 footprint family (kinematic; browser E2E is the authority)", () => {
  it("prints the footprints the table is made of", () => {
    console.log("L1 limits (world)", JSON.stringify(g.objectLimits), "footprints", JSON.stringify(FOOTPRINTS));
    for (const f of Object.values(FOOTPRINTS)) {
      expect(f.w).toBeGreaterThanOrEqual(g.objectLimits.minW - 1e-6);
      expect(f.h).toBeLessThanOrEqual(g.objectLimits.maxH + 1e-6);
    }
  });

  for (const name of NAMES) {
    it(`${name}: ONE object alone never solves Level 1, not even with a late (coyote) jump`, () => {
      const f = FOOTPRINTS[name];
      expect(singleObjectBridge(f, false), `${name} ${f.w}x${f.h} plain jump`).toBeNull();
      expect(singleObjectBridge(f, true), `${name} ${f.w}x${f.h} coyote jump`).toBeNull();
    });
  }

  for (const name of NAMES) {
    for (const n of [2, 3, 4, 5, 6]) {
      it(`${name} x ${n}: legal placement solves Level 1`, () => {
        const f = FOOTPRINTS[name];
        const rects = layout(f, n);
        expect(rects).toHaveLength(n);
        expect(legal(rects), "legal (platforms, each other, spawn body, flag)").toBe(true);
        const r = solve(buildWorld(1, rects.map((o) => ({ ...o, behavior: "solid" as const }))));
        expect(r.solvable, `${name} ${f.w}x${f.h} x ${n}`).toBe(true);
      });
    }
  }

  it("the e2e plan: cycle 1 = block, cycle 2 = spike (the drawings the journey makes), legal and clear of spawn/flag", () => {
    const cycles: Array<{ x: number; y: number; w: number; h: number }> = plans["1"].cycles;
    expect(cycles).toHaveLength(2);
    for (const [c, f] of [[cycles[0]!, FOOTPRINTS.block], [cycles[1]!, FOOTPRINTS.spike]] as const) {
      expect(c.w).toBeCloseTo(f.w, 2);
      expect(c.h).toBeCloseTo(f.h, 2);
    }
    const rects = cycles.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    expect(legal(rects)).toBe(true);
    const r = runPlan(buildWorld(1, rects.map((o) => ({ ...o, behavior: "solid" as const }))), plans["1"].steps);
    expect(r.outcome, r.log.join("\n")).toBe("goal");
  });
});
