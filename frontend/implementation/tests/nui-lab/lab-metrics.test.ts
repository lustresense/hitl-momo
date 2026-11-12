import { describe, expect, it } from "vitest";
import {
  LAB_STILL_SPAN,
  WaveLabSampler,
  isStill,
  jitterStdDevPx,
  percentile,
} from "@/src/components/nui-lab/lab-metrics";

describe("percentile (nearest rank)", () => {
  it("gives p50 and p95 of 1..20", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 95)).toBe(19);
  });

  it("does not reorder the caller's array", () => {
    const values = [9, 1, 5];
    percentile(values, 50);
    expect(values).toEqual([9, 1, 5]);
  });

  it("returns null with no samples and the value itself with one", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
  });
});

describe("jitterStdDevPx", () => {
  it("is zero for a point that never moves", () => {
    const still = Array.from({ length: 10 }, () => ({ x: 0.4, y: 0.6 }));
    expect(jitterStdDevPx(still, 400)).toBeCloseTo(0, 9);
  });

  it("converts the normalised spread into pixels of a 400 px canvas", () => {
    // x alternates 0.49 / 0.51: std dev 0.01 of the frame = 4 px; y does not move.
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i % 2 === 0 ? 0.49 : 0.51, y: 0.5 }));
    expect(jitterStdDevPx(pts, 400)).toBeCloseTo(4, 6);
  });

  it("needs at least two points", () => {
    expect(jitterStdDevPx([{ x: 0.5, y: 0.5 }], 400)).toBeNull();
  });
});

describe("isStill", () => {
  it("accepts a hand that only tremors within the still span", () => {
    // Bounded pseudo-tremor, amplitude 0.003 of the frame (the NUI-2 synthetic noise level).
    const pts = Array.from({ length: 60 }, (_, i) => ({
      x: 0.5 + 0.003 * Math.sin(i * 1.7),
      y: 0.5 + 0.003 * Math.cos(i * 2.3),
    }));
    expect(isStill(pts, LAB_STILL_SPAN)).toBe(true);
  });

  it("rejects a hand that is moving", () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ x: 0.2 + i * 0.01, y: 0.5 }));
    expect(isStill(pts, LAB_STILL_SPAN)).toBe(false);
  });
});

describe("WaveLabSampler", () => {
  /** A left-right-left sweep of the wrist, one sample every 33 ms, starting at t0. */
  function feedSweep(sampler: WaveLabSampler, t0: number, frames: number): number | null {
    let detectedAt: number | null = null;
    for (let i = 0; i < frames; i++) {
      const t = t0 + i * 33;
      const x = 0.5 + 0.3 * Math.sin((2 * Math.PI * i * 33) / 800);
      sampler.feed({ x, y: 0.5 }, t);
      if (sampler.detected && detectedAt === null) detectedAt = t;
    }
    return detectedAt;
  }

  it("detects a sweep and reports the time from the first movement to detection", () => {
    const sampler = new WaveLabSampler();
    // Still for half a second first: the movement clock must not start before the hand moves.
    for (let i = 0; i < 15; i++) sampler.feed({ x: 0.5, y: 0.5 }, 1000 + i * 33);
    expect(sampler.movedAtMs).toBeNull();
    const detectedAt = feedSweep(sampler, 1500, 90);
    expect(detectedAt).not.toBeNull();
    expect(sampler.movedAtMs).not.toBeNull();
    expect(sampler.movedAtMs!).toBeGreaterThanOrEqual(1500);
    expect(sampler.elapsedMs).toBe(detectedAt! - sampler.movedAtMs!);
    expect(sampler.progress).toBe(1);
  });

  it("never detects a still hand", () => {
    const sampler = new WaveLabSampler();
    for (let i = 0; i < 120; i++) sampler.feed({ x: 0.5, y: 0.5 }, i * 33);
    expect(sampler.detected).toBe(false);
    expect(sampler.progress).toBe(0);
    expect(sampler.elapsedMs).toBeNull();
  });

  it("keeps the sweep across a short gap and restarts after a long one", () => {
    const sampler = new WaveLabSampler();
    // Part of one swing: some progress, but not yet a wave (a full sweep would freeze the sampler).
    feedSweep(sampler, 0, 20);
    const before = sampler.progress;
    expect(sampler.detected).toBe(false);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    sampler.feed(null, 1400);
    sampler.feed(null, 1433);
    expect(sampler.progress).toBeGreaterThanOrEqual(before - 0.01);
    for (let i = 0; i < 6; i++) sampler.feed(null, 500 + i * 33);
    expect(sampler.progress).toBe(0);
  });

  it("reset starts a new test from nothing", () => {
    const sampler = new WaveLabSampler();
    feedSweep(sampler, 0, 90);
    expect(sampler.detected).toBe(true);
    sampler.reset();
    expect(sampler.detected).toBe(false);
    expect(sampler.movedAtMs).toBeNull();
    expect(sampler.progress).toBe(0);
  });
});
