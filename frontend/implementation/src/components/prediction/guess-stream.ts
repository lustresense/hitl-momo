/**
 * R11: Momo guesses while the student draws, and asks once the hand rests.
 * Pure timing logic (no React, no DOM) so it can be unit tested with fake time.
 */

/** Provisional guesses while drawing, at most one call per this many ms (PRD: 400-600 ms). */
export const GUESS_STREAM_INTERVAL_MS = 500;
/** "Jeda diam": the hand rested this long after the last stroke change, so Momo asks. Single constant (PRD R11). */
export const GUESS_IDLE_MS = 1000;

export interface GuessStreamState {
  /** Signature of the drawing at the last change. */
  signature: string;
  /** Time of the last change. */
  changedAt: number;
  /** Time of the last provisional call start. */
  lastCallAt: number;
  /** A provisional call is still running (new ones are dropped, not queued). */
  inFlight: boolean;
  /** Signature Momo already asked about (idle fired once per drawing state). */
  askedFor: string | null;
}

export function initialGuessStream(now = 0): GuessStreamState {
  return { signature: "", changedAt: now, lastCallAt: -Infinity, inFlight: false, askedFor: null };
}

/** A cheap signature of the strokes: count and total points. Any new ink, erase or undo changes it. */
export function strokeSignature(strokes: ReadonlyArray<ReadonlyArray<unknown>>): string {
  let points = 0;
  for (const s of strokes) points += s.length;
  return `${strokes.length}:${points}`;
}

export interface GuessStreamStep {
  state: GuessStreamState;
  /** Start a provisional (streamed) guess now. */
  callProvisional: boolean;
  /** The hand rested: Momo asks (submit the drawing). */
  ask: boolean;
}

/** Advance the stream with the current drawing signature at time `now`. */
export function stepGuessStream(prev: GuessStreamState, signature: string, hasInk: boolean, now: number): GuessStreamStep {
  const state = { ...prev };
  const changed = signature !== prev.signature;
  if (changed) {
    state.signature = signature;
    state.changedAt = now;
  }
  let callProvisional = false;
  if (hasInk && changed && !state.inFlight && now - state.lastCallAt >= GUESS_STREAM_INTERVAL_MS) {
    callProvisional = true;
    state.lastCallAt = now;
  }
  let ask = false;
  if (hasInk && !changed && state.askedFor !== signature && now - state.changedAt >= GUESS_IDLE_MS) {
    ask = true;
    state.askedFor = signature;
  }
  return { state, callProvisional, ask };
}
