/**
 * Level 2 and the shape of the student's drawing (see docs/execution/gameplay/LEVEL-2-FOOTPRINT.md).
 *
 * An object now takes its drawing's own box (inkFootprint), so a drawing is no longer one fixed plank. This file
 * pins what the level must stay: every common footprint is playable, one object alone never wins, and the first
 * step fits next to Thinman. Kinematic model only (tests/game/level-reachability.ts); the browser is the authority.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inkFootprint } from "../../src/game/runtime/footprint";
import { rectanglesOverlap, integratedPlacementAllowed } from "../../src/game/runtime/rules";
import { getStageGeometry, type Rect } from "../../src/game/stage-geometry";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../../src/game/runtime/constants";
import type { DrawingInput } from "../../src/domain/types";
import { buildWorld, solve } from "./level-reachability";

const g = getStageGeometry(2);
const plank = g.object;

/** Strokes the way normalizeStrokes stores them: aspect kept, centred in the unit square. */
function ink(strokes: number[][][]): DrawingInput {
  const pts = strokes.flat();
  const xs = pts.map((p) => p[0]!), ys = pts.map((p) => p[1]!);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const side = Math.max(x1 - x0, y1 - y0, 1e-9);
  const ox = (side - (x1 - x0)) / 2 / side, oy = (side - (y1 - y0)) / 2 / side;
  return {
    strokes: strokes.map((s) => s.map((p) => ({ x: ox + (p[0]! - x0) / side, y: oy + (p[1]! - y0) / side }))),
    hasInk: true,
    aspectRatio: (x1 - x0) / Math.max(y1 - y0, 1e-9),
  } as DrawingInput;
}
const box = (w: number, h: number) => [[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]];

/** The six drawings the e2e harness and a student typically make (block and spike are the harness scribbles). */
const DRAWINGS = {
  flat: ink([[[0, 0], [300, 0]]]),
  block: ink([[[-70, -20], [70, -20], [70, 30], [-70, 30], [-70, -20]], [[-40, 0], [0, 10], [40, 0]]]),
  square: ink(box(100, 100)),
  tall: ink(box(40, 200)),
  spike: ink([[[-70, 40], [-35, -60], [0, 40], [35, -60], [70, 40]]]),
  dot: { strokes: [[{ x: 0.5, y: 0.5 }]], hasInk: true, aspectRatio: 1 } as DrawingInput,
};
type Name = keyof typeof DRAWINGS;
const NAMES = Object.keys(DRAWINGS) as Name[];
const FP = Object.fromEntries(NAMES.map((n) => [n, inkFootprint(DRAWINGS[n], g.objectLimits, plank)])) as Record<Name, { w: number; h: number }>;

