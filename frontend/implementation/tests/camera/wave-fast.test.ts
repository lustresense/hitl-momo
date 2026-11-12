import { describe, expect, it } from "vitest";
import { WAVE_WINDOW_MS, detectWave, type WaveSample } from "@/src/camera/wave-tracker";

/** A sweep of `hz` full swings a second around x = 0.5. `phase` is where in the swing the student starts. */
function sweep(hz: number, sampleMs: number, amp: number, phase = 0, durationMs = 2000): WaveSample[] {
  const out: WaveSample[] = [];
  for (let t = 0; t <= durationMs; t += sampleMs) {
    out.push({ x: 0.5 + amp * Math.sin(2 * Math.PI * hz * (t / 1000) + phase), time: t });
  }
  return out;
}

/** Eight start phases over one full swing: the worst case is the one that starts the wave badly placed. */
const PHASES = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);

/** Slowest time to recognise a wave over all start phases (ms). Null if some phase is never recognised. */
function worstTimeToDetect(hz: number, sampleMs: number, amp: number, handSize: number): number | null {
  let worst = 0;
  for (const phase of PHASES) {
    const t = timeToDetect(sweep(hz, sampleMs, amp, phase), handSize);
    if (t === null) return null;
    worst = Math.max(worst, t);
  }
  return worst;
}

/** First moment the rule sees a wave, on a sliding window like the tracker keeps. Null when it never does. */
function timeToDetect(samples: WaveSample[], handSize?: number): number | null {
  for (let i = 0; i < samples.length; i++) {
    const now = samples[i]!.time;
    const window = samples.slice(0, i + 1).filter((s) => now - s.time <= WAVE_WINDOW_MS);
    if (detectWave(window, handSize)) return now;
  }
  return null;
}

describe("a normal wave is recognised fast (about 2 swings a second, hand size 0.3)", () => {
  it("at a 30 Hz camera: within 1.0 s of the first swing, whatever the start phase", () => {
    const t = worstTimeToDetect(2, 1000 / 30, 0.12, 0.3);
    expect(t).not.toBeNull();
    expect(t!).toBeLessThanOrEqual(1000);
  });

  it("at a 12 Hz detection rate: within 1.0 s of the first swing, whatever the start phase", () => {
    const t = worstTimeToDetect(2, 1000 / 12, 0.12, 0.3);
    expect(t).not.toBeNull();
    expect(t!).toBeLessThanOrEqual(1000);
  });

  it("a smaller sweep (amplitude 0.07, the hand moves 14 % of the frame) at 30 Hz is still recognised within 1.0 s", () => {
    // The old rule needed a span of 0.16 and never fired here; a normal wave with a small reach must count.
    expect(worstTimeToDetect(2, 1000 / 30, 0.07, 0.3)).not.toBeNull();
    // 1.0 s plus one 30 fps frame: the worst start phase lands on the bound, and float sampling adds a hair.
    expect(worstTimeToDetect(2, 1000 / 30, 0.07, 0.3)!).toBeLessThanOrEqual(1000 + 1000 / 30);
  });

  it("at 30 Hz the worst start phase is recognised in under 0.8 s", () => {
    expect(worstTimeToDetect(2, 1000 / 30, 0.12, 0.3)!).toBeLessThanOrEqual(800);
  });
});

describe("a small, quick wave still counts", () => {
  it("a far, small hand (size 0.12) with a short sweep is recognised", () => {
    expect(worstTimeToDetect(2.5, 1000 / 30, 0.05, 0.12)).not.toBeNull();
  });
});

describe("no false wave", () => {
  it("one hand moving across the frame once is not a wave", () => {
    const across: WaveSample[] = [];
    for (let t = 0; t <= 1000; t += 1000 / 30) across.push({ x: 0.1 + 0.8 * (t / 1000), time: t });
    expect(timeToDetect(across, 0.3)).toBeNull();
  });

  it("landmark jitter around one spot is not a wave", () => {
    const jitter: WaveSample[] = [];
    for (let t = 0; t <= 2000; t += 1000 / 30) {
      jitter.push({ x: 0.5 + 0.01 * Math.sin(2 * Math.PI * 9 * (t / 1000)), time: t });
    }
    expect(timeToDetect(jitter, 0.3)).toBeNull();
    expect(timeToDetect(jitter, 0.12)).toBeNull();
  });

  it("a small wiggle below the hand-size leg is not a wave", () => {
    expect(timeToDetect(sweep(2, 1000 / 30, 0.03), 0.3)).toBeNull();
  });
});
