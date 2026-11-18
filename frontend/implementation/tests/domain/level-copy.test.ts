import { describe, expect, it } from "vitest";
import { levelListCameraStep } from "@/src/domain/level-list-script";
import { nudgeLines } from "@/src/domain/world-intro-script";

const PICK_LINE = "Tunjukkan 1, 2, atau 3 jarimu ke kamera buat memilih bab yang mau kamu mainkan!";

describe("level list copy in camera mode names the finger gesture", () => {
  it.each([1, 2, 3])("with %i bab open Momo asks for 1, 2 or 3 fingers", (unlocked) => {
    expect(levelListCameraStep(unlocked).lines).toContain(PICK_LINE);
  });

  it("a new student is still pointed to Bab 1", () => {
    expect(levelListCameraStep(1).lines.join(" ")).toMatch(/Bab 1/);
  });

  it("the copy uses no emoji and no brackets", () => {
    for (const unlocked of [1, 2, 3]) {
      const text = levelListCameraStep(unlocked).lines.join(" ");
      expect(text).not.toMatch(/[()]/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("the world nudge points at the sky, not at the card catalog that moved to the canvas", () => {
  it.each([1, 2, 3])("stage %i asks the student to draw the piece in the sky", (stage) => {
    const text = nudgeLines(stage).join(" ");
    expect(text).toMatch(/langit/);
    expect(text).toMatch(/gambar/);
    expect(text).toMatch(/\?/);
    expect(text).not.toMatch(/Kamu mau bikin yang mana/);
  });

  it("the first line of the world story stays as it is", () => {
    expect(nudgeLines(1)[0]).toBe("Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.");
  });
});
