import {
  HOLD_DECISION_PREFIXES,
  HOLD_MS_DECISION,
  HOLD_MS_DEFAULT,
  HOLD_MS_PLACE,
  HOLD_PLACE_PREFIXES,
} from "./constants";

const startsWithAny = (s: string, prefixes: readonly string[]): boolean => prefixes.some((p) => s.startsWith(p));

/** Port msFor (hand.js:215): durasi ring menurut makna label. */
export function holdMs(label?: string | null, ms?: number): number {
  const s = String(label ?? "");
  if (startsWithAny(s, HOLD_DECISION_PREFIXES)) return HOLD_MS_DECISION;
  if (startsWithAny(s, HOLD_PLACE_PREFIXES)) return HOLD_MS_PLACE;
  return ms !== undefined && ms > 0 && ms < HOLD_MS_DEFAULT ? ms : HOLD_MS_DEFAULT;
}
