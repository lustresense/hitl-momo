import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";

beforeEach(() => {
  HTMLElement.prototype.animate = (() => ({
    finished: Promise.resolve(),
    cancel() {},
  })) as unknown as typeof HTMLElement.prototype.animate;
});

afterEach(() => cleanup());

describe("TutorialBrochure characterName prop", () => {
  it.each([
    [undefined, "Thinman"],
    ["CustomHero", "CustomHero"],
    ["", "Stickman"],
    ["   ", "Stickman"],
  ])("renders expected name for input %s", (characterDisplayName, expectedName) => {
    render(<TutorialBrochure onStart={() => {}} characterDisplayName={characterDisplayName} />);
    expect(screen.getAllByText(new RegExp(`Kenalan dengan ${expectedName}`, "i")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`Ajak ${expectedName} ke bendera`, "i")).length).toBeGreaterThan(0);
  });
});
