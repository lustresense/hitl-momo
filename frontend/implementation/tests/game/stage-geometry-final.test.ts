import { describe, expect, it } from "vitest";
import { getFinalStageGeometry } from "@/src/game/stage-geometry-final";
import { sourceToPhysics } from "@/src/game/stage-transform";
import type { StageGeometry } from "@/src/game/stage-geometry";

const g = getFinalStageGeometry();
const scale = 800 / 490;
const offsetY = (450 - 325 * scale) / 2;

describe("Bab 4 final geometry (same mapping as stage-geometry.ts)", () => {
  it("is stage 4 on the shared 490x325 source and 800x450 physics world", () => {
    expect(g.stage).toBe(4);
    expect(g.sceneIndex).toBe(4);
    expect(g.source).toEqual({ width: 490, height: 325 });
    expect(g.world).toEqual({ width: 800, height: 450 });
  });

  it("maps source points exactly as stage-transform does", () => {
    for (const p of [{ x: 0, y: 0 }, { x: 100, y: 198 }, { x: 385, y: 50 }, { x: 490, y: 325 }]) {
      const expected = sourceToPhysics(p, g as unknown as StageGeometry);
      const actual = { x: p.x * scale, y: p.y * scale + offsetY };
      expect(actual.x).toBeCloseTo(expected.x);
      expect(actual.y).toBeCloseTo(expected.y);
    }
  });

  it("puts the spawn foot on the left cliff top and the goal on the tower top", () => {
    const left = g.platforms.find((p) => p.id === "stage-4-left-cliff")!;
    const tower = g.platforms.find((p) => p.id === "stage-4-right-tower")!;
    expect(Math.abs(g.spawn.y - left.y)).toBeLessThan(0.001);
    expect(g.spawn.x).toBeGreaterThanOrEqual(left.x);
    expect(g.spawn.x).toBeLessThanOrEqual(left.x + left.w);
    expect(Math.abs(g.goal.y + g.goal.h - tower.y)).toBeLessThan(0.001);
    expect(g.goal.x).toBeGreaterThanOrEqual(tower.x);
    expect(g.goal.x + g.goal.w).toBeLessThanOrEqual(tower.x + tower.w);
  });

  it("has one danger hazard under the gap, and the killY below the pit", () => {
    expect(g.hazards.map((h) => h.id)).toEqual(["stage-4-spike-pit"]);
    // Like stage 3's spike floor, the pit runs past the visible bottom; its top must be inside the world, below the cliffs.
    const pit = g.hazards[0]!;
    expect(pit.y).toBeLessThan(g.world.height);
    expect(pit.y).toBeGreaterThan(g.platforms[0]!.y);
    expect(g.killY).toBeGreaterThan(g.world.height);
  });

  it("keeps the 80x12 object size and the 24x24 goal box of the other stages", () => {
    expect(g.object.w).toBeCloseTo(80 * scale);
    expect(g.object.h).toBeCloseTo(12 * scale);
    expect(g.goal.w).toBeCloseTo(24 * scale, 0);
    expect(g.goal.h).toBeCloseTo(24 * scale, 0);
  });

  it("keeps every id unique", () => {
    const ids = [...g.platforms, ...g.hazards].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
