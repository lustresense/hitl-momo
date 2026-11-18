/**
 * The stage's hand hooks, with fake timers: the grab follows the pinch of the stage's own reader, drops only after a
 * release of GRAB_DROP_MS, and the pose is read from the shared store only from the stage's own reader.
 */
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, retireHand } from "@/src/camera/hand-cursor-store";
import type { HandPose } from "@/src/input/hand-gesture";
import { GRAB_DROP_MS } from "@/src/components/game/placement-gesture";
import { usePlacementGrab, useStagePose } from "@/src/components/game/hooks/usePlacementGesture";

function advance(ms: number) {
  for (let t = 0; t < ms; t += 10) act(() => { vi.advanceTimersByTime(10); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  resetHandCursorForTest();
});

afterEach(() => {
  cleanup();
  retireHand("gameplay");
  resetHandCursorForTest();
  vi.useRealTimers();
});

describe("usePlacementGrab", () => {
  function setup(initial: HandPose) {
    const onHoldChange = vi.fn();
    const onDrop = vi.fn();
    const hook = renderHook(
      ({ pose }: { pose: HandPose }) => usePlacementGrab({ pose, onHoldChange, onDrop }),
      { initialProps: { pose: initial } },
    );
    return { ...hook, onHoldChange, onDrop };
  }

  it("begin tells the placement at once, and a held pinch never drops", () => {
    const { result, rerender, onHoldChange, onDrop } = setup("pinch");
    act(() => result.current.begin(false));
    expect(onHoldChange).toHaveBeenLastCalledWith(true);
    expect(result.current.holding).toBe(true);
    advance(3000);
    rerender({ pose: "pinch" });
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.holding).toBe(true);
  });

  it("a release shorter than GRAB_DROP_MS keeps the object; a longer one drops it", () => {
    const { result, rerender, onHoldChange, onDrop } = setup("pinch");
    act(() => result.current.begin(false));

    rerender({ pose: "none" });
    advance(GRAB_DROP_MS - 60);
    rerender({ pose: "pinch" });
    advance(400);
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.holding).toBe(true);

    rerender({ pose: "none" });
    advance(GRAB_DROP_MS + 50);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(false);
    expect(result.current.holding).toBe(false);
    expect(onHoldChange).toHaveBeenLastCalledWith(false);
  });

  it("a release drops even when no further hand frame arrives (the timer decides)", () => {
    const { result, rerender, onDrop } = setup("pinch");
    act(() => result.current.begin(true));
    rerender({ pose: "none" });
    advance(GRAB_DROP_MS + 20);
    expect(onDrop).toHaveBeenCalledWith(true);
  });

  it("a grab begun in exploration reports commit, so the release places the object", () => {
    const { result, rerender, onDrop } = setup("none");
    act(() => result.current.begin(true));
    rerender({ pose: "pinch" });
    rerender({ pose: "none" });
    advance(GRAB_DROP_MS + 20);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(true);
  });

  it("cancel ends the grab without a drop", () => {
    const { result, onDrop, onHoldChange } = setup("pinch");
    act(() => result.current.begin(false));
    act(() => result.current.cancel());
    advance(GRAB_DROP_MS * 3);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onHoldChange).toHaveBeenLastCalledWith(false);
    expect(result.current.holding).toBe(false);
  });

  it("a release while not holding does nothing", () => {
    const { rerender, onDrop, onHoldChange } = setup("pinch");
    rerender({ pose: "none" });
    advance(GRAB_DROP_MS * 3);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onHoldChange).not.toHaveBeenCalled();
  });
});

describe("useStagePose", () => {
  it("reads the pose of the stage's own reader while enabled", () => {
    const { result } = renderHook(() => useStagePose(true));
    expect(result.current).toBe("none");
    act(() => publishHand({ cursor: { x: 0.5, y: 0.5 }, pose: "open-palm", source: "gameplay" }));
    expect(result.current).toBe("open-palm");
    act(() => publishHand({ cursor: { x: 0.5, y: 0.5 }, pose: "pinch", source: "gameplay" }));
    expect(result.current).toBe("pinch");
  });

  it("ignores the shared tracker's pose: only the stage's own reader counts", () => {
    const { result } = renderHook(() => useStagePose(true));
    act(() => publishHand({ cursor: { x: 0.5, y: 0.5 }, pose: "thumb-up", source: "tracker" }));
    expect(result.current).toBe("none");
  });

  it("is none while disabled, even when a reader publishes", () => {
    const { result } = renderHook(() => useStagePose(false));
    act(() => publishHand({ cursor: { x: 0.5, y: 0.5 }, pose: "pinch", source: "gameplay" }));
    expect(result.current).toBe("none");
  });
});
