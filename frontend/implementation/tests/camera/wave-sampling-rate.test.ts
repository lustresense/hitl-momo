import { describe, expect, it } from "vitest";
import { WAVE_MIN_SAMPLES, WAVE_WINDOW_MS, detectWave, type WaveSample } from "@/src/camera/wave-tracker";
import { MAX_INTERVAL_MS } from "@/src/camera/inference-scheduler";

/**
 * The scheduler may run wave detections as slowly as 8 a second. The wave rule must still see a real wave in the
 * window at that rate, because its timing comes from real timestamps and not from a frame count.
 */
function waveSamples(hz: number, sampleMs: number, windowMs = WAVE_WINDOW_MS): WaveSample[] {
  // A calm left-right wave: 2 swings a second, 0.12 either side of the middle of the frame.
  const out: WaveSample[] = [];
  for (let t = 0; t <= windowMs; t += sampleMs) {
    out.push({ x: 0.5 + 0.12 * Math.sin(2 * Math.PI * hz * (t / 1000)), time: t });
  }
  return out;
}

describe("wave rule at the scheduler's detection floor", () => {
  it("the window holds at least WAVE_MIN_SAMPLES samples at the slowest allowed detection rate", () => {
    expect(Math.floor(WAVE_WINDOW_MS / MAX_INTERVAL_MS) + 1).toBeGreaterThanOrEqual(WAVE_MIN_SAMPLES);
  });

  it("a real wave is recognised when the detections come every 125 ms (8 Hz)", () => {
    expect(detectWave(waveSamples(2, MAX_INTERVAL_MS))).toBe(true);
  });

  it("a real wave is recognised at a faster camera rate too (about 15 Hz)", () => {
    expect(detectWave(waveSamples(2, 1000 / 15))).toBe(true);
  });

  it("a single slow lean is still not a wave at 8 Hz", () => {
    const lean: WaveSample[] = [];
    for (let t = 0; t <= WAVE_WINDOW_MS; t += MAX_INTERVAL_MS) {
      lean.push({ x: 0.2 + (0.6 * t) / WAVE_WINDOW_MS, time: t });
    }
    expect(detectWave(lean)).toBe(false);
  });
});
