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
  // Level 2 buildings are solid, so the documented balok at (190, 220) now sits inside the middle
  // building and is illegal. This 2-object plan (balok moved left of the building, papan as documented)
  // is the one the kinematic solver verified; it proves minDrawings = 2 still reaches the goal.
  it("L2: a legal 2-object plan reaches the goal once the buildings are solid (balok at 100,220)", () => {
    const g = getStageGeometry(2);
    const balok = { x: 100, y: 220, w: size.w, h: size.h };
    const papan = { x: plans["2"].cycles[1].x, y: plans["2"].cycles[1].y, w: size.w, h: size.h };
    expect(integratedPlacementAllowed(balok, g, []), "balok placement legal").toBe(true);
    expect(integratedPlacementAllowed(papan, g, [{ id: "b", label: "balok", behavior: "solid", drawingInput: null, ...balok }]), "papan placement legal").toBe(true);
    const w = buildWorld(2, [{ ...balok, behavior: "solid" }, { ...papan, behavior: "solid" }]);
    const r = runPlan(w, [{ launchX: 76, hold: 10 }, { launchX: 201, hold: 22 }, { launchX: 294, hold: 36 }, { launchX: 417, hold: 22 }, { launchX: 500, hold: 30 }]);
    expect(r.outcome, r.log.join("\n")).toBe("goal");
  });
  it("L1-L3 are NOT solvable without a placed object (the object matters)", () => {
    for (const stage of [1, 2, 3] as const) expect(solve(buildWorld(stage)).solvable, `L${stage}`).toBe(false);
  });
  it("PRD 0.0.16 R8.1: Thinman walks slower than the old 200 px/s", () => {
    expect(WALK_SPEED).toBeLessThanOrEqual(140);
  });
  for (const level of LEVELS) {
    const stage = level.stage as 1 | 2 | 3;
    const plan: Array<{ x: number; y: number }> = plans[String(stage)].cycles;
    it(`L${stage}: documented plan uses exactly minDrawings (${level.minDrawings}) objects`, () => {
      expect(plan).toHaveLength(level.minDrawings);
    });
    // Works for any minDrawings: leaving out one plan object leaves minDrawings - 1 objects, which must fail.
    it(`L${stage}: minDrawings - 1 objects is not enough (the plan with any one object left out)`, () => {
      for (let skip = 0; skip < plan.length; skip++) {
        const rest = plan
          .filter((_, i) => i !== skip)
          .map((c) => ({ x: c.x, y: c.y, w: size.w, h: size.h, behavior: "solid" as const }));
        expect(solve(buildWorld(stage, rest)).solvable, `without object ${skip + 1}`).toBe(false);
      }
    }, 300_000);
    it(`L${stage}: one object alone is not enough (placement grid)`, () => {
      // Every level needs at least two objects, so a single object must never solve it.
      expect(level.minDrawings).toBeGreaterThanOrEqual(2);
      const g = getStageGeometry(stage);
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
