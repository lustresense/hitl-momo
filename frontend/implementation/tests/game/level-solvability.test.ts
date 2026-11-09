import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWorld, runPlan, solve } from "./level-reachability";
import { getStageGeometry } from "../../src/game/stage-geometry";
import { integratedPlacementAllowed } from "../../src/game/kaplay-runtime";
import { LEVELS } from "../../src/domain/levels";
import { WALK_SPEED } from "../../src/game/runtime/constants";

const plans = JSON.parse(readFileSync(new URL("../../e2e/lib/level-plans.json", import.meta.url), "utf8"));
const size = plans.objectSize as { w: number; h: number };

describe("level solvability (kinematic model; browser E2E is the authority)", () => {
  for (const stage of [1, 2, 3] as const) {
    it(`L${stage}: documented student plan reaches the goal with legal placements`, () => {
      const g = getStageGeometry(stage);
      const placed: Array<{ id: string; label: string; behavior: "solid"; drawingInput: null; x: number; y: number; w: number; h: number }> = [];
      for (const [i, c] of plans[String(stage)].cycles.entries()) {
        const rect = { x: c.x, y: c.y, w: size.w, h: size.h };
        expect(integratedPlacementAllowed(rect, g, placed), `cycle ${i + 1} placement legal`).toBe(true);
        placed.push({ id: `c${i}`, label: c.label, behavior: "solid", drawingInput: null, ...rect });
      }
      const w = buildWorld(stage, placed.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, behavior: "solid" as const })));
      const r = runPlan(w, plans[String(stage)].steps);
      expect(r.outcome, r.log.join("\n")).toBe("goal");
    });
  }
  it("L1/L2/L3 are NOT solvable without a placed object (the object matters)", () => {
    for (const stage of [1, 2, 3] as const) expect(solve(buildWorld(stage)).solvable).toBe(false);
  });
  it("PRD 0.0.16 R8.1: Thinman walks slower than the old 200 px/s", () => {
    expect(WALK_SPEED).toBeLessThanOrEqual(140);
  });
  for (const level of LEVELS) {
    const stage = level.stage as 1 | 2 | 3;
    it(`L${stage}: documented plan uses exactly minDrawings (${level.minDrawings}) objects`, () => {
      expect(plans[String(stage)].cycles).toHaveLength(level.minDrawings);
    });
    it(`L${stage}: minDrawings - 1 objects is not enough (each plan object alone, and a placement grid)`, () => {
      expect(level.minDrawings).toBe(2);
      const g = getStageGeometry(stage);
      for (const c of plans[String(stage)].cycles) {
        expect(solve(buildWorld(stage, [{ x: c.x, y: c.y, w: size.w, h: size.h, behavior: "solid" }])).solvable).toBe(false);
      }
      // Coarse grid over the whole world (finer 6-10 px grids were checked offline when tuning WALK_SPEED).
      for (let x = 20; x <= g.world.width - size.w; x += 45) for (let y = 60; y <= g.world.height - size.h; y += 45) {
        const rect = { x, y, w: size.w, h: size.h };
        if (!integratedPlacementAllowed(rect, g, [])) continue;
        expect(solve(buildWorld(stage, [{ ...rect, behavior: "solid" }])).solvable, `one object at ${x},${y}`).toBe(false);
      }
    }, 300_000);
  }
  it("L3: a danger-behaviour object on the route fails the plan (hazard is real)", () => {
    const [c0, c1] = plans["3"].cycles;
    const w = buildWorld(3, [{ x: c0.x, y: c0.y, w: size.w, h: size.h, behavior: "solid" }, { x: c1.x, y: c1.y, w: size.w, h: size.h, behavior: "danger" }]);
    expect(runPlan(w, plans["3"].steps).outcome).toBe("dead");
  });
});
