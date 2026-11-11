// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import gsap from "gsap";
import { BOOK_FLIP_DURATION, BookFlip } from "@/src/components/ui/BookFlip";

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function fakeTimeline() {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  vi.spyOn(gsap, "timeline").mockReturnValue(tl as never);
  return tl;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BookFlip reduced motion (R3)", () => {
  it("reduced motion keeps the same upward turn and duration; only the sideways skew is dropped", () => {
    setReducedMotion(true);
    const tl = fakeTimeline();
    render(<BookFlip playKey={1} direction="open" />);
    expect(tl.fromTo).toHaveBeenCalledTimes(1);
    const [, , to] = tl.fromTo.mock.calls[0]!;
    expect(to).toMatchObject({ rotateX: -180, rotateZ: 0, skewX: 0, duration: BOOK_FLIP_DURATION });
    expect(tl.call.mock.calls[0]![2]).toBeCloseTo(BOOK_FLIP_DURATION / 2);
  });

  it("normal motion keeps the tilt and the skew", () => {
    setReducedMotion(false);
    const tl = fakeTimeline();
    render(<BookFlip playKey={1} direction="open" />);
    const [, , to] = tl.fromTo.mock.calls[0]!;
    expect(to).toMatchObject({ rotateX: -180, rotateZ: -6, skewX: -4, duration: BOOK_FLIP_DURATION });
  });

  it("the midpoint and done still fire when GSAP never reports back (safety net)", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    fakeTimeline();
    const onMidpoint = vi.fn();
    const onDone = vi.fn();
    render(<BookFlip playKey={1} onMidpoint={onMidpoint} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onMidpoint).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
