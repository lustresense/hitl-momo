/**
 * The placement and exploration rings, with fake timers: a ring fires once after its hold, only for its own
 * gesture, and the fallback keeps its plain button. The hold of each ring is the one in placement-gesture.ts.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacementControls } from "@/src/components/game/PlacementControls";
import { ExplorationRings } from "@/src/components/game/ExplorationRings";
import { GRAB_HOLD_MS, PLACE_HOLD_MS, REDRAW_HOLD_MS, ROTATE_HOLD_MS } from "@/src/components/game/placement-gesture";
import { resetInputModeForTest, forceInputMode } from "@/src/input/input-mode";
import type { GestureAction } from "@/src/input/gesture-mode";

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}

/** A ring arms on an empty hand first, then the gesture is held for `ms` and released. */
function hold(gesture: GestureAction | null, ms: number, setGesture: (g: GestureAction | null) => void) {
  advance(64);
  act(() => setGesture(gesture));
  advance(ms);
  act(() => setGesture(null));
  advance(64);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  forceInputMode("camera");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetInputModeForTest();
});

function placementProps(overrides: Partial<Parameters<typeof PlacementControls>[0]> = {}) {
  return {
    mode: "camera" as const,
    gesture: null as GestureAction | null,
    holding: false,
    confirmDisabled: false,
    placementError: "",
    onConfirm: vi.fn(),
    onGrab: vi.fn(),
    onRedraw: vi.fn(),
    ...overrides,
  };
}

describe("PlacementControls in camera mode: three finger rings", () => {
  it("shows the grab, place and redraw rings and no plain button", () => {
    render(<PlacementControls {...placementProps()} />);
    expect(screen.getByTestId("ring-grab")).toBeTruthy();
    expect(screen.getByTestId("ring-place")).toBeTruthy();
    expect(screen.getByTestId("ring-redraw")).toBeTruthy();
    expect(screen.queryByTestId("btn-confirm-placement")).toBeNull();
  });

  it("thumbs-up (place) fires once after 2 s, and a pinch or palm does not place", () => {
    let gesture: GestureAction | null = null;
    const props = placementProps();
    const { rerender } = render(<PlacementControls {...props} gesture={gesture} />);
    const set = (g: GestureAction | null) => {
      gesture = g;
      rerender(<PlacementControls {...props} gesture={gesture} />);
    };
    hold("grab", PLACE_HOLD_MS + 500, set);
    hold("redraw", PLACE_HOLD_MS + 500, set);
    expect(props.onConfirm).not.toHaveBeenCalled();

    advance(64);
    act(() => set("place"));
    advance(PLACE_HOLD_MS - 200);
    expect(props.onConfirm).not.toHaveBeenCalled();
    advance(400);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a disabled place ring (no legal spot) never fires", () => {
    const props = placementProps({ confirmDisabled: true, gesture: "place" });
    render(<PlacementControls {...props} />);
    advance(PLACE_HOLD_MS + 500);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("the grab ring fires onGrab after its hold, and the palm redraw fires onRedraw after its hold", () => {
    let gesture: GestureAction | null = null;
    const props = placementProps();
    const { rerender } = render(<PlacementControls {...props} gesture={gesture} />);
    const set = (g: GestureAction | null) => {
      gesture = g;
      rerender(<PlacementControls {...props} gesture={gesture} />);
    };
    hold("grab", GRAB_HOLD_MS + 200, set);
    expect(props.onGrab).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();

    hold("redraw", REDRAW_HOLD_MS + 200, set);
    expect(props.onRedraw).toHaveBeenCalledTimes(1);
    expect(props.onGrab).toHaveBeenCalledTimes(1);
  });

  it("while the object is held the grab ring is replaced by a hint", () => {
    render(<PlacementControls {...placementProps({ holding: true })} />);
    expect(screen.queryByTestId("ring-grab")).toBeNull();
    expect(screen.getByTestId("placement-holding").textContent).toContain("Objek mengikuti tanganmu");
    expect(screen.getByTestId("ring-place")).toBeTruthy();
  });

  it("shows the placement error next to the rings", () => {
    render(<PlacementControls {...placementProps({ placementError: "Posisi di luar dunia." })} />);
    expect(screen.getByText("Posisi di luar dunia.")).toBeTruthy();
  });
});

describe("PlacementControls in fallback mode: the plain button stays", () => {
  it("the button confirms on a plain click, and no ring is shown", () => {
    const props = placementProps({ mode: "fallback" });
    render(<PlacementControls {...props} />);
    expect(screen.queryByTestId("ring-place")).toBeNull();
    fireEvent.click(screen.getByTestId("btn-confirm-placement"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("ExplorationRings: pinch picks the object up, open palm turns it", () => {
  it("pinch fires onMove after 1.5 s; the palm starts the turn after its hold, and the hold itself turns nothing", () => {
    let gesture: GestureAction | null = null;
    const onMove = vi.fn();
    const onRotate = vi.fn();
    const { rerender } = render(<ExplorationRings gesture={gesture} onMove={onMove} onRotate={onRotate} />);
    const set = (g: GestureAction | null) => {
      gesture = g;
      rerender(<ExplorationRings gesture={gesture} onMove={onMove} onRotate={onRotate} />);
    };
    hold("grab", GRAB_HOLD_MS + 200, set);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onRotate).not.toHaveBeenCalled();

    hold("rotate", ROTATE_HOLD_MS + 200, set);
    expect(screen.getByTestId("object-turn")).toBeTruthy();
    expect(onRotate).not.toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("a short pinch (under the hold) does not pick the object up", () => {
    const onMove = vi.fn();
    const { rerender } = render(<ExplorationRings gesture={null} onMove={onMove} onRotate={vi.fn()} />);
    advance(64);
    rerender(<ExplorationRings gesture="grab" onMove={onMove} onRotate={vi.fn()} />);
    advance(GRAB_HOLD_MS - 300);
    rerender(<ExplorationRings gesture={null} onMove={onMove} onRotate={vi.fn()} />);
    advance(500);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("the latch: a pinch held through the confirm does not confirm again until released", () => {
    const onMove = vi.fn();
    const { rerender } = render(<ExplorationRings gesture={null} onMove={onMove} onRotate={vi.fn()} />);
    advance(64);
    rerender(<ExplorationRings gesture="grab" onMove={onMove} onRotate={vi.fn()} />);
    advance(GRAB_HOLD_MS + 1500);
    expect(onMove).toHaveBeenCalledTimes(1);
  });
});
