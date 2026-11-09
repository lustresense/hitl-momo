import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingActions } from "@/src/components/drawing/DrawingActions";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

const props = { phase: "drawing", active: true, inputMode: "hand" as const, hasInk: false, onSwitchMode: vi.fn(), onSubmit: vi.fn() };

describe("R13 input picker only in fallback mode", () => {
  beforeEach(() => resetInputModeForTest());
  afterEach(() => { cleanup(); resetInputModeForTest(); });

  it("hidden in camera mode, shown in fallback, hidden again when the camera returns", () => {
    act(() => forceInputMode("camera"));
    render(<DrawingActions {...props} />);
    expect(screen.queryByTestId("btn-input-hand")).toBeNull();
    expect(screen.queryByTestId("btn-input-pointer")).toBeNull();
    expect(screen.getByTestId("btn-submit-drawing")).toBeTruthy();
    act(() => forceInputMode("fallback"));
    expect(screen.getByTestId("btn-input-hand")).toBeTruthy();
    expect(screen.getByTestId("btn-input-pointer")).toBeTruthy();
    act(() => forceInputMode("camera"));
    expect(screen.queryByTestId("btn-input-pointer")).toBeNull();
  });
});
