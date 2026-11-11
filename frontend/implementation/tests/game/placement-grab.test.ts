/**
 * Pure rules of the placement and exploration gestures (REVISI §18): which pose acts in which mode, and when a grab
 * is dropped. The poses are checked against the real classifier, so a fixture drift cannot hide a wrong mapping.
 */
import { describe, expect, it } from "vitest";
import { classifyHandPose, countExtendedFingers, type HandPose } from "@/src/input/hand-gesture";
import {
  GRAB_DROP_MS,
  NOT_GRABBING,
  beginGrab,
  gestureFor,
  readGrab,
  stageGestureMode,
} from "@/src/components/game/placement-gesture";
import { MODE_GAMEPLAY_EXPLORATION_CAM, MODE_GAMEPLAY_PLACEMENT } from "@/src/input/gesture-mode";
import { poseHand } from "../input/pose-fixtures";

describe("fixtures classify as their poses", () => {
  it.each([
    ["open-palm", "open-palm"],
    ["pinch", "pinch"],
    ["one-finger", "one-finger"],
    ["two-fingers", "two-fingers"],
    ["three-fingers", "three-fingers"],
    ["thumb-up", "thumb-up"],
  ] as const)("%s", (pose, expected) => {
    expect(classifyHandPose(poseHand(pose))).toBe(expected);
  });

  it("a raised thumb is counted in the finger count, so the count is not the pose", () => {
    expect(countExtendedFingers(poseHand("thumb-up"))).toBe(1);
  });
});

describe("stage mode", () => {
  it("placing uses the placement mode, the played object the exploration mode, an outcome none", () => {
    expect(stageGestureMode("placing", null)).toBe(MODE_GAMEPLAY_PLACEMENT);
    expect(stageGestureMode("gameplay", null)).toBe(MODE_GAMEPLAY_EXPLORATION_CAM);
    expect(stageGestureMode("gameplay", "fail")).toBeNull();
    expect(stageGestureMode("falling", null)).toBeNull();
  });
});

describe("gestureFor: only the poses of the mode act", () => {
  it("placement: thumbs-up places, open palm draws again, pinch grabs", () => {
    expect(gestureFor(MODE_GAMEPLAY_PLACEMENT, "thumb-up")).toBe("place");
    expect(gestureFor(MODE_GAMEPLAY_PLACEMENT, "open-palm")).toBe("redraw");
    expect(gestureFor(MODE_GAMEPLAY_PLACEMENT, "pinch")).toBe("grab");
    for (const pose of ["one-finger", "two-fingers", "three-fingers", "none"] as const) {
      expect(gestureFor(MODE_GAMEPLAY_PLACEMENT, pose)).toBeNull();
    }
  });

  it("exploration: pinch grabs, open palm rotates, thumbs-up does nothing", () => {
    expect(gestureFor(MODE_GAMEPLAY_EXPLORATION_CAM, "pinch")).toBe("grab");
    expect(gestureFor(MODE_GAMEPLAY_EXPLORATION_CAM, "open-palm")).toBe("rotate");
    expect(gestureFor(MODE_GAMEPLAY_EXPLORATION_CAM, "thumb-up")).toBeNull();
    expect(gestureFor(MODE_GAMEPLAY_EXPLORATION_CAM, "three-fingers")).toBeNull();
  });

  it("no mode means no action", () => {
    expect(gestureFor(null, "pinch")).toBeNull();
    expect(gestureFor(null, "thumb-up")).toBeNull();
  });

  it("a thumbs-up, which the finger count also reads as one finger, never chooses a candidate here", () => {
    expect(gestureFor(MODE_GAMEPLAY_PLACEMENT, "thumb-up")).not.toBe("choose-1");
    expect(gestureFor(MODE_GAMEPLAY_EXPLORATION_CAM, "thumb-up")).not.toBe("choose-1");
  });
});

describe("readGrab: a release drops the object only after GRAB_DROP_MS", () => {
  it("does nothing until a grab has begun", () => {
    expect(readGrab(NOT_GRABBING, false, 0)).toEqual({ state: NOT_GRABBING, drop: false });
  });

  it("holds while the pinch is there, and never drops", () => {
    let s = beginGrab();
    for (let t = 0; t <= 5000; t += 100) {
      const r = readGrab(s, true, t);
      expect(r.drop).toBe(false);
      s = r.state;
    }
    expect(s.holding).toBe(true);
  });

  it("a gap shorter than GRAB_DROP_MS keeps the object", () => {
    const first = readGrab(beginGrab(), false, 1000);
    expect(first.state.releasedAt).toBe(1000);
    const later = readGrab(first.state, false, 1000 + GRAB_DROP_MS - 1);
    expect(later.drop).toBe(false);
    expect(later.state.holding).toBe(true);
  });

  it("a gap of GRAB_DROP_MS or more drops it, and the grab ends", () => {
    const first = readGrab(beginGrab(), false, 1000);
    const dropped = readGrab(first.state, false, 1000 + GRAB_DROP_MS);
    expect(dropped.drop).toBe(true);
    expect(dropped.state).toEqual(NOT_GRABBING);
  });

  it("a pinch that returns clears the gap, so the next gap starts a new count", () => {
    const first = readGrab(beginGrab(), false, 1000);
    const back = readGrab(first.state, true, 1100);
    expect(back.state.releasedAt).toBeNull();
    const again = readGrab(back.state, false, 1200);
    expect(again.state.releasedAt).toBe(1200);
    expect(again.drop).toBe(false);
  });
});
