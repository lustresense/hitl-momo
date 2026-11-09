import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialBrochure, advanceWalkPhase, TUTORIAL_STRIDE_PCT } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { tutorialStep } from "@/src/domain/guide-script";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

beforeEach(() => resetInputModeForTest());
afterEach(() => cleanup());

/** jsdom has no PointerEvent: build one with a clientX React can read. */
function pointerMove(el: Element, clientX: number) {
  const ev = new MouseEvent("pointermove", { bubbles: true, clientX });
  act(() => { el.dispatchEvent(ev); });
}

describe("Tutorial (PRD 0.0.16 R5, R18)", () => {
  it("card 2 names only duri as the danger, never pisau", async () => {
    await act(async () => { render(<TutorialBrochure onStart={() => {}} />); });
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/duri/);
    expect(text).not.toMatch(/pisau/i);
    expect(tutorialStep("safety", "Thinman").lines.join(" ")).not.toMatch(/tajam|pisau/);
  });

  it("walk phase follows the drag distance, so step speed follows drag speed", () => {
    expect(advanceWalkPhase(0, TUTORIAL_STRIDE_PCT / 2)).toBeCloseTo(0.5);
    expect(advanceWalkPhase(0, -TUTORIAL_STRIDE_PCT / 4)).toBeCloseTo(0.25);
    expect(advanceWalkPhase(0.9, TUTORIAL_STRIDE_PCT * 0.2)).toBeCloseTo(0.1);
  });

  it("dragging walks Thinman with the rig walk cycle", async () => {
    await act(async () => { render(<TutorialBrochure onStart={() => {}} />); });
    const scene = screen.getByTestId("tutorial-walk");
    scene.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) });
    pointerMove(scene, 20);
    const man = screen.getByTestId("tutorial-walk-man");
    const p1 = Number(man.dataset.walkPhase);
    expect(p1).toBeGreaterThan(0);
    expect(man.querySelector("svg")).toBeTruthy();
    pointerMove(scene, 77);
    expect(Number(screen.getByTestId("tutorial-walk-man").dataset.walkPhase)).not.toBe(p1);
  });

  it("no skip button in camera mode; it appears in fallback mode", async () => {
    await act(async () => { render(<TutorialBrochure onStart={() => {}} onSkip={() => {}} />); });
    expect(screen.queryByText(/Lewati Tutorial/)).toBeNull();
    act(() => forceInputMode("fallback"));
    expect(screen.getByText(/Lewati Tutorial/)).toBeTruthy();
  });
});
