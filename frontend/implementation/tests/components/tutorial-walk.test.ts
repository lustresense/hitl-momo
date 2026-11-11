import { describe, expect, it } from "vitest";
import { advanceWalkPhase, clampWalk, handWalkTarget, HAND_GAIN, WALK_END, WALK_START } from "@/src/components/onboarding/tutorial-walk";

describe("card 1 walk math (R4)", () => {
  it("the walk cycle follows the distance walked", () => {
    expect(advanceWalkPhase(0, 4.5)).toBeCloseTo(0.5);
    expect(advanceWalkPhase(0, -2.25)).toBeCloseTo(0.25);
    expect(advanceWalkPhase(0.9, 1.8)).toBeCloseTo(0.1);
  });

  it("Thinman stays between the start and the flag", () => {
    expect(clampWalk(-5)).toBe(WALK_START);
    expect(clampWalk(200)).toBe(WALK_END);
    expect(WALK_END).toBe(76);
  });

  it("a pinch drags him by the hand's travel, proportionally and clamped at the flag", () => {
    expect(handWalkTarget(20, 0.3, 0.3)).toBe(20); // no travel, no move
    expect(handWalkTarget(20, 0.3, 0.4)).toBeCloseTo(20 + 0.1 * HAND_GAIN);
    expect(handWalkTarget(20, 0.3, 0.9)).toBe(WALK_END); // far right stops at the flag
    expect(handWalkTarget(20, 0.6, 0.1)).toBe(WALK_START); // far left stops at the start
  });
});
