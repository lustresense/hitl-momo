import { describe, expect, it } from "vitest";
import { AI_TALK_LINES, FINISH_LINES, QUIZ_LEAD_LINES, RECAP_LINES } from "@/src/domain/ending-script";
import { FORBIDDEN_JUDGEMENT_WORDS } from "@/tests/components/ending-copy-rules";

// Momo's closing copy: short, not preachy, no judgement of the student, and the character name from the token file.
describe("ending copy (Momo)", () => {
  it("the AI overview is two or three short lines", () => {
    expect(AI_TALK_LINES.length).toBeGreaterThanOrEqual(2);
    expect(AI_TALK_LINES.length).toBeLessThanOrEqual(3);
    for (const line of AI_TALK_LINES) expect(line.length).toBeLessThanOrEqual(90);
  });

  it("the AI overview says Momo guesses from patterns, can miss, and the student decides", () => {
    const text = AI_TALK_LINES.join(" ").toLowerCase();
    expect(text).toMatch(/menebak/);
    expect(text).toMatch(/meleset/);
    expect(text).toMatch(/kamu yang memutuskan/);
  });

  it("no line judges the student or the AI with a grading word", () => {
    const all = [...AI_TALK_LINES, ...RECAP_LINES, ...QUIZ_LEAD_LINES, ...FINISH_LINES].join(" ");
    for (const word of FORBIDDEN_JUDGEMENT_WORDS) expect(all.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`));
  });

  it("names the character from the token file, never Tinman or Stickman", () => {
    const all = [...AI_TALK_LINES, ...RECAP_LINES, ...QUIZ_LEAD_LINES, ...FINISH_LINES].join(" ");
    expect(all).not.toMatch(/Tinman|Stickman/);
    expect(FINISH_LINES.join(" ")).toContain("Thinman");
  });

  it("the quiz lead line is the agreed sentence", () => {
    expect(QUIZ_LEAD_LINES).toEqual(["Sebelum pulang, ada beberapa pertanyaan singkat, ya."]);
  });
});
