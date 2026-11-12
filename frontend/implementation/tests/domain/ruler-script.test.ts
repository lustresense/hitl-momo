import { describe, expect, it } from "vitest";
import { RULER_CLASS_OFFLINE_STEP, RULER_FOCUS_STEP, RULER_HINT_STEP, RULER_TAKEN_STEP, rulerAskStep } from "@/src/domain/ruler-script";

describe("ruler-script copy (BIGPROMPT 6.2)", () => {
  it("uses the approved sentences", () => {
    expect(RULER_FOCUS_STEP.lines).toEqual(["Sebelum kita masuk, pilih nomor absenmu dulu, ya."]);
    expect(RULER_HINT_STEP.lines).toEqual(["Geser penggarisnya sampai pas."]);
    expect(rulerAskStep(21).lines).toEqual(["Benar ini nomor absenmu, 21?"]);
    expect(RULER_CLASS_OFFLINE_STEP.lines).toEqual(["Nomormu kusimpan di perangkat ini. Kelas belum terhubung."]);
    expect(RULER_TAKEN_STEP.lines).toEqual(["Nomor itu sudah ada yang pakai. Geser ke nomor lain ya."]);
  });

  it("has no parentheses, emoji or wrong character name in any line", () => {
    const steps = [RULER_FOCUS_STEP, RULER_HINT_STEP, rulerAskStep(1), RULER_CLASS_OFFLINE_STEP, RULER_TAKEN_STEP];
    for (const step of steps) {
      for (const line of step.lines) {
        expect(line).not.toMatch(/[()]/);
        expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(line).not.toMatch(/Tinman|Stickman/);
      }
    }
  });
});
