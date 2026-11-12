import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingActions } from "@/src/components/drawing/DrawingActions";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

// The hand reader is not needed here (the finish ring is not shown without ink); keep MediaPipe out of the test.
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const props = { phase: "drawing", active: true, inputMode: "hand" as const, hasInk: false, onSwitchMode: vi.fn(), onSubmit: vi.fn() };

/** Camera mode hides the fallback controls at first. This is how long a missing hand takes to reveal them. */
const HAND_LOST_REVEAL_MS = 15000;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("R13 fallback controls: hidden at first in camera mode, shown in fallback", () => {
  beforeEach(() => resetInputModeForTest());
  afterEach(() => {
    cleanup();
    resetInputModeForTest();
  });

  it("camera mode: the Mouse/Kamera switch and Tebak are hidden behind a small Bantuan button", () => {
    forceInputMode("camera");
    render(<DrawingActions {...props} />);
    expect(screen.queryByTestId("btn-input-hand")).toBeNull();
    expect(screen.queryByTestId("btn-input-pointer")).toBeNull();
    expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
    expect(screen.getByTestId("btn-drawing-help").textContent).toContain("Bantuan");
  });

  it("Bantuan opens the switch and Tebak in camera mode, and a second press closes them", () => {
    forceInputMode("camera");
    render(<DrawingActions {...props} />);
    const help = screen.getByTestId("btn-drawing-help");
    expect(help.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(help);
    expect(help.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("btn-input-hand")).toBeTruthy();
    expect(screen.getByTestId("btn-input-pointer")).toBeTruthy();
    expect(screen.getByTestId("btn-submit-drawing")).toBeTruthy();
    fireEvent.click(help);
    expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
    expect(screen.queryByTestId("btn-input-hand")).toBeNull();
  });

  it("fallback mode: the switch and Tebak show at once, and there is no Bantuan button", () => {
    forceInputMode("fallback");
    render(<DrawingActions {...props} />);
    expect(screen.getByTestId("btn-input-hand")).toBeTruthy();
    expect(screen.getByTestId("btn-input-pointer")).toBeTruthy();
    expect(screen.getByTestId("btn-submit-drawing")).toBeTruthy();
    expect(screen.queryByTestId("btn-drawing-help")).toBeNull();
  });

  it("when the camera fails in the middle of drawing, the controls appear; when it returns they hide again", () => {
    forceInputMode("camera");
    render(<DrawingActions {...props} />);
    expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
    act(() => forceInputMode("fallback"));
    expect(screen.getByTestId("btn-submit-drawing")).toBeTruthy();
    act(() => forceInputMode("camera"));
    expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
  });

  it("camera mode: no hand for 15 s reveals the controls; a hand seen again before that restarts the count", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      forceInputMode("camera");
      render(<DrawingActions {...props} handMissing />);
      advance(HAND_LOST_REVEAL_MS - 100);
      expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
      advance(200);
      expect(screen.getByTestId("btn-submit-drawing")).toBeTruthy();
      expect(screen.getByTestId("btn-input-hand")).toBeTruthy();

      cleanup();
      const second = render(<DrawingActions {...props} handMissing />);
      advance(HAND_LOST_REVEAL_MS - 1000);
      second.rerender(<DrawingActions {...props} handMissing={false} />);
      advance(HAND_LOST_REVEAL_MS);
      expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
      second.rerender(<DrawingActions {...props} handMissing />);
      advance(HAND_LOST_REVEAL_MS - 100);
      expect(screen.queryByTestId("btn-submit-drawing")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
