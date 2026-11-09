import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinchRing } from "@/src/components/ui/PinchRing";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulatePinch } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
const ring = () => screen.getByTestId("pinch-ring");
const progress = () => Number(ring().getAttribute("data-progress"));

describe("PinchRing (cubit ring)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("camera mode: no button, fills only while pinched, confirms once after about 1.2 s", () => {
    const onConfirm = vi.fn();
    render(<PinchRing holdMs={1200} onConfirm={onConfirm} label="Lanjut" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Lanjut" })).toBeTruthy();
    advance(500); // arms: it has seen "no pinch" once
    expect(progress()).toBe(0);
    act(() => simulatePinch(true));
    advance(600);
    expect(progress()).toBeGreaterThan(40);
    expect(progress()).toBeLessThan(60);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(700);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    advance(1500);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("losing the pinch drains the ring slowly instead of resetting it", () => {
    render(<PinchRing holdMs={1000} onConfirm={() => {}} label="Lanjut" />);
    advance(32);
    act(() => simulatePinch(true));
    advance(600);
    const peak = progress();
    act(() => simulatePinch(false));
    advance(300);
    const after = progress();
    expect(after).toBeLessThan(peak);
    expect(after).toBeGreaterThan(0);
  });

  it("the pinch must be released before the ring can fill again", () => {
    const onConfirm = vi.fn();
    render(<PinchRing holdMs={1000} onConfirm={onConfirm} label="Lanjut" />);
    advance(32);
    act(() => simulatePinch(true));
    advance(1200);
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => simulatePinch(false));
    advance(100);
    act(() => simulatePinch(true));
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("a pinch still held when the ring mounts does not fill it", () => {
    const onConfirm = vi.fn();
    act(() => simulatePinch(true));
    render(<PinchRing holdMs={1000} onConfirm={onConfirm} label="Lanjut" />);
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress()).toBe(0);
    act(() => simulatePinch(false));
    advance(100);
    act(() => simulatePinch(true));
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fallback: a hold-able button for mouse, touch, Enter and Space; the camera pinch is ignored", () => {
    act(() => forceInputMode("fallback"));
    const onConfirm = vi.fn();
    render(<PinchRing holdMs={1000} onConfirm={onConfirm} label="Lanjut" />);
    const btn = screen.getByRole("button", { name: "Lanjut" });
    act(() => simulatePinch(true));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
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

  it("disabled never confirms", () => {
    const onConfirm = vi.fn();
    render(<PinchRing holdMs={1000} onConfirm={onConfirm} label="Lanjut" disabled />);
    act(() => simulatePinch(true));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("exposes the hold time and mode the e2e harness reads, like ThumbConfirm does", () => {
    render(<PinchRing holdMs={1200} onConfirm={() => {}} label="Lanjut" testId="pinch-x" />);
    const el = screen.getByTestId("pinch-x");
    expect(el.getAttribute("data-hold-ms")).toBe("1200");
    expect(el.getAttribute("data-mode")).toBe("camera");
  });
});
