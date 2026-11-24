import { describe, expect, it } from "vitest";
import {
  buildGuidedCaptureSteps,
  isGuidedCaptureFrameMasked,
  GUIDED_MASK_START_MS,
  GUIDED_MASK_END_MS,
} from "../../src/components/nui-lab/bench/guided-capture-protocol";

describe("Guided Capture Protocol - T26 p2-mini", () => {
  it("builds p2-mini with exactly 19 steps and 138s total action duration", () => {
    const steps = buildGuidedCaptureSteps("p2-mini");
    expect(steps).toHaveLength(19);

    const totalMs = steps.reduce((acc, step) => acc + step.durationMs, 0);
    expect(totalMs).toBe(138_000);

    // Verify 14 static steps (7 classes * 2 variations) + 1 NO_HAND + 4 transition drills
    const staticSteps = steps.filter((s) => s.phase === "static");
    const transitionSteps = steps.filter((s) => s.phase === "transition");

    expect(staticSteps).toHaveLength(15);
    expect(transitionSteps).toHaveLength(4);

    // Verify classes included in static
    const labels = staticSteps.map((s) => s.truthLabel);
    expect(labels).toContain("FIST");
    expect(labels).toContain("PINCH_CLOSED");
    expect(labels).toContain("PINCH_OK");
    expect(labels).toContain("THREE_IMR");
    expect(labels).toContain("ONE");
    expect(labels).toContain("TWO");
    expect(labels).toContain("FIVE");
    expect(labels).toContain("NO_HAND");

    // Verify transition drills
    const drillLabels = transitionSteps.map((s) => s.truthLabel);
    expect(drillLabels).toEqual([
      "TRANSITION_FIST_ONE",
      "TRANSITION_FIST_TWO",
      "TRANSITION_OPEN_PINCH_CLOSED_OPEN",
      "TRANSITION_PINCH_OK_FIVE",
    ]);
  });

  it("leaves p1-full and p2-short protocols unchanged", () => {
    const p1Steps = buildGuidedCaptureSteps("p1-full");
    const p2ShortSteps = buildGuidedCaptureSteps("p2-short");

    expect(p1Steps).toHaveLength(100);
    expect(p2ShortSteps).toHaveLength(41);
  });

  it("applies 700ms start and 300ms end masking", () => {
    const duration = 6000;
    expect(isGuidedCaptureFrameMasked(0, duration)).toBe(true);
    expect(isGuidedCaptureFrameMasked(GUIDED_MASK_START_MS - 1, duration)).toBe(true);
    expect(isGuidedCaptureFrameMasked(GUIDED_MASK_START_MS, duration)).toBe(false);
    expect(isGuidedCaptureFrameMasked(3000, duration)).toBe(false);
    expect(isGuidedCaptureFrameMasked(duration - GUIDED_MASK_END_MS, duration)).toBe(true);
    expect(isGuidedCaptureFrameMasked(duration - GUIDED_MASK_END_MS + 1, duration)).toBe(true);
  });
});
