/**
 * Hand side of placing and exploring the object: the stage's own reader's pose, and the grab (a pinch held
 * for its ring, then followed until it is let go). The rules are in ../placement-gesture.ts.
 */
import { useEffect, useRef, useState } from "react";
import { subscribeHandCursor } from "@/src/camera/hand-cursor-store";
import type { HandPose } from "@/src/input/hand-gesture";
import { NOT_GRABBING, beginGrab, readGrab, GRAB_DROP_MS, type GrabState } from "../placement-gesture";

/**
 * The pose of the stage's own hand reader (source "gameplay"), or "none" while the stage is not asking for hand
 * actions or no hand is in view. The store notifies only on a change, so this re-renders on a change only.
 */
export function useStagePose(enabled: boolean): HandPose {
  const [pose, setPose] = useState<HandPose>("none");
  useEffect(() => {
    if (!enabled) {
      setPose("none");
      return;
    }
    return subscribeHandCursor((sample) => {
      setPose(sample && sample.source === "gameplay" && sample.pose ? sample.pose : "none");
    });
  }, [enabled]);
  return pose;
}

export interface PlacementGrabOptions {
  /** The current pose of the stage's hand reader. */
  pose: HandPose;
  /** Told at once (synchronously) when the grab starts or ends, so the next hand frame already moves or keeps the object. */
  onHoldChange: (holding: boolean) => void;
  /** The grab ended after a release. `commit` is true when it began in exploration: a release places the object. */
  onDrop: (commit: boolean) => void;
}

/**
 * The grab: `begin(commit)` starts it (the caller's ring has filled). While it holds, the pinch pose keeps it; a
 * release lasting GRAB_DROP_MS drops it (a shorter gap does not). `cancel()` ends it without a drop (leaving the
 * placement or the play phase by another route).
 */
export function usePlacementGrab({ pose, onHoldChange, onDrop }: PlacementGrabOptions) {
  const [holding, setHolding] = useState(false);
  const stateRef = useRef<GrabState>(NOT_GRABBING);
  const commitRef = useRef(false);
  const poseRef = useRef<HandPose>(pose);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest callbacks, so a timer that fires later never calls a stale closure.
  const handlersRef = useRef({ onHoldChange, onDrop });
  handlersRef.current = { onHoldChange, onDrop };

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function apply(next: GrabState) {
    const was = stateRef.current.holding;
    stateRef.current = next;
    if (was !== next.holding) {
      setHolding(next.holding);
      handlersRef.current.onHoldChange(next.holding);
    }
  }

  function step() {
    clearTimer();
    const commit = commitRef.current;
    const reading = readGrab(stateRef.current, poseRef.current === "pinch", Date.now());
    apply(reading.state);
    if (reading.drop) {
      handlersRef.current.onDrop(commit);
      return;
    }
    if (reading.state.holding && reading.state.releasedAt !== null) {
      timerRef.current = setTimeout(step, GRAB_DROP_MS);
    }
  }

  // A pose change is a reading: a pinch returning clears the gap, a lost pinch starts it.
  useEffect(() => {
    poseRef.current = pose;
    if (stateRef.current.holding) step();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  useEffect(
    () => () => {
      clearTimer();
      if (stateRef.current.holding) handlersRef.current.onHoldChange(false);
      stateRef.current = NOT_GRABBING;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function begin(commit: boolean) {
    clearTimer();
    commitRef.current = commit;
    apply(beginGrab());
  }

  function cancel() {
    clearTimer();
    apply(NOT_GRABBING);
  }

  return { holding, begin, cancel };
}
