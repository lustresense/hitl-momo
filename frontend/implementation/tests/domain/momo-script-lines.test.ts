import { describe, expect, it } from "vitest";
import { momoLine, type MomoMoment } from "@/src/domain/momo-script";
import { introLines } from "@/src/domain/world-intro-script";
import { COVER_WAKE, NUMBER_STEP, levelListStep, tutorialStep } from "@/src/domain/guide-script";

/** Brief (e): a line longer than about 90 characters is split into two short bubbles, same words, same meaning. */
const MAX_LINE = 90;
const MOMENTS: MomoMoment[] = [
  "level-entry", "drawing-cue", "drawing-empty", "predicting", "provider-error", "top3-compare", "decision-accepted",
  "decision-corrected", "decision-overridden", "solid-consequence", "danger-consequence", "fallback-consequence",
  "cycle-success", "cycle-fail", "level-complete",
];
/** Lower-case words without punctuation: the split may move a comma or a full stop, never a word. */
const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, " ").trim();

describe("Momo script line length (brief e)", () => {
  it("every momo-script line is at most 90 characters", () => {
    for (const moment of MOMENTS) {
      for (const line of [momoLine(moment)].flat()) {
        expect(line.length, `${moment}: ${line}`).toBeLessThanOrEqual(MAX_LINE);
      }
    }
  });

  it("the long level-entry line is split into two bubbles with the same words in the same order", () => {
    const original = "Halo, aku Momo. Aku bisa membaca pola gambarmu, tapi tidak bisa menggambar. Kamu Illustrator-nya.";
    const lines = [momoLine("level-entry")].flat();
    expect(lines.length).toBe(2);
    expect(words(lines.join(" "))).toBe(words(original));
  });

  it("world intro lines are at most 90 characters too (the stage 3 story line was 92)", () => {
    for (const stage of [1, 2, 3, 4]) {
      for (const line of introLines(stage, "Thinman")) {
        expect(line.length, `stage ${stage}: ${line}`).toBeLessThanOrEqual(MAX_LINE);
      }
    }
    expect(introLines(3, "Thinman")).toContain("Thinman harus keluar sampai ke papan petunjuk.");
  });

  it("guide lines are at most 90 characters", () => {
    const steps = [COVER_WAKE, NUMBER_STEP, levelListStep(1), levelListStep(2), levelListStep(3)];
    for (const moment of ["deal", "walk", "walk-done", "safety", "gesture", "gesture-done"] as const) {
      steps.push(tutorialStep(moment, "Thinman"));
    }
    for (const step of steps) {
      for (const line of step.lines) expect(line.length, line).toBeLessThanOrEqual(MAX_LINE);
    }
  });
});
