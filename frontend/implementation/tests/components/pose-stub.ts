/**
 * Test double for useHandGesture() that carries a finger pose, through vi.mock("@/src/hooks/useHandGesture").
 * setPose() plays the part of the tracker: every mounted consumer re-renders with the new pose, as the real hook does.
 * It keeps the old fields (thumbUp, pinch, cursor) in step with the pose, so ThumbConfirm and PinchRing read it too.
 */
import { useEffect, useState } from "react";
import type { HandPose } from "@/src/input/hand-gesture";

export interface PoseReading {
  ready: boolean;
  handVisible: boolean;
  thumbUp: boolean;
  pinch: boolean;
  cursor: { x: number; y: number } | null;
  pose: HandPose;
  fingerCount: number;
}

const FINGERS: Partial<Record<HandPose, number>> = {
  "one-finger": 1,
  "two-fingers": 2,
  "three-fingers": 3,
  "open-palm": 5,
  "split-palm": 2,
};

function reading(pose: HandPose): PoseReading {
  return {
    ready: true,
    handVisible: pose !== "none",
    thumbUp: pose === "thumb-up",
    pinch: pose === "pinch",
    cursor: null,
    pose,
    fingerCount: FINGERS[pose] ?? 0,
  };
}

const IDLE = reading("none");
let current: PoseReading = IDLE;
const listeners = new Set<(state: PoseReading) => void>();

/** Sets the pose the tracker reports now, and tells every mounted consumer. */
export function setPose(pose: HandPose): void {
  current = reading(pose);
  for (const listener of [...listeners]) listener(current);
}

export function resetPose(): void {
  current = IDLE;
  listeners.clear();
}

/** Same signature as the real useHandGesture(active): it subscribes only while active, like the real one. */
export function usePoseStub(active = true): PoseReading {
  const [state, setState] = useState<PoseReading>(current);
  useEffect(() => {
    if (!active) return;
    setState(current);
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, [active]);
  return state;
}
