import { describe, expect, it } from "vitest";
import { integratedPlacementAllowed, rectanglesOverlap } from "../../src/game/runtime/rules";
import { spawnBodyOf } from "../../src/game/runtime/rules";
import { getStageGeometry } from "../../src/game/stage-geometry";

describe("an object may not land on Thinman's start or on the flag", () => {
  for (const stage of [1, 2, 3] as const) {
    const g = getStageGeometry(stage);
    const box = { w: 58.8, h: 58.8 };

    it(`L${stage}: a box on the spawn body is refused`, () => {
      const body = spawnBodyOf(g);
      const onSpawn = { x: body.x - 10, y: body.y - 5, ...box };
      expect(rectanglesOverlap(onSpawn, body)).toBe(true);
      expect(integratedPlacementAllowed(onSpawn, g, [])).toBe(false);
    });

    it(`L${stage}: a box on the goal flag is refused`, () => {
      const onGoal = { x: g.goal.x - 10, y: g.goal.y - 20, ...box };
      expect(integratedPlacementAllowed(onGoal, g, [])).toBe(false);
    });
  }

  it("a box standing right next to the spawn, not touching Thinman, is still fine", () => {
    const g = getStageGeometry(1);
    const body = spawnBodyOf(g);
    const next = { x: body.x + body.w + 6, y: g.platforms[0]!.y - 40, w: 40, h: 40 };
    expect(integratedPlacementAllowed(next, g, [])).toBe(true);
  });
});
