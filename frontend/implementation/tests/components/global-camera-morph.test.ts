// @vitest-environment jsdom
/**
 * I1: the cover card -> PIP morph keeps the video undistorted. The morph is one uniform scale plus a bottom crop to the
 * PIP's 5:4 ratio, so the visible part of the card lands exactly on the PIP box.
 */
import { describe, expect, it } from "vitest";
import { pipMorph } from "@/src/components/camera/GlobalCamera";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("pipMorph (cover card -> bottom-left PIP, I1)", () => {
  it("desktop: a 320 x 300 cover card lands on the 150 x 120 PIP with one scale and a 44 px bottom crop", () => {
    const from = rect(100, 100, 320, 300);
    const to = rect(24, 624, 150, 120);
    const m = pipMorph(from, to);
    expect(m.scale).toBeCloseTo(150 / 320, 9);
    expect(m.cutBottom).toBeCloseTo(300 - 320 * 0.8, 9);
    expect(m.x).toBeCloseTo(24 - 100, 9);
    expect(m.y).toBeCloseTo(624 - 100, 9);
    // The visible part (top, 256 px) scaled equals the PIP box in both directions.
    expect((300 - m.cutBottom) * m.scale).toBeCloseTo(120, 9);
    expect(320 * m.scale).toBeCloseTo(150, 9);
  });

  it("phone: a 318 x 300 card lands on the 125 x 100 PIP", () => {
    const from = rect(16, 100, 318, 300);
    const to = rect(12, 756, 125, 100);
    const m = pipMorph(from, to);
    expect(m.scale).toBeCloseTo(125 / 318, 9);
    expect((300 - m.cutBottom) * m.scale).toBeCloseTo(100, 9);
  });

  it("a card that is already shorter than 5:4 is not cropped (it is scaled uniformly, never stretched)", () => {
    const m = pipMorph(rect(0, 0, 320, 200), rect(24, 624, 150, 120));
    expect(m.cutBottom).toBe(0);
    expect(m.scale).toBeCloseTo(150 / 320, 9);
  });
});
