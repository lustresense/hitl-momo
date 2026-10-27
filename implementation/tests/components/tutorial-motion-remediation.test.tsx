import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { getPrefersReducedMotion, subscribePrefersReducedMotion } from "@/src/components/onboarding/tutorial-motion";

describe("A11Y-01 Tutorial Reduced Motion", () => {
  let mediaQueryListeners: Array<(e: MediaQueryListEvent) => void> = [];
  let matchesReducedMotion = false;

  beforeEach(() => {
    matchesReducedMotion = false;
    mediaQueryListeners = [];

    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion: reduce") ? matchesReducedMotion : false,
        media: query,
        onchange: null,
        addListener: vi.fn((listener) => {
          mediaQueryListeners.push(listener);
        }),
        removeListener: vi.fn((listener) => {
          mediaQueryListeners = mediaQueryListeners.filter((l) => l !== listener);
        }),
        addEventListener: vi.fn((event, listener) => {
          if (event === "change") mediaQueryListeners.push(listener);
        }),
        removeEventListener: vi.fn((event, listener) => {
          if (event === "change") mediaQueryListeners = mediaQueryListeners.filter((l) => l !== listener);
        }),
        dispatchEvent: vi.fn(),
      })),
    });

    // Mock Element.prototype.animate
    Element.prototype.animate = vi.fn().mockImplementation((keyframes, options) => {
      const anim = {
        finished: Promise.resolve(),
        cancel: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        reverse: vi.fn(),
        finish: vi.fn(),
      };
      return anim as unknown as Animation;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exports motion helpers that detect and subscribe to prefers-reduced-motion", () => {
    matchesReducedMotion = true;
    expect(getPrefersReducedMotion()).toBe(true);

    let changedTo = false;
    const unsubscribe = subscribePrefersReducedMotion((reduced) => {
      changedTo = reduced;
    });

    // Simulate change event
    mediaQueryListeners.forEach((listener) =>
      listener({ matches: false, media: "(prefers-reduced-motion: reduce)" } as MediaQueryListEvent)
    );
    expect(changedTo).toBe(false);

    unsubscribe();
  });

  it("reduces or zeros WAAPI animation durations when reduced motion is preferred", async () => {
    matchesReducedMotion = true;
    const onStart = vi.fn();

    vi.useFakeTimers();

    await act(async () => {
      render(<TutorialBrochure onStart={onStart} />);
    });

    // Advance timers to trigger all setTimeout/macrotasks in start()
    await act(async () => {
      vi.runAllTimersAsync();
    });

    const animateCalls = (Element.prototype.animate as any).mock.calls;
    // When reduced motion is implemented, animateCalls should either be skipped/collapsed
    // or all durations should be <= 1ms (or 0).
    // In un-remediated code, duration(ms) returns full ms (e.g. 800, 1100), so this assertion fails!
    expect(animateCalls.length).toBeGreaterThan(0);
    const maxDuration = Math.max(
      ...animateCalls.map((call: any) => {
        const options = call[1];
        return typeof options === "number" ? options : (options?.duration ?? 0);
      })
    );
    expect(maxDuration).toBeLessThanOrEqual(1);

    vi.useRealTimers();
  });

  it("does not skip tutorial or bypass 3-card progression gates when reduced motion is active", async () => {
    matchesReducedMotion = true;
    const onStart = vi.fn();

    await act(async () => {
      render(<TutorialBrochure onStart={onStart} />);
    });

    // Tutorial should NOT call onStart immediately (not skipped)
    expect(onStart).not.toHaveBeenCalled();

    // Card 1 gate: 'Lanjut' button on card 1 should be disabled until motionDone
    const card1 = screen.getByLabelText("Kartu tutorial 1");
    const nextBtn1 = card1.querySelector("button.brochure-cta");
    expect(nextBtn1).toBeTruthy();
    expect((nextBtn1 as HTMLButtonElement).disabled).toBe(true);
  });
});
