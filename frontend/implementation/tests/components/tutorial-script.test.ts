import { describe, expect, it } from "vitest";
import { tutorialCardCopy, tutorialHint, tutorialStep, TUTORIAL_PRACTICE_TOOLS } from "@/src/domain/tutorial-script";

const ALL_TEXT = (name: string) =>
  [0, 1, 2].flatMap((i) => {
    const c = tutorialCardCopy(i as 0 | 1 | 2, name);
    return [c.title, c.copy, c.cta, tutorialHint(i as 0 | 1 | 2, true, true).text, tutorialHint(i as 0 | 1 | 2, false, true).text];
  });

describe("tutorial copy (R4)", () => {
  it("uses the character name from the caller, never Tinman or Stickman in the copy", () => {
    const text = [...ALL_TEXT("Thinman"), ...["walk", "walk-done", "safety", "gesture", "gesture-done"].map((m) => tutorialStep(m as never, "Thinman").lines.join(" "))].join(" ");
    expect(text).not.toMatch(/Tinman|Stickman/);
    expect(text).toMatch(/Thinman/);
  });

  it("card 1 hint is the exact pinch-and-drag line, and the fallback line has no keyboard hint", () => {
    expect(tutorialHint(0, true, false).text).toBe("Cubit dan geser Thinman ke kanan sampai menyentuh bendera.");
    expect(tutorialHint(0, false, false).text).not.toMatch(/panah|\[|Spasi|Enter|tombol Q|A\b|D\b/);
  });

  it("card 3 names the four gestures and the two-finger and palm meanings", () => {
    const hint = tutorialHint(2, true, false).text;
    expect(hint).toMatch(/cubit/i);
    expect(hint).toMatch(/kepal/i);
    expect(hint).toMatch(/dua jari/i);
    expect(hint).toMatch(/telapak/i);
  });

  it("buttons: Lanjut 1 s on cards 1-2, Mulai Level 1 2 s on card 3", () => {
    expect(tutorialCardCopy(0, "Thinman")).toMatchObject({ cta: "Lanjut", holdMs: 1000 });
    expect(tutorialCardCopy(1, "Thinman")).toMatchObject({ cta: "Lanjut", holdMs: 1000 });
    expect(tutorialCardCopy(2, "Thinman")).toMatchObject({ cta: "Mulai Level 1", holdMs: 2000 });
  });

  it("card 2 names duri as the danger and never pisau, and no copy uses parentheses or emoji", () => {
    const text = ALL_TEXT("Thinman").join(" ") + tutorialStep("safety", "Thinman").lines.join(" ");
    expect(text).toMatch(/duri/);
    expect(text).not.toMatch(/pisau|tajam/i);
    expect(text).not.toMatch(/[()]/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("the practice tools are the four gestures in order", () => {
    expect([...TUTORIAL_PRACTICE_TOOLS]).toEqual(["draw", "erase", "undo", "redo"]);
  });
});
