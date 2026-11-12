// @vitest-environment jsdom
/**
 * R12-03: the cover -> ruler hand-off. A new screen appears only at the book's midpoint (never before), and its
 * fade-in starts after the cover's Momo has faded out, so the student never sees two Momos at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScreenHandoff, SCREEN_FADE_MS } from "@/src/app/hooks/useScreenHandoff";
import { COVER_MOMO_FADE_MS } from "@/src/components/camera/cover-handoff";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useScreenHandoff (R12-03)", () => {
  it("a queued screen change waits for the midpoint and runs exactly once", () => {
    const { result } = renderHook(() => useScreenHandoff());
    const change = vi.fn();
    act(() => result.current.later(change));
    expect(change).not.toHaveBeenCalled();
    act(() => result.current.midpoint());
    expect(change).toHaveBeenCalledTimes(1);
    act(() => result.current.midpoint());
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("a midpoint without a queued change does nothing", () => {
    const { result } = renderHook(() => useScreenHandoff());
    expect(() => act(() => result.current.midpoint())).not.toThrow();
    expect(result.current.entering).toBe(false);
  });

  it("swap changes the screen now and marks the incoming screen as entering until its fade ends", () => {
    const { result } = renderHook(() => useScreenHandoff());
    const change = vi.fn();
    act(() => result.current.swap(change));
    expect(change).toHaveBeenCalledTimes(1);
    expect(result.current.entering).toBe(true);
    act(() => vi.advanceTimersByTime(COVER_MOMO_FADE_MS + SCREEN_FADE_MS - 1));
    expect(result.current.entering).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.entering).toBe(false);
  });

  it("the incoming fade waits for the cover's Momo fade: it starts after the outgoing fade, on the same constant", () => {
    const { result } = renderHook(() => useScreenHandoff());
    expect(result.current.delayMs).toBe(COVER_MOMO_FADE_MS);
    expect(COVER_MOMO_FADE_MS).toBeGreaterThan(0);
    expect(SCREEN_FADE_MS).toBeGreaterThan(0);
  });

  it("a page turn starts the outgoing Momo fade at once, but the screen change waits for the midpoint", () => {
    const { result } = renderHook(() => useScreenHandoff());
    const change = vi.fn();
    act(() => result.current.turn(change));
    expect(result.current.leaving).toBe(true);
    expect(result.current.entering).toBe(false);
    expect(change).not.toHaveBeenCalled();
    act(() => result.current.midpoint());
    expect(change).toHaveBeenCalledTimes(1);
    expect(result.current.leaving).toBe(false);
  });

  it("after a page turn the incoming screen fades in from the midpoint with no delay, then settles", () => {
    const { result } = renderHook(() => useScreenHandoff());
    act(() => result.current.turn(() => undefined));
    act(() => result.current.midpoint());
    expect(result.current.entering).toBe(true);
    expect(result.current.delayMs).toBe(0);
    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS - 1));
    expect(result.current.entering).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.entering).toBe(false);
  });

  it("a page turn with no change queued at the midpoint does not start an incoming fade", () => {
    const { result } = renderHook(() => useScreenHandoff());
    act(() => result.current.turn(() => undefined));
    act(() => result.current.midpoint());
    act(() => result.current.midpoint());
    expect(result.current.entering).toBe(false);
    expect(result.current.leaving).toBe(false);
  });

  it("a cover swap keeps the cover delay, even after an earlier page turn", () => {
    const { result } = renderHook(() => useScreenHandoff());
    act(() => result.current.turn(() => undefined));
    act(() => result.current.midpoint());
    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));
    act(() => result.current.swap(() => undefined));
    expect(result.current.delayMs).toBe(COVER_MOMO_FADE_MS);
  });
});
