import { describe, expect, it } from "vitest";
import { COVER_WAKE, NUMBER_STEP, NUMBER_TAKEN_STEP, levelListStep, tutorialStep, type TutorialMoment } from "@/src/domain/guide-script";

const moments: TutorialMoment[] = ["deal", "walk", "walk-done", "safety", "gesture", "gesture-done"];

describe("Momo page guide script", () => {
  const all = [
    COVER_WAKE, NUMBER_STEP, NUMBER_TAKEN_STEP,
    levelListStep(1), levelListStep(2), levelListStep(3),
    ...moments.map((m) => tutorialStep(m, "Thinman")),
  ];

  it("has short lines, none empty, and no text in parentheses (M-012)", () => {
    for (const step of all) {
      expect(step.lines.length).toBeGreaterThan(0);
      for (const line of step.lines) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(80);
        expect(line).not.toMatch(/[()]/);
      }
    }
  });

  // PRD 0.0.16 R1/R17: greet, origin, then the invite; the book flip (not a line) leads to the ruler.
  it("greets on the cover, tells her origin and invites the student in", () => {
    expect(COVER_WAKE.lines[0]).toMatch(/^Halo! Aku Momo/);
    expect(COVER_WAKE.lines.join(" ")).toMatch(/nggak bisa menggambar/);
    expect(COVER_WAKE.lines.join(" ")).toMatch(/Thinman/);
    expect(COVER_WAKE.lines.at(-1)).toBe("Ayo ikut aku masuk ke dunia Sketchbook!");
  });

  it("uses the character name in the walk step and points at the newest chapter on the level list", () => {
    expect(tutorialStep("walk", "Thinman").lines.join(" ")).toContain("Thinman");
    expect(levelListStep(1).lines.join(" ")).toMatch(/Bab 1/);
    expect(levelListStep(2).lines.join(" ")).toMatch(/Bab 2/);
    expect(levelListStep(3).lines.join(" ")).toMatch(/Semua bab/);
  });
});