const spawnBody: Rect = { x: g.spawn.x - PLAYER_WIDTH / 2, y: g.spawn.y - PLAYER_HEIGHT, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
/** The legality the engine applies: inside the world, off the platforms, off other solids, clear of Thinman's spawn body and the goal. */
function legal(rect: Rect, placed: Rect[]): boolean {
  const items = placed.map((p, i) => ({ id: `p${i}`, label: "x", behavior: "solid" as const, drawingInput: null, ...p }));
  return integratedPlacementAllowed(rect, g, items) && !rectanglesOverlap(rect, spawnBody) && !rectanglesOverlap(rect, g.goal);
}
const world = (rects: Rect[]) => buildWorld(2, rects.map((r) => ({ ...r, behavior: "solid" as const })));

describe("Level 2: footprints of the common drawings", () => {
  it("the first step fits between Thinman's spawn body and the middle building's cap, with room to place it", () => {
    const cap = g.platforms.find((p) => p.id === "stage-2-middle-cap")!;
    const room = cap.x - (spawnBody.x + spawnBody.w);
    for (const n of NAMES) expect(room - FP[n].w, `${n} ${FP[n].w}x${FP[n].h} must leave >= 15 px of placing room (room ${room.toFixed(1)})`).toBeGreaterThanOrEqual(15);
  });
});

/** Two objects of the same footprint that solve the level: [first step beside Thinman, bridge from the middle roof to the upper ledge]. */
const PAIR: Record<Name, [[number, number], [number, number]]> = {
  flat: [[145, 225], [385, 120]],
  block: [[148, 236], [390, 120]],
  square: [[145, 201], [390, 100]],
  tall: [[145, 211], [390, 100]],
  spike: [[145, 201], [375, 100]],
  dot: [[120, 210], [440, 120]],
};

/** Spare objects are parked in the strip right of the right-hand building: legal, out of the route (the player wins before it). */
function parked(name: Name, count: number): Rect[] {
  const { w, h } = FP[name];
  return Array.from({ length: count }, (_, k) => ({ x: g.world.width - w - 2, y: g.world.height - (k + 1) * (h + 2), w, h }));
}
function witness(name: Name, n: number): Rect[] {
  const { w, h } = FP[name];
  return [...PAIR[name].map(([x, y]) => ({ x, y, w, h })), ...parked(name, n - 2)];
}
function placeAll(rects: Rect[]) {
  const placed: Rect[] = [];
  for (const [i, r] of rects.entries()) {
    expect(legal(r, placed), `object ${i + 1} at ${r.x},${r.y} ${r.w.toFixed(1)}x${r.h.toFixed(1)} is a legal placement`).toBe(true);
    placed.push(r);
  }
}

describe("Level 2: N objects of one footprint (placements anywhere legal)", () => {
  for (const name of NAMES) {
    for (const n of [2, 3, 4, 5, 6]) {
      it(`${name} ${FP[name].w.toFixed(1)}x${FP[name].h.toFixed(1)}: ${n} objects solve the level`, () => {
        const rects = witness(name, n);
        placeAll(rects);
        expect(solve(world(rects)).solvable).toBe(true);
      }, 120_000);
    }
  }
});

describe("Level 2: one object alone never solves it", () => {
  // Sound shortcut: a lone object can only change the outcome if Thinman can reach it, so only placements within one
  // jump of a spot the empty level already lets him stand on are solved; the rest cannot differ from the empty level.
  const base = solve(world([]));
  const standing = base.reached ?? [];
  const touchable = (r: Rect) => standing.some((s) => r.x < s.x + PLAYER_WIDTH + 100 && r.x + r.w > s.x - 100 && r.y + r.h > s.y + PLAYER_HEIGHT - 100 && r.y < s.y + PLAYER_HEIGHT + 200);
  it("the empty level is not solvable (the object matters)", () => expect(base.solvable).toBe(false));
  for (const name of NAMES) {
    it(`${name} ${FP[name].w.toFixed(1)}x${FP[name].h.toFixed(1)}: no single placement wins (grid 60 x 30)`, () => {
      const { w, h } = FP[name];
      let tried = 0;
      for (let x = 0; x + w <= g.world.width; x += 60) for (let y = 0; y + h <= g.world.height; y += 30) {
        const r = { x, y, w, h };
        if (!legal(r, []) || !touchable(r)) continue;
        tried++;
        expect(solve(world([r])).solvable, `one ${name} at ${x},${y}`).toBe(false);
      }
      expect(tried, "the grid reached some placements").toBeGreaterThan(5);
    }, 600_000);
  }
});

describe("Level 2: the e2e journey plan", () => {
  const plan = JSON.parse(readFileSync(new URL("../../e2e/lib/level-plans.json", import.meta.url), "utf8"))["2"] as { cycles: Array<{ x: number; y: number; w: number; h: number }> };
  it("each cycle carries the footprint of the drawing the journey draws (cycle 1 block, cycle 2 spike)", () => {
    for (const [i, name] of (["block", "spike"] as const).entries()) {
      expect(plan.cycles[i]!.w).toBeCloseTo(FP[name].w, 1);
      expect(plan.cycles[i]!.h).toBeCloseTo(FP[name].h, 1);
    }
  });
  it("the plan's objects are legal placements clear of Thinman's spawn body and the goal", () => {
    placeAll(plan.cycles.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })));
  });
});
