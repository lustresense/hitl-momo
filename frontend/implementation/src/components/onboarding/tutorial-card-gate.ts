/**
 * Gate of one tutorial card (R4), as a pure reducer: one event source, no React, no timers.
 *
 * A card's thumb ("aku mengerti") is only offered once Momo has finished explaining, the practice the card asks for
 * is done, and the student has had CARD_READ_MS to read. Nothing here moves a card on by itself: the thumb is the
 * only event that closes a card (see cardGate). Stale events from another card are ignored.
 */

export type CardIndex = 0 | 1 | 2;

/** Read time before the thumb is offered. Wall-clock, never shortened for reduced motion or tests. */
export const CARD_READ_MS = 3333;

/** Card 1 asks for the walk to the flag, card 3 for the four gestures. Card 2 has no action to do. */
export const CARD_NEEDS_PRACTICE: Record<CardIndex, boolean> = { 0: true, 1: false, 2: true };

export interface CardGate {
  index: CardIndex;
  /** The card has finished flying in and is open on screen. */
  opened: boolean;
  /** Momo has said the explanation lines of this card. */
  momoDone: boolean;
  /** The practice of this card is done (or the card has none). */
  practiceDone: boolean;
  /** CARD_READ_MS has passed after the card became eligible. */
  readDone: boolean;
  /** The thumb was confirmed; the card is closing. */
  closing: boolean;
}

export type CardPhase = "opening" | "explaining" | "practicing" | "reading" | "ackEligible" | "closing";

export type CardEvent =
  | { type: "START"; index: CardIndex }
  | { type: "OPENED"; index: CardIndex }
  | { type: "MOMO_DONE"; index: CardIndex }
  | { type: "PRACTICE_DONE"; index: CardIndex }
  | { type: "READ_DONE"; index: CardIndex }
  | { type: "THUMB"; index: CardIndex };

export function startCardGate(index: CardIndex): CardGate {
  return { index, opened: false, momoDone: false, practiceDone: !CARD_NEEDS_PRACTICE[index], readDone: false, closing: false };
}

/** Where the card is now. Reading starts only once Momo and the practice are both done. */
export function cardPhase(s: CardGate): CardPhase {
  if (s.closing) return "closing";
  if (!s.opened) return "opening";
  if (!(s.momoDone && s.practiceDone)) return s.momoDone ? "practicing" : "explaining";
  return s.readDone ? "ackEligible" : "reading";
}

/** Returns the same object when the event changes nothing, so callers can tell whether it was accepted. */
export function cardGate(s: CardGate, e: CardEvent): CardGate {
  if (e.type === "START") return startCardGate(e.index);
  if (e.index !== s.index || s.closing) return s;
  switch (e.type) {
    case "OPENED":
      return s.opened ? s : { ...s, opened: true };
    case "MOMO_DONE":
      return s.momoDone ? s : { ...s, momoDone: true };
    case "PRACTICE_DONE":
      return s.practiceDone ? s : { ...s, practiceDone: true };
    case "READ_DONE":
      return s.readDone || !(s.momoDone && s.practiceDone) ? s : { ...s, readDone: true };
    case "THUMB":
      return cardPhase(s) === "ackEligible" ? { ...s, closing: true } : s;
  }
}
