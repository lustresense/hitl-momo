/**
 * The object turn in the exploration rings, without a stage: the palm ring starts the turn, then the palm's twist
 * asks for quarter turns in its direction. The hand store is the real one; the rAF clock of the ring is stepped by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ExplorationRings } from "@/src/components/game/ExplorationRings";
import { useStagePose } from "@/src/components/game/hooks/usePlacementGesture";
import { ROTATE_HOLD_MS, gestureFor, stageGestureMode } from "@/src/components/game/placement-gesture";
import { publishHand, resetHandCursorForTest } from "@/src/camera/hand-cursor-store";
import { publishHandRoll, resetHandRollForTest } from "@/src/input/hand-roll-store";

let ringClock = 0;
let rafQueue: FrameRequestCallback[] = [];

function stepFrames(n: number) {
  for (let i = 0; i < n; i++) {
    ringClock += 16;
    act(() => {
      rafQueue.splice(0).forEach((cb) => cb(ringClock));
    });
  }
}

function setPose(pose: "open-palm" | "thumb-up" | "none") {
  act(() => {
    publishHand({ cursor: null, pose, source: "gameplay" });
  });
}

function setRoll(roll: number | null) {
  act(() => {
    publishHandRoll(roll);
  });
}

const FILL_ROTATE_FRAMES = Math.ceil(ROTATE_HOLD_MS / 16) + 10;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  resetHandCursorForTest();
  resetHandRollForTest();
  ringClock = 0;
  rafQueue = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetHandCursorForTest();
  resetHandRollForTest();
});

/** Same wiring as GameStage: the pose of the stage's reader, then the router's action for exploration. */
function Harness({ onRotate }: { onRotate: (direction: 1 | -1) => void }) {
  const pose = useStagePose(true);
  const gesture = gestureFor(stageGestureMode("gameplay", null), pose);
  return <ExplorationRings gesture={gesture} onMove={() => {}} onRotate={onRotate} />;
}

/** Mounts the rings with no hand, and runs one idle frame: a ring arms only after it has seen the hand released. */
function renderRings(onRotate = vi.fn()) {
  render(<Harness onRotate={onRotate} />);
  stepFrames(2);
  return { onRotate };
}

describe("exploration rings: the palm turns the object by its twist", () => {
  it("the palm ring starts the turn; a still palm does not turn the object", () => {
    setRoll(0);
    const { onRotate } = renderRings();
    setPose("open-palm");
    expect(screen.queryByTestId("object-turn")).toBeNull();
    stepFrames(FILL_ROTATE_FRAMES);
    expect(screen.getByTestId("object-turn")).toBeTruthy();
    stepFrames(60);
    expect(onRotate).not.toHaveBeenCalled();
  });

  it("a clockwise twist of 50 degrees asks for +1, and a counter-clockwise twist asks for -1", () => {
    setRoll(0);
    const { onRotate } = renderRings();
    setPose("open-palm");
    stepFrames(FILL_ROTATE_FRAMES);
    setRoll(50);
    expect(onRotate).toHaveBeenCalledTimes(1);
    expect(onRotate).toHaveBeenLastCalledWith(1);
    // The anchor moved one step to 45 degrees; -10 is 55 degrees back from it.
    setRoll(-10);
    expect(onRotate).toHaveBeenCalledTimes(2);
    expect(onRotate).toHaveBeenLastCalledWith(-1);
  });

  it("the thumbs-up ends the turn, and the twist after it turns nothing", () => {
    setRoll(0);
    const { onRotate } = renderRings();
    setPose("open-palm");
    stepFrames(FILL_ROTATE_FRAMES);
    setPose("thumb-up");
    expect(screen.queryByTestId("object-turn")).toBeNull();
    setRoll(60);
    expect(onRotate).not.toHaveBeenCalled();
  });

  it("a palm gone for 400 ms ends the turn, a short gap does not", () => {
    setRoll(0);
    renderRings();
    setPose("open-palm");
    stepFrames(FILL_ROTATE_FRAMES);
    setPose("none");
    setRoll(null);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("object-turn")).toBeTruthy();
    setPose("open-palm");
    setRoll(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("object-turn")).toBeTruthy();
    setPose("none");
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.queryByTestId("object-turn")).toBeNull();
  });

  it("the ring is not offered again while the turn is on (its hold does not restart it)", () => {
    setRoll(0);
    renderRings();
    setPose("open-palm");
    stepFrames(FILL_ROTATE_FRAMES);
    expect(screen.getByTestId("object-turn")).toBeTruthy();
    const ring = screen.getByTestId("ring-rotate");
    expect(ring.getAttribute("data-state")).toBe("disabled");
  });
});
