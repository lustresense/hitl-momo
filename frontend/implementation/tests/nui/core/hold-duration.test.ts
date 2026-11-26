import { describe, expect, it } from "vitest";
import { HOLD_MS_DECISION, HOLD_MS_DEFAULT, HOLD_MS_PLACE, holdMs } from "@/src/nui/core";

describe("holdMs (port msFor hand.js:215)", () => {
  it("returns 2000 ms for all decision prefixes regardless of requested ms", () => {
    expect(holdMs("Tebak Gambarku")).toBe(HOLD_MS_DECISION);
    expect(holdMs("Tebak Gambarku", 500)).toBe(2000);
    expect(holdMs("Tebak Gambarku sekarang")).toBe(2000);
    expect(holdMs("Kembali ke sampul")).toBe(2000);
    expect(holdMs("Kembali ke sampul", 400)).toBe(2000);
    expect(holdMs("Ya,")).toBe(2000);
    expect(holdMs("Ya, itu namaku")).toBe(2000);
    expect(holdMs("Ya, itu namaku", 800)).toBe(2000);
  });

  it("returns 1500 ms for the placement prefix regardless of requested ms", () => {
    expect(holdMs("Taruh di sini")).toBe(HOLD_MS_PLACE);
    expect(holdMs("Taruh di sini", 500)).toBe(1500);
    expect(holdMs("Taruh di sini aja", 2000)).toBe(1500);
  });

  it("clamps sticker ring labels (Lempar / Gambar lagi) with 2000 ms down to effective 1000 ms", () => {
    // PLAN Lampiran E butir 6: stamp.js opens "Lempar" & "Gambar lagi" with 2000, msFor outputs 1000.
    expect(holdMs("Lempar", 2000)).toBe(1000);
    expect(holdMs("Gambar lagi", 2000)).toBe(1000);
    expect(holdMs("Ayo", 2000)).toBe(1000);
    expect(holdMs("Lanjut", 1000)).toBe(1000);
  });

  it("preserves explicit ms strictly between 0 and 1000 for non-prefix labels", () => {
    expect(holdMs("Lanjut", 600)).toBe(600);
    expect(holdMs("Cepat", 999)).toBe(999);
    expect(holdMs("", 450)).toBe(450);
  });

  it("falls back to 1000 ms for missing, zero, negative, or non-finite ms", () => {
    expect(holdMs()).toBe(HOLD_MS_DEFAULT);
    expect(holdMs(null)).toBe(1000);
    expect(holdMs(undefined, 0)).toBe(1000);
    expect(holdMs("Ulangi", -200)).toBe(1000);
    expect(holdMs("Ulangi", Number.NaN)).toBe(1000);
    expect(holdMs("Ulangi", Number.POSITIVE_INFINITY)).toBe(1000);
  });

  it("requires prefixes to match at the start of the label only", () => {
    expect(holdMs("Coba Tebak Gambarku", 2000)).toBe(1000);
    expect(holdMs("Ayo Taruh di sini", 1500)).toBe(1000);
    expect(holdMs("Oke Ya, lanjut", 2000)).toBe(1000);
  });
});
