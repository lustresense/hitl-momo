import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { gsap } from "gsap";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

describe("Tutorial Brochure card animation", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetInputModeForTest();
  });

  it("deals, fans and opens the first card on one real timeline, and never skips by itself", async () => {
    const onStart = vi.fn();
    const spy = vi.spyOn(gsap, "timeline");
    await act(async () => {
      render(<TutorialBrochure onStart={onStart} />);
    });
    expect(spy).toHaveBeenCalled();
    const first = spy.mock.results[0]!.value as gsap.core.Timeline;
    // A real choreography: deal-in + fan + open the first card is well over a second of motion.
    expect(first.totalDuration()).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(onStart).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps the thumb locked until the practice of the open card is done (fallback: walk with the mouse first)", async () => {
    // Locked: the ring is still on the card, greyed out with a lock, and there is no button to press.
    forceInputMode("fallback");
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    const thumb = screen.getByTestId("tutorial-thumb-1");
    expect(thumb.getAttribute("data-locked")).toBe("true");
    expect(screen.queryByRole("button", { name: "Lanjut" })).toBeNull();
    expect(screen.queryByTestId("tutorial-pinch-1")).toBeNull();
  });
});
