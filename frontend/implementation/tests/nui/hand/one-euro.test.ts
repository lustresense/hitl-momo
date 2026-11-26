import { describe, expect, it } from "vitest";
import { OneEuro1D, oneEuroAlpha, type OneEuroParams } from "@/src/nui/sources/hand";

const R1_NORMAL: OneEuroParams = { minCutoff: 1.0, beta: 0.01, dCutoff: 1.0, maxGapMs: 500 };

describe("oneEuroAlpha", () => {
  it("matches Casiez et al. (2012) formula and stays strictly in (0, 1)", () => {
    const dt = 1 / 30;
    const fc = 1.0;
    const tau = 1 / (2 * Math.PI * fc);
    const expected = 1 / (1 + tau / dt);
    expect(oneEuroAlpha(fc, dt)).toBeCloseTo(expected, 10);
    expect(oneEuroAlpha(0.1, 0.001)).toBeGreaterThan(0);
    expect(oneEuroAlpha(100, 1.0)).toBeLessThan(1);
  });

  it("increases monotonically with cutoff frequency and dt", () => {
    expect(oneEuroAlpha(2.0, 0.033)).toBeGreaterThan(oneEuroAlpha(1.0, 0.033));
    expect(oneEuroAlpha(1.0, 0.14)).toBeGreaterThan(oneEuroAlpha(1.0, 0.033));
  });

  it("clamps zero or negative cutoff/dt safely without NaN", () => {
    const a = oneEuroAlpha(0, 0);
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});

describe("OneEuro1D", () => {
  it("returns exact value on first sample and tracks positive/negative steps without overshoot", () => {
    const f = new OneEuro1D({ ...R1_NORMAL });
    expect(f.filter(100, 0)).toBe(100);

    let prev = 100;
    for (let i = 1; i <= 40; i++) {
      const y = f.filter(600, i * 33);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeLessThanOrEqual(600);
      prev = y;
    }
    expect(prev).toBeGreaterThan(595);

    // Negative step: monotonic descent, zero undershoot
    for (let i = 41; i <= 80; i++) {
      const y = f.filter(100, i * 33);
      expect(y).toBeLessThanOrEqual(prev);
      expect(y).toBeGreaterThanOrEqual(100);
      prev = y;
    }
    expect(prev).toBeLessThan(105);
  });

  it("attenuates stationary high-frequency jitter", () => {
    const f = new OneEuro1D({ ...R1_NORMAL });
    f.filter(500, 0);
    let maxDev = 0;
    for (let i = 1; i <= 60; i++) {
      const raw = 500 + (i % 2 === 0 ? 5 : -5);
      const y = f.filter(raw, i * 33);
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(y - 500));
    }
    expect(maxDev).toBeLessThan(2.5);
  });

  it("uses real monotonic dt (not assumed fps) and ignores duplicate/backward timestamps", () => {
    const fastDt = new OneEuro1D({ ...R1_NORMAL });
    const slowDt = new OneEuro1D({ ...R1_NORMAL });
    fastDt.filter(0, 1000);
    slowDt.filter(0, 1000);

    const yFast = fastDt.filter(200, 1016); // 16 ms
    const ySlow = slowDt.filter(200, 1140); // 140 ms
    expect(ySlow).toBeGreaterThan(yFast);

    // Duplicate and backward timestamps return previous filtered output cleanly
    expect(fastDt.filter(999, 1016)).toBe(yFast);
    expect(fastDt.filter(999, 900)).toBe(yFast);
    // Next forward timestamp continues from last monotonic timestamp (1016)
    const yNext = fastDt.filter(200, 1049);
    expect(yNext).toBeGreaterThan(yFast);
    expect(yNext).toBeLessThanOrEqual(200);
  });

  it("resets on gaps > maxGapMs, preserves continuity at === maxGapMs, and resets on non-finite input", () => {
    const f = new OneEuro1D({ ...R1_NORMAL });
    f.filter(100, 0);
    // Exact boundary 500 ms does NOT reset
    const atBoundary = f.filter(500, 500);
    expect(atBoundary).toBeGreaterThan(100);
    expect(atBoundary).toBeLessThan(500);

    // Gap 501 ms > maxGapMs resets cleanly to raw value
    expect(f.filter(900, 1001)).toBe(900);

    // Explicit reset snaps next sample
    f.filter(950, 1034);
    f.reset();
    expect(f.filter(50, 1067)).toBe(50);

    // Non-finite value or timestamp resets state
    expect(Number.isNaN(f.filter(Number.NaN, 1100))).toBe(true);
    expect(f.filter(300, 1133)).toBe(300);
    expect(f.filter(400, Number.POSITIVE_INFINITY)).toBe(400);
    expect(f.filter(700, 1166)).toBe(700);
  });

  it("tracks faster during rapid motion when beta switches from 0.01 (normal) to 0.05 (pinch)", () => {
    const normal = new OneEuro1D({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0, maxGapMs: 500 });
    const pinch = new OneEuro1D({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0, maxGapMs: 500 });
    normal.filter(100, 0);
    pinch.filter(100, 0);

    // Switch beta dynamically at pinch onset without resetting
    pinch.params.beta = 0.05;

    let yNormal = 100;
    let yPinch = 100;
    for (let i = 1; i <= 5; i++) {
      const target = 100 + i * 80;
      yNormal = normal.filter(target, i * 33);
      yPinch = pinch.filter(target, i * 33);
    }
    expect(yPinch).toBeGreaterThan(yNormal);
    expect(yPinch).toBeLessThanOrEqual(500);
  });
});
