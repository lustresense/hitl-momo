import { describe, expect, it } from "vitest";
import { CARD_READ_MS, cardGate, cardPhase, startCardGate, type CardGate } from "@/src/components/onboarding/tutorial-card-gate";

/** Walk a card through its whole life; each step returns the new state. */
function run(events: Parameters<typeof cardGate>[1][]): CardGate {
  return events.reduce((s, e) => cardGate(s, e), startCardGate(0));
}

describe("tutorial card gate (R4): one event source per card", () => {
  it("reads for 10 s and never before the required practice and Momo are both done", () => {
    expect(CARD_READ_MS).toBe(3333);
    expect(cardPhase(startCardGate(0))).toBe("opening");
    const opened = run([{ type: "OPENED", index: 0 }]);
    expect(cardPhase(opened)).toBe("explaining");
    const momoOnly = cardGate(opened, { type: "MOMO_DONE", index: 0 });
    expect(cardPhase(momoOnly)).toBe("practicing");
    const both = cardGate(momoOnly, { type: "PRACTICE_DONE", index: 0 });
    expect(cardPhase(both)).toBe("reading");
    expect(cardPhase(cardGate(both, { type: "READ_DONE", index: 0 }))).toBe("ackEligible");
  });

  it("practice before Momo finishes still waits for Momo, then reads", () => {
    const s = run([{ type: "OPENED", index: 0 }, { type: "PRACTICE_DONE", index: 0 }]);
    expect(cardPhase(s)).toBe("explaining");
    expect(cardPhase(cardGate(s, { type: "MOMO_DONE", index: 0 }))).toBe("reading");
  });

  it("card 2 has no practice, so Momo finishing is enough to start reading", () => {
    const s = cardGate(startCardGate(1), { type: "OPENED", index: 1 });
    expect(startCardGate(1).practiceDone).toBe(true);
    expect(cardPhase(cardGate(s, { type: "MOMO_DONE", index: 1 }))).toBe("reading");
  });

  it("the thumb is the only way out, and only after the read time", () => {
    const reading = run([{ type: "OPENED", index: 0 }, { type: "MOMO_DONE", index: 0 }, { type: "PRACTICE_DONE", index: 0 }]);
    // Still reading: a thumb is refused and the card does not move on.
    expect(cardPhase(cardGate(reading, { type: "THUMB", index: 0 }))).toBe("reading");
    const eligible = cardGate(reading, { type: "READ_DONE", index: 0 });
    const closing = cardGate(eligible, { type: "THUMB", index: 0 });
    expect(cardPhase(closing)).toBe("closing");
    // One confirmation = one event: a second thumb does nothing.
    expect(cardGate(closing, { type: "THUMB", index: 0 })).toBe(closing);
  });

  it("READ_DONE is refused until both Momo and the practice are done (no timer shortcut)", () => {
    const s = run([{ type: "OPENED", index: 0 }]);
    expect(cardGate(s, { type: "READ_DONE", index: 0 })).toBe(s);
  });

  it("events for another card are ignored (stale events from the card before)", () => {
    const s = run([{ type: "OPENED", index: 0 }, { type: "MOMO_DONE", index: 0 }, { type: "PRACTICE_DONE", index: 0 }, { type: "READ_DONE", index: 0 }]);
    expect(cardGate(s, { type: "THUMB", index: 1 })).toBe(s);
    expect(cardGate(s, { type: "MOMO_DONE", index: 2 })).toBe(s);
  });

  it("START resets every flag for the next card", () => {
    const done = run([{ type: "OPENED", index: 0 }, { type: "MOMO_DONE", index: 0 }, { type: "PRACTICE_DONE", index: 0 }, { type: "READ_DONE", index: 0 }, { type: "THUMB", index: 0 }]);
    const next = cardGate(done, { type: "START", index: 1 });
    expect(next).toEqual({ index: 1, opened: false, momoDone: false, practiceDone: true, readDone: false, closing: false });
    expect(cardPhase(next)).toBe("opening");
  });
});
