/**
 * Shared by RD-03/04/05. Pure functions only: landmarks in, numbers out. No I/O, no camera, no DOM.
 * The feature vector is the SAME code for training export and for the JS inference that RD-05 measures.
 */
import {
  DEFAULT_LAB_ASPECT,
  classifyHandPose,
  countExtendedFingers,
  thumbLateral,
  withAspect,
  type HandPose,
} from "../../src/input/hand-gesture";
import type { Landmark } from "../../src/input/types";

export const LABELS = ["FIVE", "FOUR", "THREE", "TWO", "ONE", "FIST", "THUMB_UP", "PINCH_LIKE", "OTHER"] as const;
export type Label = (typeof LABELS)[number];

/** HaGRIDv2 class -> label. Reviewed by hand from the class sheet; `stop` is UNCERTAIN (thumb along the hand). */
export const CLASS_TO_LABEL: Record<string, Label> = {
  palm: "FIVE",
  stop: "FIVE",
  four: "FOUR",
  three: "THREE",
  one: "ONE",
  two_up: "TWO",
  peace: "TWO",
  fist: "FIST",
  like: "THUMB_UP",
  ok: "PINCH_LIKE",
  // Everything else is "something else": no_gesture (natural hand), three2 and three3 (not the 3-fingers pose),
  // thumb_index, call, grip, grabbing, point, rock, mute, dislike.
};
export const labelOf = (cls: string): Label => CLASS_TO_LABEL[cls] ?? "OTHER";

export const FEATURE_NAMES: string[] = [];
for (let i = 1; i <= 20; i++) FEATURE_NAMES.push(`x${i}`, `y${i}`);
for (const f of ["thumb", "index", "middle", "ring", "pinky"]) FEATURE_NAMES.push(`reach_${f}`);
for (const f of ["thumb", "index", "middle", "ring", "pinky"]) FEATURE_NAMES.push(`bend_${f}`);
for (const f of ["thumb_index", "index_middle", "middle_ring", "ring_pinky"]) FEATURE_NAMES.push(`gap_${f}`);
FEATURE_NAMES.push("thumb_index_tip", "thumb_lateral");
export const FEATURE_COUNT = FEATURE_NAMES.length; // 40 + 5 + 5 + 4 + 2 = 56

const TIPS = [4, 8, 12, 16, 20] as const;
// [base, mid, tip] joints for the bend angle: thumb uses MCP-IP-TIP, the others MCP-PIP-TIP.
const BEND: ReadonlyArray<readonly [number, number, number]> = [
  [2, 3, 4], [5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20],
];

const angle = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number => {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) / Math.PI; // 0..1 (1 = straight)
};

/**
 * Translation, scale, roll and handedness invariant description of one hand. Returns null for a degenerate hand.
 * `aspect` = video width / height the landmarks were normalised by (x is scaled by it so lengths are true).
 */
export function handFeatures(lm: Landmark[], aspect: number = DEFAULT_LAB_ASPECT): number[] | null {
  if (lm.length < 21) return null;
  const g = withAspect(lm, aspect);
  const w = g[0]!;
  const m = g[9]!;
  const span = Math.hypot(m.x - w.x, m.y - w.y);
  if (!(span > 1e-5)) return null;
  const ux = (m.x - w.x) / span;
  const uy = (m.y - w.y) / span;
  let mirror = 1;
  const local = g.map((p) => {
    const dx = p.x - w.x;
    const dy = p.y - w.y;
    return { x: (dx * -uy + dy * ux) / span, y: -(dx * ux + dy * uy) / span };
  });
  if (local[5]!.x > local[17]!.x) mirror = -1; // index knuckle always on the left
  const L = local.map((p) => ({ x: p.x * mirror, y: p.y }));
  const f: number[] = [];
  for (let i = 1; i <= 20; i++) f.push(L[i]!.x, L[i]!.y);
  for (const t of TIPS) f.push(Math.hypot(L[t]!.x, L[t]!.y));
  for (const [a, b, c] of BEND) f.push(angle(L[a]!, L[b]!, L[c]!));
  for (let i = 0; i < 4; i++) f.push(Math.hypot(L[TIPS[i]!]!.x - L[TIPS[i + 1]!]!.x, L[TIPS[i]!]!.y - L[TIPS[i + 1]!]!.y));
  f.push(Math.hypot(L[4]!.x - L[8]!.x, L[4]!.y - L[8]!.y));
  f.push(thumbLateral(g) ?? 0);
  return f.map((v) => Math.round(v * 1e5) / 1e5);
}

export type HeuristicKind = "baseline" | "revised";
export interface HeuristicRead {
  pose: HandPose;
  count: number;
  label: Label;
}

/** The two rule sets of this repository on one frame: the game's legacy rule and the lab's revised rule. */
export function heuristicRead(lm: Landmark[], kind: HeuristicKind, aspect: number = DEFAULT_LAB_ASPECT): HeuristicRead {
  const revised = kind === "revised";
  const pose = classifyHandPose(lm, revised ? { experimentalRobust: true, aspect } : {});
  const count = countExtendedFingers(lm, revised ? { robustThumb: true, aspect } : {});
  return { pose, count, label: heuristicLabel(pose, count) };
}

/** A pose + finger count in the 9-label space. The heuristics have no notion of "natural hand": that is OTHER. */
export function heuristicLabel(pose: HandPose, count: number): Label {
  switch (pose) {
    case "pinch": return "PINCH_LIKE";
    case "thumb-up": return "THUMB_UP";
    case "fist": return "FIST";
    case "one-finger": return "ONE";
    case "two-fingers": return "TWO";
    case "three-fingers": return "THREE";
    case "open-palm":
    case "split-palm":
      return count === 5 ? "FIVE" : count === 4 ? "FOUR" : "OTHER";
    default:
      return "OTHER";
  }
}

/** Does this read let the lab erase? (palm pose AND five fingers). Used for the false-Hapus rate of the heuristics. */
export const heuristicErases = (r: HeuristicRead): boolean => (r.pose === "open-palm" || r.pose === "split-palm") && r.count === 5;

// ---- metrics -------------------------------------------------------------------------------------------------------
export type Confusion = Record<Label, Record<Label, number>>;
export const emptyConfusion = (): Confusion =>
  Object.fromEntries(LABELS.map((a) => [a, Object.fromEntries(LABELS.map((b) => [b, 0]))])) as Confusion;

export interface ClassMetric { label: Label; support: number; precision: number | null; recall: number | null; f1: number | null }
export function perClass(c: Confusion): ClassMetric[] {
  return LABELS.map((l) => {
    const tp = c[l][l];
    const support = LABELS.reduce((s, x) => s + c[l][x], 0);
    const predicted = LABELS.reduce((s, x) => s + c[x][l], 0);
    const precision = predicted ? tp / predicted : null;
    const recall = support ? tp / support : null;
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : support ? 0 : null;
    return { label: l, support, precision, recall, f1 };
  });
}
export const macroF1 = (c: Confusion): number => {
  const ms = perClass(c).filter((m) => m.support > 0);
  return ms.reduce((s, m) => s + (m.f1 ?? 0), 0) / ms.length;
};
export const accuracy = (c: Confusion): number => {
  let ok = 0, all = 0;
  for (const a of LABELS) for (const b of LABELS) { all += c[a][b]; if (a === b) ok += c[a][b]; }
  return all ? ok / all : 0;
};
