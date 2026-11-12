/**
 * Pure helpers for the neutral recap. Every number comes from the recorded LevelRecap list; a missing value is
 * null and is shown as "tidak tercatat". No score, no grade: counts and the words the student already saw.
 */
import type { LevelRecap } from "./ending-types";

export const NOT_RECORDED = "tidak tercatat";

export interface RecapTotals {
  objects: number;
  accept: number;
  correct: number;
  override: number;
  /** Sum of recorded redraws, or null when no level recorded one. */
  redraws: number | null;
  /** Levels whose final label is not Momo's first guess. */
  guessChanged: number;
}

/** null when there is no recorded level at all. */
export function recapTotals(recaps: readonly LevelRecap[]): RecapTotals | null {
  if (recaps.length === 0) return null;
  const withRedraw = recaps.filter((r) => typeof r.redrawCount === "number" && Number.isFinite(r.redrawCount));
  return {
    objects: recaps.length,
    accept: recaps.filter((r) => r.decision === "accept").length,
    correct: recaps.filter((r) => r.decision === "correct").length,
    override: recaps.filter((r) => r.decision === "override").length,
    redraws: withRedraw.length > 0 ? withRedraw.reduce((sum, r) => sum + (r.redrawCount ?? 0), 0) : null,
    guessChanged: recaps.filter((r) => r.firstGuess !== "" && r.finalLabel !== r.firstGuess).length,
  };
}

/** "label, 72%" when the confidence is a valid number in [0,1]; the bare label otherwise. */
export function guessText(recap: LevelRecap): string {
  if (recap.firstGuess === "") return NOT_RECORDED;
  const c = recap.firstGuessConfidence;
  if (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1) return `${recap.firstGuess}, ${Math.round(c * 100)}%`;
  return recap.firstGuess;
}

/** Behavior in plain words. */
export function behaviorText(category: LevelRecap["category"] | undefined): string {
  if (category === "padat") return "Aman";
  if (category === "bahaya") return "Bahaya";
  if (category === "netral") return "Netral";
  return NOT_RECORDED;
}

export function countText(label: string, value: number | null): string {
  return `${label}: ${value === null ? NOT_RECORDED : value}`;
}

/** "Gambar lagi: 5 kali", or "Gambar lagi: tidak tercatat" when no level recorded a redraw. */
export function redrawText(total: number | null): string {
  return `Gambar lagi: ${total === null ? NOT_RECORDED : `${total} kali`}`;
}
