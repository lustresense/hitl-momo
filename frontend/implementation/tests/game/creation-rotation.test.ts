import { describe, expect, it } from "vitest";
import type { WorldCreation } from "@/src/game/creation-store";
import {
  footprintOf,
  quarterTurn,
  rotatedAround,
} from "@/src/game/runtime/creations";
import { integratedPlacementAllowed } from "@/src/game/kaplay-runtime";
import { getStageGeometry } from "@/src/game/stage-geometry";

const base = (over: Partial<WorldCreation> = {}): WorldCreation => ({
  id: "c1",
  label: "papan",
  behavior: "solid",
  drawingInput: null,
  x: 100,
  y: 200,
  w: 150,
  h: 8,
  ...over,
});

describe("creation rotation: footprint swaps w and h at 90 and 270 degrees", () => {
  it("keeps the authored box at 0 and 180 degrees (and when no angle is stored)", () => {
    expect(footprintOf(base())).toEqual({ x: 100, y: 200, w: 150, h: 8 });
    expect(footprintOf(base({ angle: 0 }))).toEqual({ x: 100, y: 200, w: 150, h: 8 });
    expect(footprintOf(base({ angle: 180 }))).toEqual({ x: 100, y: 200, w: 150, h: 8 });
  });

  it("swaps width and height at 90 and 270 degrees, keeping the top-left", () => {
    expect(footprintOf(base({ angle: 90 }))).toEqual({ x: 100, y: 200, w: 8, h: 150 });
    expect(footprintOf(base({ angle: 270 }))).toEqual({ x: 100, y: 200, w: 8, h: 150 });
  });
});

describe("creation rotation: quarter turns", () => {
  it("cycles 0 -> 90 -> 180 -> 270 -> 0", () => {
    expect(quarterTurn(0)).toBe(90);
    expect(quarterTurn(90)).toBe(180);
    expect(quarterTurn(180)).toBe(270);
    expect(quarterTurn(270)).toBe(0);
  });
});

describe("creation rotation: rotatedAround keeps the centre of the object", () => {
  it("moves the top-left so the centre of the footprint stays put", () => {
    const item = base();
    const turned = rotatedAround(item, 90);
    expect(turned.angle).toBe(90);
    // centre before: (100 + 75, 200 + 4) = (175, 204); after the turn the footprint is 8 wide, 150 tall
    expect(turned.x + 8 / 2).toBe(175);
    expect(turned.y + 150 / 2).toBe(204);
    expect(turned.x).toBe(171);
    expect(turned.y).toBe(129);
    expect(turned.w).toBe(150);
    expect(turned.h).toBe(8);
  });

  it("returns to the original box after four turns", () => {
    let item = base();
    for (let i = 0; i < 4; i++) item = rotatedAround(item, quarterTurn(item.angle ?? 0));
    expect(item.angle ?? 0).toBe(0);
    expect(footprintOf(item)).toEqual({ x: 100, y: 200, w: 150, h: 8 });
  });
});

describe("creation rotation: legal placement uses the rotated footprint", () => {
  const geometry = getStageGeometry(2);

  it("a tall 90-degree footprint that pokes through a platform is illegal", () => {
    const platform = geometry.platforms.find((p) => p.w > 0)!;
    // Put the object's centre on the platform top: the tall footprint must cross it.
    const item = base({ x: platform.x + 20, y: platform.y - 40, w: 150, h: 8 });
    const turned = rotatedAround(item, 90);
    expect(integratedPlacementAllowed(footprintOf(turned), geometry, [], turned.id)).toBe(false);
  });

  it("the unrotated object at the same spot is legal when it sits above the platform", () => {
    const platform = geometry.platforms.find((p) => p.w > 0)!;
    const item = base({ x: platform.x + 20, y: platform.y - 40, w: 150, h: 8 });
    expect(integratedPlacementAllowed(footprintOf(item), geometry, [], item.id)).toBe(true);
  });

  it("a rotated solid blocks another object by its footprint, not its unrotated box", () => {
    // Empty sky on stage 2 (no platforms above y 150 on the left): isolates the object-vs-object check.
    const wall = base({ id: "wall", x: 30, y: 20, w: 150, h: 8, behavior: "solid", angle: 90 });
    const probe = { x: 32, y: 100, w: 40, h: 8 }; // crosses the 8x150 footprint, misses the 150x8 box
    expect(integratedPlacementAllowed(probe, geometry, [{ ...wall, ...footprintOf(wall) }], "probe")).toBe(false);
    const flat = { ...wall, angle: undefined };
    expect(integratedPlacementAllowed(probe, geometry, [{ ...flat, ...footprintOf(flat) }], "probe")).toBe(true);
  });
});
