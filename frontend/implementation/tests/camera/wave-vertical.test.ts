import { describe, expect, it } from "vitest";
import { detectWave, waveProgress, type WaveSample } from "@/src/camera/wave-tracker";

describe("vertical waving / greeting (nurunin tangan, terus naikin lagi)", () => {
  it("detects a natural greeting gesture: hand lowers then raises back up", () => {
    // Hand at chest/face level, dips down 0.22 units and rises back up
    const samples: WaveSample[] = [
      { x: 0.5, y: 0.30, time: 0 },
      { x: 0.5, y: 0.36, time: 50 },
      { x: 0.5, y: 0.44, time: 100 },
      { x: 0.5, y: 0.52, time: 150 },
      { x: 0.5, y: 0.52, time: 200 },
      { x: 0.5, y: 0.44, time: 250 },
      { x: 0.5, y: 0.36, time: 300 },
      { x: 0.5, y: 0.30, time: 350 },
    ];
    expect(detectWave(samples, 0.3)).toBe(true);
    expect(waveProgress(samples, 0.3)).toBe(1);
  });

  it("detects a hand raised then lowered", () => {
    const samples: WaveSample[] = [
      { x: 0.5, y: 0.55, time: 0 },
      { x: 0.5, y: 0.48, time: 50 },
      { x: 0.5, y: 0.38, time: 100 },
      { x: 0.5, y: 0.32, time: 150 },
      { x: 0.5, y: 0.32, time: 200 },
      { x: 0.5, y: 0.40, time: 250 },
      { x: 0.5, y: 0.48, time: 300 },
      { x: 0.5, y: 0.55, time: 350 },
    ];
    expect(detectWave(samples, 0.3)).toBe(true);
    expect(waveProgress(samples, 0.3)).toBe(1);
  });

  it("does not trigger on a one-way vertical motion (only lowering without raising)", () => {
    const samples: WaveSample[] = [
      { x: 0.5, y: 0.30, time: 0 },
      { x: 0.5, y: 0.36, time: 50 },
      { x: 0.5, y: 0.42, time: 100 },
      { x: 0.5, y: 0.48, time: 150 },
      { x: 0.5, y: 0.54, time: 200 },
      { x: 0.5, y: 0.60, time: 250 },
    ];
    expect(detectWave(samples, 0.3)).toBe(false);
    expect(waveProgress(samples, 0.3)).toBeLessThan(1);
  });
});
