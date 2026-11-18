import { describe, expect, it } from "vitest";
import { evaluateGameplayGesture } from "@/src/input/gameplay-gesture";
import type { Landmark } from "@/src/input/types";
import { pointingHand } from "./gameplay-fixtures";

describe("gameplay-gesture (pure gesture adapter)", () => {
  describe("tracking loss handling", () => {
    it("returns untracked neutral state when landmarks are undefined", () => {
      const frame = evaluateGameplayGesture(undefined);
      expect(frame).toEqual({
        tracked: false,
        cursor: null,
        pinched: false,
        angle: null,
        input: { left: false, right: false, jump: false },
      });
    });

    it("returns untracked neutral state when landmarks array is incomplete", () => {
      const frame = evaluateGameplayGesture([{ x: 0, y: 0 }]);
      expect(frame.tracked).toBe(false);
      expect(frame.cursor).toBeNull();
      expect(frame.angle).toBeNull();
      expect(frame.input).toEqual({ left: false, right: false, jump: false });
    });
  });

  describe("mirroring and cursor", () => {
    it("mirrors the index tip x coordinate exactly once: (1 - tip.x)", () => {
      // The tip is 0.3 from the centre on the camera's left, so the student sees it on the right.
      const frame = evaluateGameplayGesture(pointingHand(0));
      expect(frame.tracked).toBe(true);
      expect(frame.cursor!.x).toBeCloseTo(0.7);
      expect(frame.cursor!.y).toBeCloseTo(0.6);
    });

    it("clamps cursor coordinates to [0, 1]", () => {
      const lm = pointingHand(90);
      lm[8] = { x: -0.2, y: 1.5 };
      const frame = evaluateGameplayGesture(lm);
      expect(frame.tracked).toBe(true);
      expect(frame.cursor!.x).toBeLessThanOrEqual(1);
      expect(frame.cursor!.x).toBeGreaterThanOrEqual(0);
      expect(frame.cursor!.y).toBeLessThanOrEqual(1);
      expect(frame.cursor!.y).toBeGreaterThanOrEqual(0);
    });
  });

  describe("steering by the index finger angle (stateless, no hysteresis)", () => {
    it("a finger pointing to the student's right walks right", () => {
      const frame = evaluateGameplayGesture(pointingHand(10));
      expect(frame.angle).toBeCloseTo(10, 6);
      expect(frame.input).toEqual({ left: false, right: true, jump: false });
    });

    it("a finger pointing to the student's left walks left", () => {
      const frame = evaluateGameplayGesture(pointingHand(170));
      expect(frame.input).toEqual({ left: true, right: false, jump: false });
    });

    it("a finger pointing straight up jumps on the spot", () => {
      const frame = evaluateGameplayGesture(pointingHand(90));
      expect(frame.input).toEqual({ left: false, right: false, jump: true });
    });

    it("a finger pointing down stops", () => {
      const frame = evaluateGameplayGesture(pointingHand(-90));
      expect(frame.tracked).toBe(true);
      expect(frame.input).toEqual({ left: false, right: false, jump: false });
    });
  });

  describe("pinch detection for placement grab", () => {
    it("detects pinch when thumb and index tips are close relative to wrist-mcp span", () => {
      const frame = evaluateGameplayGesture(pointingHand(90, { pinchGap: 0.2 }));
      expect(frame.tracked).toBe(true);
      expect(frame.pinched).toBe(true);
    });

    it("detects non-pinch when fingers are apart", () => {
      const frame = evaluateGameplayGesture(pointingHand(90, { pinchGap: 1 }));
      expect(frame.tracked).toBe(true);
      expect(frame.pinched).toBe(false);
    });

    it("a pinch alone never jumps (the jump is the finger angle)", () => {
      const frame = evaluateGameplayGesture(pointingHand(-60, { pinchGap: 0.2 }));
      expect(frame.pinched).toBe(true);
      expect(frame.input.jump).toBe(false);
    });
  });

  it("an undefined index tip is untracked, not a steering frame", () => {
    const lm: Landmark[] = pointingHand(90);
    lm[8] = { x: Number.NaN, y: 0.4 };
    expect(evaluateGameplayGesture(lm).tracked).toBe(false);
  });
});
