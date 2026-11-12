import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbConfirm } from "@/src/components/ui/ThumbConfirm";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { acquireThumbTracker, resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
// Spy on the shared tracker (real behaviour kept) to prove which rings start it.
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
const progress = () => Number(screen.getByTestId("thumb-confirm").getAttribute("data-progress"));

describe("ThumbConfirm (PRD 0.0.16 R4)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
    vi.mocked(acquireThumbTracker).mockClear();
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

  it("camera mode: a silent mouse or Enter hold fills the ring and confirms once, still with no button", () => {
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} />);
    expect(screen.queryByRole("button")).toBeNull();
    const ring = screen.getByRole("progressbar");
    advance(32); // arms after seeing no thumb and no press
    fireEvent.pointerDown(ring);
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(ring);
    advance(100);
    fireEvent.keyDown(ring, { key: "Enter" });
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(2);
    fireEvent.keyUp(ring, { key: "Enter" });
    advance(100);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("camera mode: a press released early does not confirm, and a press still held does not count while disabled", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} />);
    advance(32);
    fireEvent.pointerDown(screen.getByRole("progressbar"));
    advance(500);
    fireEvent.pointerUp(screen.getByRole("progressbar"));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} disabled />);
    fireEvent.pointerDown(screen.getByRole("progressbar"));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
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

  it("externalThumbUp: the caller's thumb fills the camera ring and the ring never starts the shared tracker", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<ThumbConfirm holdMs={2000} onConfirm={onConfirm} externalThumbUp={false} />);
    advance(50); // arms after seeing no thumb
    rerender(<ThumbConfirm holdMs={2000} onConfirm={onConfirm} externalThumbUp />);
    advance(1000);
    expect(progress()).toBeGreaterThan(40);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(1100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });

  it("externalThumbUp=false ignores a thumb the shared tracker reports, so the ring stays with its owner", () => {
    const onConfirm = vi.fn();
    render(<ThumbConfirm holdMs={1000} onConfirm={onConfirm} externalThumbUp={false} />);
    advance(50);
    act(() => simulateThumb(true));
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress()).toBe(0);
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });
});
