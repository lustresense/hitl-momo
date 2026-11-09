// Bab 4 kelayakan: same pattern as level-solvability.test.ts (n-1 objects fail, n objects succeed),
// run on the final geometry directly, because stage-geometry.ts does not know stage 4 yet.
import { describe, expect, it } from "vitest";
import { getFinalStageGeometry } from "@/src/game/stage-geometry-final";
import type { StageGeometry } from "@/src/game/stage-geometry";
import { integratedPlacementAllowed } from "@/src/game/runtime/rules";
import type { WorldCreation } from "@/src/game/creation-store";
import { LEVELS } from "@/src/domain/levels";
import { solve, runPlan, type World } from "./level-reachability";

const SIZE = { w: 130.6122, h: 19.5918 };

// Documented student plan (physics px, object top-left). Found with the kinematic solver:
// a three-step staircase up to the tower. Each object survives a 6 px shift in any direction.
const CYCLES = [
  { label: "papan", x: 166, y: 223 },
  { label: "balok", x: 330, y: 163 },
  { label: "tangga", x: 470, y: 103 },
];
// Jumps: stand at launchX on the current surface, jump right and hold right until landing.
const STEPS = [
  { launchX: 87, hold: 26 },
  { launchX: 251, hold: 26 },
  { launchX: 389, hold: 26 },
  { launchX: 547, hold: 26 },
];

// level-reachability's World is typed for StageGeometry, whose stage union has no 4 yet.
const geometry = (): StageGeometry => getFinalStageGeometry() as unknown as StageGeometry;

function creation(id: string, x: number, y: number, behavior: "solid" | "danger"): WorldCreation {
  return { id, label: "", behavior, drawingInput: null, x, y, w: SIZE.w, h: SIZE.h };
}

function worldWith(objects: WorldCreation[]): World {
  const g = geometry();
  const solids = [...g.platforms];
  const hazards = [...g.hazards];
  for (const o of objects) {
    if (o.behavior === "solid") solids.push(o);
    else if (o.behavior === "danger") hazards.push(o);
  }
  return { g, solids, hazards };
}

const planObjects = (behavior: "solid" | "danger" = "solid") => CYCLES.map((c, i) => creation(`c${i}`, c.x, c.y, behavior));

describe("Bab 4 Pembuktian: solvability (kinematic model; browser E2E is the authority)", () => {
  const level = LEVELS[3]!;

  it("the documented plan has exactly minDrawings objects", () => {
    expect(CYCLES).toHaveLength(level.minDrawings);
  });

  it("the spike pit spans the gap and the goal sits on the tower", () => {
    const g = geometry();
    expect(g.hazards).toHaveLength(1);
    expect(g.hazards[0]!.id).toContain("spike");
    expect(g.goal.x).toBeGreaterThan(g.world.width * 0.85);
  });

  it("no object: not solvable", () => {
    expect(solve(worldWith([])).solvable).toBe(false);
  });

  it("the documented plan is legal to place one object after another", () => {
    const g = geometry();
    const placed: WorldCreation[] = [];
    for (const [i, c] of CYCLES.entries()) {
      const item = creation(`c${i}`, c.x, c.y, "solid");
      expect(integratedPlacementAllowed(item, g, placed), `cycle ${i + 1}`).toBe(true);
      placed.push(item);
    }
  });

  it("the documented plan reaches the goal in the kinematic model", () => {
    const r = runPlan(worldWith(planObjects()), STEPS);
    expect(r.outcome, r.log.join("\n")).toBe("goal");
  });

  it("minDrawings - 1 objects is not enough: no two of the plan objects reach the goal", () => {
    for (let skip = 0; skip < CYCLES.length; skip++) {
      const pair = planObjects().filter((_, i) => i !== skip);
      expect(solve(worldWith(pair)).solvable, `without cycle ${skip + 1}`).toBe(false);
    }
  });

  it("minDrawings - 1 objects is not enough: each plan object alone fails", () => {
    for (const o of planObjects()) expect(solve(worldWith([o])).solvable).toBe(false);
  });

  it("still solvable when any one object is off by 6 px (placement is not pixel-perfect)", () => {
    // Searches for a route (not the fixed launch points above), so the margin is about the geometry.
    for (const [i, o] of CYCLES.entries()) {
      for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]] as const) {
        const moved = CYCLES.map((c, j) => creation(`c${j}`, j === i ? c.x + dx : c.x, j === i ? c.y + dy : c.y, "solid"));
        expect(solve(worldWith(moved)).solvable, `object ${i + 1} (${o.label}) shifted ${dx},${dy}`).toBe(true);
      }
    }
  });

  it("random legal two-object placements (seeded sample) do not reach the goal", () => {
    const g = geometry();
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let checked = 0;
    while (checked < 40) {
      const a = creation("a", 20 + rnd() * 700, 40 + rnd() * 400, "solid");
      if (!integratedPlacementAllowed(a, g, [])) continue;
      const b = creation("b", 20 + rnd() * 700, 40 + rnd() * 400, "solid");
      if (!integratedPlacementAllowed(b, g, [a])) continue;
      checked++;
      expect(solve(worldWith([a, b])).solvable, `pair ${checked}: (${a.x.toFixed(0)},${a.y.toFixed(0)}) (${b.x.toFixed(0)},${b.y.toFixed(0)})`).toBe(false);
    }
  });

  it("a danger object on the route fails the plan (the trap is real)", () => {
    const [c0, c1, c2] = planObjects();
    const withDanger = [c0!, creation("trap", c1!.x, c1!.y, "danger"), c2!];
    const r = runPlan(worldWith(withDanger), STEPS);
    expect(r.outcome).not.toBe("goal");
  });
});
