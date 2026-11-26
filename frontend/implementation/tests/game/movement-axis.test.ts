import { describe, expect, it } from "vitest";
import { resolveHorizontalMovementIntent } from "@/src/game/kaplay-runtime";
import { WALK_SPEED } from "@/src/game/runtime/constants";
import type { DirectionInput } from "@/src/game/runtime/types";

describe("resolveHorizontalMovementIntent with analog axis (PLAN §5.2.2 & §5.3.6)", () => {
  it("keeps legacy boolean truth table 100% identical when axis is absent", () => {
    const cases: Array<[boolean, boolean, boolean, boolean, number]> = [];
    for (const left of [false, true]) {
      for (const right of [false, true]) {
        for (const gameplay of [false, true]) {
          for (const settled of [false, true]) {
            const legacy = gameplay && !settled ? (Number(right) - Number(left)) * WALK_SPEED : 0;
            cases.push([left, right, gameplay, settled, legacy]);
          }
        }
      }
    }

    for (const [left, right, gameplay, settled, expected] of cases) {
      const input: DirectionInput = { left, right, jump: false };
      const actual = resolveHorizontalMovementIntent(input, gameplay, settled);
      expect(Object.is(actual, expected)).toBe(true);
    }
  });

  it("maps axis +-1 to +-130 and fractional axis 0.35 to 45.5", () => {
    expect(WALK_SPEED).toBe(130);
    expect(resolveHorizontalMovementIntent({ left: false, right: true, axis: 1 }, true, false)).toBe(130);
    expect(resolveHorizontalMovementIntent({ left: true, right: false, axis: -1 }, true, false)).toBe(-130);
    expect(resolveHorizontalMovementIntent({ left: false, right: true, axis: 0.35 }, true, false)).toBeCloseTo(45.5, 10);
    expect(resolveHorizontalMovementIntent({ left: true, right: false, axis: -0.35 }, true, false)).toBeCloseTo(-45.5, 10);
    expect(Object.is(resolveHorizontalMovementIntent({ left: false, right: false, axis: 0 }, true, false), 0)).toBe(true);
    expect(Object.is(resolveHorizontalMovementIntent({ left: false, right: false, axis: -0 }, true, false), 0)).toBe(true);
  });

  it("clamps axis outside [-1, 1] (e.g., +-2 -> +-130)", () => {
    expect(resolveHorizontalMovementIntent({ left: false, right: true, axis: 2 }, true, false)).toBe(130);
    expect(resolveHorizontalMovementIntent({ left: true, right: false, axis: -2 }, true, false)).toBe(-130);
  });

  it("returns 0 when outside gameplay or settled even with non-zero axis", () => {
    expect(resolveHorizontalMovementIntent({ left: false, right: true, axis: 0.8 }, false, false)).toBe(0);
    expect(resolveHorizontalMovementIntent({ left: false, right: true, axis: 0.8 }, true, true)).toBe(0);
    expect(resolveHorizontalMovementIntent({ left: true, right: false, axis: -1 }, false, true)).toBe(0);
  });

  it("falls back to legacy boolean calculation if axis is non-finite", () => {
    expect(resolveHorizontalMovementIntent({ left: false, right: true, axis: Number.NaN }, true, false)).toBe(130);
    expect(resolveHorizontalMovementIntent({ left: true, right: false, axis: Number.POSITIVE_INFINITY }, true, false)).toBe(-130);
    expect(resolveHorizontalMovementIntent({ left: false, right: false, axis: Number.NEGATIVE_INFINITY }, true, false)).toBe(0);
  });
});
