import { describe, expect, it } from "vitest";
import { handRollAngle, rollSteps, wrapDegrees, ROLL_HYSTERESIS_DEG, ROLL_STEP_DEG } from "@/src/input/hand-rotation";
import { poseHand, rollHand } from "../input/pose-fixtures";

describe("handRollAngle: the roll of the hand in the picture, positive = clockwise on the mirrored preview", () => {
  it("an upright hand reads 0 degrees", () => {
    expect(handRollAngle(poseHand("open-palm"))).toBeCloseTo(0, 6);
  });

  it("reads the roll that was put into the hand, both ways", () => {
    for (const deg of [20, 45, 90, -30, -75]) {
      expect(handRollAngle(rollHand(poseHand("open-palm"), deg))).toBeCloseTo(deg, 6);
    }
  });

  it("moving the hand sideways does not change the roll", () => {
    expect(handRollAngle(rollHand(poseHand("open-palm", 0.2), 30))).toBeCloseTo(30, 6);
  });

  it("no hand gives null", () => {
    expect(handRollAngle(undefined)).toBeNull();
    expect(handRollAngle([])).toBeNull();
  });
});

describe("wrapDegrees: angles stay in (-180, 180]", () => {
  it("wraps across the seam so 170 to -170 is a 20 degree move, not 340", () => {
    expect(wrapDegrees(340)).toBeCloseTo(-20, 9);
    expect(wrapDegrees(-190)).toBeCloseTo(170, 9);
    expect(wrapDegrees(180)).toBe(180);
    expect(wrapDegrees(12)).toBeCloseTo(12, 9);
  });
});

describe("rollSteps: every 45 degrees of roll asks for one quarter turn in that direction", () => {
  it("the step and the hysteresis are the agreed values", () => {
    expect(ROLL_STEP_DEG).toBe(45);
    expect(ROLL_HYSTERESIS_DEG).toBeGreaterThan(0);
    expect(ROLL_HYSTERESIS_DEG).toBeLessThan(ROLL_STEP_DEG / 2);
  });

  it("a clockwise roll past the dead band asks for +1 and moves the anchor by one step", () => {
    const r = rollSteps(0, 50);
    expect(r.turn).toBe(1);
    expect(r.anchor).toBe(ROLL_STEP_DEG);
  });

  it("a counter-clockwise roll asks for -1 and moves the anchor the other way", () => {
    const r = rollSteps(0, -50);
    expect(r.turn).toBe(-1);
    expect(r.anchor).toBe(-ROLL_STEP_DEG);
  });

  it("a wobble inside the dead band never turns, in either direction", () => {
    for (const current of [0, 10, 30, 44, -10, -30, -44]) {
      expect(rollSteps(0, current).turn).toBe(0);
      expect(rollSteps(0, current).anchor).toBe(0);
    }
  });

  it("the anchor follows the step, so the next turn needs another 45 degrees of roll", () => {
    const first = rollSteps(0, 50);
    expect(rollSteps(first.anchor, 60).turn).toBe(0);
    expect(rollSteps(first.anchor, 95).turn).toBe(1);
  });

  it("a fast flick asks for one step per reading; the next reading asks for the rest", () => {
    let anchor = 0;
    const turns: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = rollSteps(anchor, 130);
      turns.push(r.turn);
      anchor = r.anchor;
    }
    expect(turns).toEqual([1, 1, 0, 0]);
  });

  it("a 20 degree move across the 180 degree seam is still a wobble", () => {
    expect(rollSteps(170, -170).turn).toBe(0);
  });

  it("a roll across the seam counts the short way, and the anchor stays in (-180, 180]", () => {
    const r = rollSteps(170, -120);
    expect(r.turn).toBe(1);
    expect(r.anchor).toBeCloseTo(-145, 9);
  });
});
