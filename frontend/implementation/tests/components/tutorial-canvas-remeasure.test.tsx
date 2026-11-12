import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest } from "@/src/camera/thumb-tracker";
import { DrawingSurface } from "@/src/input";
import { mockRect, pointer, stubCanvas2d } from "./tutorial-helpers";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

// Real timers and real GSAP, as in tutorial-flow: the practice canvas is sized from the transformed box, so the
// test checks the measure that happens after the page has really turned.
beforeEach(() => {
  resetInputModeForTest();
  resetThumbTrackerForTest();
  stubCanvas2d();
});
afterEach(() => {
  cleanup();
  resetThumbTrackerForTest();
  resetInputModeForTest();
  vi.restoreAllMocks();
});

const cardOpen = (n: number) => document.querySelector(`.tutorial-card-${n}.is-open`) !== null;

describe("practice canvas of card 3 (R4b): measured again once its page is open and on resize", () => {
  it("a window resize with card 3 open measures the canvas at the new scale", async () => {
    forceInputMode("fallback");
    await act(async () => {
      render(<TutorialBrochure onStart={vi.fn()} />);
    });
    await waitFor(() => expect(cardOpen(1)).toBe(true), { timeout: 8000 });

    // Card 1: walk to the flag with the mouse, then read the thumb time.
    const scene = screen.getByTestId("tutorial-walk");
    mockRect(scene);
    pointer(scene, "pointerdown", 80);
    pointer(scene, "pointerup", 80);
    await waitFor(() => expect(screen.getByRole("button", { name: "Lanjut" })).toBeTruthy(), { timeout: 45000 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Lanjut" }));
    await waitFor(() => expect(cardOpen(2)).toBe(true), { timeout: 15000 });

    // Card 2: no practice, only the read time.
    await waitFor(() => expect(screen.getByRole("button", { name: "Lanjut" })).toBeTruthy(), { timeout: 45000 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Lanjut" }));
    await waitFor(() => expect(cardOpen(3)).toBe(true), { timeout: 15000 });

    // Let the page turn finish (pause, unfold, canvas sizing), then resize the window.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const measure = vi.spyOn(DrawingSurface.prototype, "resizeForDpr");
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(measure).toHaveBeenCalled();
  }, 240000);
});
