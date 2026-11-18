import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { tutorialStep } from "@/src/domain/tutorial-script";

beforeEach(() => resetInputModeForTest());
afterEach(() => cleanup());

describe("Tutorial copy and skip (R4, R5 of the 0.0.16 PRD)", () => {
  it("card 2 names only duri as the danger, never pisau", async () => {
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/duri/);
    expect(text).not.toMatch(/pisau/i);
    expect(tutorialStep("safety", "Thinman").lines.join(" ")).not.toMatch(/tajam|pisau/);
  });

  it("there is no skip button in camera or fallback mode: every card needs its practice (no skipping the cards)", async () => {
    forceInputMode("fallback");
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} onSkip={() => {}} />);
    });
    expect(screen.queryByText(/Lewati/)).toBeNull();
  });
});
