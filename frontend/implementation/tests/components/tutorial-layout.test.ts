import { describe, expect, it } from "vitest";
import { tutorialLayout } from "@/src/components/onboarding/tutorial-layout";
import { TUTORIAL_TIMING } from "@/src/components/onboarding/tutorial-timing";

const SIZES: Array<[number, number]> = [
  [1280, 720],
  [1920, 1080],
  [1024, 600],
  [390, 844],
  [2560, 1440],
];

describe("tutorial brochure layout (R4 size and bottom margin)", () => {
  it.each(SIZES)("%i x %i: book size is in range and the bottom 22%% stays free", (vw, vh) => {
    const l = tutorialLayout(vw, vh);
    expect(l.gw).toBeGreaterThanOrEqual(320);
    expect(l.gw).toBeLessThanOrEqual(480);
    expect(l.pw / l.gw).toBeCloseTo(1.6, 1);
    expect(l.oh).toBeGreaterThanOrEqual(480);
    expect(l.oh).toBeLessThanOrEqual(720);
    // The open book (scaled by fit, centred at cy) ends above the bottom 22% where the camera and Momo sit.
    const bottom = l.cy + (l.oh * l.fit) / 2;
    expect(bottom).toBeLessThanOrEqual(vh * 0.78 + 0.5);
    const top = l.cy - (l.oh * l.fit) / 2;
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it("the resting row sits in the bottom band, centred between the camera and Momo", () => {
    const l = tutorialLayout(1280, 720);
    const rowCentre = 720 - 720 * 0.11; // middle of the bottom 22%
    expect(l.cy + l.miniY).toBeCloseTo(rowCentre, 0);
    expect(l.miniGap).toBeLessThanOrEqual(80);
  });

  it("the book never runs wider than the viewport", () => {
    for (const [vw, vh] of SIZES) {
      const l = tutorialLayout(vw, vh);
      expect((l.gw + l.pw) * l.fit).toBeLessThanOrEqual(vw * 0.94 + 0.5);
    }
  });

  it("timings are the 9f9d35d values (deal, open, flip, bifold) and close in 1.0 s with a 1.1 s pause", () => {
    expect(TUTORIAL_TIMING.deal.duration).toBe(0.95);
    expect(TUTORIAL_TIMING.deal.stagger).toBe(0.13);
    expect(TUTORIAL_TIMING.open.toCentre).toBe(0.95);
    expect(TUTORIAL_TIMING.open.flip).toBe(0.95);
    expect(TUTORIAL_TIMING.open.bifold).toBe(0.8);
    expect(TUTORIAL_TIMING.open.bifoldAt).toBe(0.88);
    expect(TUTORIAL_TIMING.close.duration).toBe(1.0);
    expect(TUTORIAL_TIMING.close.ease).toBe("power2.out");
    expect(TUTORIAL_TIMING.pause).toBe(1.1);
  });
});
