import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbConfirm } from "@/src/components/ui/ThumbConfirm";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
const progress = () => Number(screen.getByTestId("thumb-confirm").getAttribute("data-progress"));

describe("ThumbConfirm (PRD 0.0.16 R4)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("camera mode: no button, fills only from a thumbs-up, 2 s hold", () => {
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={2000} onConfirm={onConfirm} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    advance(500);
    expect(progress()).toBe(0);
    act(() => simulateThumb(true));
    advance(1000);
    expect(progress()).toBeGreaterThan(40);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(1100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("losing the thumb drains slowly instead of resetting", () => {
    render(<ThumbConfirm holdMs={1000} onConfirm={() => {}} />);
    advance(32); // arms after seeing no thumb
    act(() => simulateThumb(true));
    advance(600);
    const peak = progress();
    act(() => simulateThumb(false));
    advance(300);
    const after = progress();
    expect(after).toBeLessThan(peak);
    expect(after).toBeGreaterThan(0);
  });

  it("must release before confirming again", () => {
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} />);
    advance(32); // arms after seeing no thumb
    act(() => simulateThumb(true));
    advance(1200);
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => simulateThumb(false));
    advance(100);
    act(() => simulateThumb(true));
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("fallback mode: hold-able button with pointer and Enter", () => {
    act(() => forceInputMode("fallback"));
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} label="Tahan jempol" />);
    const btn = screen.getByRole("button", { name: "Tahan jempol" });
    fireEvent.pointerDown(btn);
    advance(500);
    fireEvent.pointerUp(btn);
    advance(100);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.pointerDown(btn);
    advance(1100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(btn);
    advance(1500);
    fireEvent.keyDown(btn, { key: "Enter" });
    advance(1100);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("thumbs-up does nothing in fallback mode and buttons hide again when the camera is back", () => {
    act(() => forceInputMode("fallback"));
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} />);
    act(() => simulateThumb(true));
    advance(1200);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => forceInputMode(null));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disabled never confirms", () => {
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} disabled />);
    act(() => simulateThumb(true));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a thumb still held from the previous screen does not fill a newly mounted ring", () => {
    act(() => simulateThumb(true));
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} />);
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress()).toBe(0);
    act(() => simulateThumb(false));
    advance(100);
    act(() => simulateThumb(true));
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
