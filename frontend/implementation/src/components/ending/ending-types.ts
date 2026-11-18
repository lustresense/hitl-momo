import type { DecisionType, StrokePoint } from "@/src/domain/types";

/** What the closing needs per finished level; world stores it in useLevelSession. */
export interface LevelRecap {
  levelId: string;
  /** Short chapter title shown above the object, e.g. "Bab 1". */
  title: string;
  /** The student's own strokes of the object that was used (first object of the level is fine). */
  strokes: StrokePoint[][];
  /** Label after the student's decision. */
  finalLabel: string;
  /** Category of the object in the world. */
  category: "padat" | "bahaya" | "netral";
  decision: DecisionType;
  /** Momo's rank 1 guess, from the provider. */
  firstGuess: string;
  /** Confidence of that guess in [0,1], when the provider gave one. Shown as a percent only when present. */
  firstGuessConfidence?: number;
  /** Redraws on this level, when the flow recorded them. Missing = "tidak tercatat". */
  redrawCount?: number;
}

export type EndingChoice = "again" | "finish";

export const DECISION_TEXT: Record<DecisionType, string> = {
  accept: "Terima",
  correct: "Pilih lain",
  override: "Bukan semua",
};

/** Stage order of the closing. Durations in ms for the timed (non-interactive) stages. */
export type EndingStage = "portal" | "talk" | "recap" | "quiz" | "finish";

/**
 * Portal timeline (ms from the start of the portal). The CSS in ending-flow.css uses the same numbers.
 * Full length is kept on reduced motion: only the repeated glints and the bob amplitude are reduced.
 */
export const ENDING_TIMING = {
  /** Thinman starts walking in. */
  walkIn: 600,
  /** Thinman is inside the portal; the glints flash. */
  inside: 3200,
  /** Thinman steps out alive. Momo reacts. */
  out: 4200,
  /** The portal is over; Momo starts her overview. */
  portal: 7000,
} as const;

/** Fit strokes into a box, keeping aspect. Pure, for rendering the student's drawing small. */
export function strokesToPath(strokes: StrokePoint[][], w: number, h: number, pad = 6): string {
  const pts = strokes.flat();
  if (pts.length === 0) return "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const s = Math.min((w - 2 * pad) / Math.max(1e-6, x1 - x0), (h - 2 * pad) / Math.max(1e-6, y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  const f = (n: number) => n.toFixed(1);
  return strokes
    .filter((st) => st.length > 0)
    .map((st) => st.map((p, i) => `${i ? "L" : "M"}${f(ox + (p.x - x0) * s)} ${f(oy + (p.y - y0) * s)}`).join(""))
    .join("");
}
