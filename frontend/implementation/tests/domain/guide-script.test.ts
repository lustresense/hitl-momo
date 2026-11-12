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
    // R3 copy (Owner): who she is, the character she just found (bold name), then the invite.
    expect(COVER_WAKE.lines[0]).toBe("Aku Momo, gambar satu-satunya yang hidup di dunia Sketchbook Universe.");
    expect(COVER_WAKE.lines[1]).toBe("Aku barusan menemukan **Thinman**.");
    expect(COVER_WAKE.lines[2]).toBe("Kayaknya dia butuh bantuanmu supaya bisa hidup juga sepertiku.");
    expect(COVER_WAKE.lines.at(-1)).toBe("Yuk, antar dia ke tempat yang tepat.");
  });

  it("uses the character name in the walk step and points at the newest chapter on the level list", () => {
    expect(tutorialStep("walk", "Thinman").lines.join(" ")).toContain("Thinman");
    expect(levelListStep(1).lines.join(" ")).toMatch(/Bab 1/);
    expect(levelListStep(2).lines.join(" ")).toMatch(/Bab 2/);
    expect(levelListStep(3).lines.join(" ")).toMatch(/Semua bab/);
  });
});
