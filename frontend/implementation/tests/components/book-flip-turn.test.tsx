// @vitest-environment jsdom
// R12-04 (M-019): the semi-3D book turn. The leaf hinges at the top edge and lifts up; a soft shadow sweeps over the
// page underneath; reduced motion keeps the same duration and turn but drops the sweeping shadow.
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

/** A timeline that records every tween but applies nothing, so we can read the pose the page paints first. */
function recordingTimeline() {
  const tl = {
    fromTo: vi.fn().mockReturnThis(),
    to: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    kill: vi.fn(),
  };
  vi.spyOn(gsap, "timeline").mockReturnValue(tl as never);
  return tl;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BookFlip semi-3D turn (R12-04)", () => {
  it("the default turn sits inside the Owner's 0.9-1.2 s window", () => {
    expect(BOOK_FLIP_DURATION).toBeGreaterThanOrEqual(0.9);
    expect(BOOK_FLIP_DURATION).toBeLessThanOrEqual(1.2);
  });

  it("the leaf only hinges on the top edge (rotateX 0 to -180, ease in-out), with no sideways tilt or skew", () => {
    setReducedMotion(false);
    const tl = recordingTimeline();
    render(<BookFlip playKey={1} direction="open" />);
    const [, from, to] = tl.fromTo.mock.calls[0]!;
    expect(from).toMatchObject({ rotateX: 0 });
    expect(to).toMatchObject({ rotateX: -180, duration: BOOK_FLIP_DURATION, ease: "power2.inOut" });
    expect(to).not.toHaveProperty("rotateZ");
    expect(to).not.toHaveProperty("skewX");
  });

  it("the first painted pose already matches the start, so the page never flashes before the tween applies it", () => {
    setReducedMotion(false);
    recordingTimeline();
    const { getByTestId, rerender } = render(<BookFlip playKey={1} direction="open" />);
    const leaf = getByTestId("book-flip").querySelector<HTMLElement>(".book-flip__leaf")!;
    expect(leaf.style.transform).toContain("rotateX(0deg)");
    rerender(<BookFlip playKey={2} direction="close" />);
    const closeLeaf = getByTestId("book-flip").querySelector<HTMLElement>(".book-flip__leaf")!;
    expect(closeLeaf.style.transform).toContain("rotateX(-180deg)");
  });

  it("a soft shadow sweeps over the page underneath in normal motion", () => {
    setReducedMotion(false);
    const tl = recordingTimeline();
    render(<BookFlip playKey={1} direction="open" />);
    const shadeTweens = tl.fromTo.mock.calls.filter(([target]) => (target as HTMLElement).classList?.contains("book-flip__shade"));
    expect(shadeTweens).toHaveLength(1);
    const [, from, to] = shadeTweens[0]!;
    expect(from).toMatchObject({ yPercent: expect.any(Number) });
    expect(to).toMatchObject({ yPercent: expect.any(Number), duration: BOOK_FLIP_DURATION });
    expect((from as { yPercent: number }).yPercent).toBeGreaterThan((to as { yPercent: number }).yPercent);
  });

  it("reduced motion keeps the same turn and duration, and skips the sweeping shadow", () => {
    setReducedMotion(true);
    const tl = recordingTimeline();
    const { getByTestId } = render(<BookFlip playKey={1} direction="open" />);
    const leafTweens = tl.fromTo.mock.calls.filter(([target]) => (target as HTMLElement).classList?.contains("book-flip__leaf"));
    expect(leafTweens[0]![2]).toMatchObject({ rotateX: -180, duration: BOOK_FLIP_DURATION });
    const shadeTweens = tl.fromTo.mock.calls.filter(([target]) => (target as HTMLElement).classList?.contains("book-flip__shade"));
    expect(shadeTweens).toHaveLength(0);
    expect(getByTestId("book-flip").classList).toContain("book-flip--calm");
  });

  it("the midpoint (edge-on) callback fires at half the duration in both motion modes", () => {
    for (const reduce of [false, true]) {
      cleanup();
      setReducedMotion(reduce);
      const tl = recordingTimeline();
      render(<BookFlip playKey={1} direction="open" />);
      const midCall = tl.call.mock.calls[0]!;
      expect(midCall[2]).toBeCloseTo(BOOK_FLIP_DURATION / 2);
    }
  });

  it("renders the shadow and the page edge as layers, with the shadow beneath the leaf", () => {
    setReducedMotion(false);
    recordingTimeline();
    const { getByTestId } = render(<BookFlip playKey={1} direction="open" />);
    const root = getByTestId("book-flip");
    const shade = root.querySelector(".book-flip__shade");
    const leaf = root.querySelector(".book-flip__leaf");
    const edge = root.querySelector(".book-flip__leaf .book-flip__edge");
    expect(shade).not.toBeNull();
    expect(edge).not.toBeNull();
    expect(shade!.compareDocumentPosition(leaf!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still completes with the safety timer when the tween never reports back", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const onDone = vi.fn();
    const onMidpoint = vi.fn();
    const tl = recordingTimeline();
    render(<BookFlip playKey={1} direction="close" onDone={onDone} onMidpoint={onMidpoint} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onMidpoint).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(tl.kill).toHaveBeenCalled();
  });
});
