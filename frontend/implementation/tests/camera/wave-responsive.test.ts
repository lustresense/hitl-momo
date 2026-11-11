// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WaveTracker, detectWave, waveProgress, type WaveSample } from "@/src/camera/wave-tracker";
import { handAt } from "./hand-points";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
let nextId: number;
let now: number;
const cancelled = new Set<number>();
function step() {
  const q = rafQueue.splice(0);
  for (const f of q) if (!cancelled.has(f.id)) f.cb(now);
}

beforeEach(() => {
  vi.clearAllMocks();
  rafQueue = [];
  nextId = 1;
  now = 1000;
  cancelled.clear();
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
    cancelled.add(id as number);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

/** A blurred wave: a smaller sweep (0.17) with two swings, 100 ms apart, 7 samples. Old rule (0.22, 8 samples) refused it. */
const BLURRED = [0.5, 0.33, 0.5, 0.67, 0.5, 0.36, 0.5];
const samplesOf = (xs: number[]): WaveSample[] => xs.map((x, i) => ({ x, time: i * 100 }));

describe("calibrated wave rule (blur-tolerant)", () => {
  it("accepts a blurred wave of 0.17 span with two swings and 7 samples", () => {
    expect(detectWave(samplesOf(BLURRED))).toBe(true);
  });

  it("still refuses a single out-and-back (no second swing)", () => {
    expect(detectWave(samplesOf([0.5, 0.7, 0.5, 0.52, 0.5, 0.5, 0.5]))).toBe(false);
  });

  it("still refuses a one-way slide", () => {
    expect(detectWave(samplesOf([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]))).toBe(false);
  });

  it("a wave that ends far from where it started is not a wave yet", () => {
    expect(detectWave(samplesOf([0.2, 0.35, 0.2, 0.35, 0.2, 0.35, 0.8]))).toBe(false);
  });
});

describe("waveProgress (0..1 for the ring)", () => {
  it("is 0 without samples and reaches 1 exactly when the wave rule is met", () => {
    expect(waveProgress([])).toBe(0);
    expect(waveProgress(samplesOf(BLURRED))).toBe(1);
  });

  it("grows with the sweep and the swings, and never leaves 0..1", () => {
    const half = waveProgress(samplesOf([0.5, 0.4, 0.5, 0.45]));
    const more = waveProgress(samplesOf([0.5, 0.4, 0.5, 0.6, 0.5]));
    expect(half).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(half);
    expect(more).toBeLessThanOrEqual(1);
    expect(waveProgress(samplesOf([0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9]))).toBe(1);
  });
});

describe("WaveTracker tolerates short tracking gaps and reports progress", () => {
  function setup(frames: Array<number | null>) {
    let i = 0;
    const lm = {
      detectForVideo: vi.fn(() => {
        const x = frames[i++ % frames.length];
        return { landmarks: x === null || x === undefined ? [] : [handAt(x)] };
      }),
      close: vi.fn(),
    };
    vi.mocked(HandLandmarker.createFromOptions).mockResolvedValue(lm as never);
    const v = { readyState: 4, currentTime: -1 } as HTMLVideoElement;
    const onWave = vi.fn();
    const tracker = new WaveTracker({ getVideo: () => v, modelUrl: () => "/m", onWave });
    return { tracker, v, onWave, lm };
  }

  async function run(tracker: WaveTracker, v: HTMLVideoElement, n: number) {
    for (let k = 1; k <= n; k++) {
      (v as { currentTime: number }).currentTime = (v.currentTime ?? 0) + 1;
      now += 100;
      step();
    }
  }

  it("one to three dropped frames inside a wave keep the progress and the wave", async () => {
    // Wave with a 2-frame and a 3-frame blink in the middle: the sweep must still count.
    const { tracker, v, onWave } = setup([0.5, 0.33, null, null, 0.5, 0.67, 0.5, null, null, null, 0.36, 0.5]);
    await tracker.start();
    await run(tracker, v, 12);
    expect(onWave).toHaveBeenCalledTimes(1);
    tracker.stop();
  });

  it("four missing frames in a row reset the progress to zero", async () => {
    const { tracker, v } = setup([0.5, 0.33, 0.5, 0.67, null, null, null, null]);
    await tracker.start();
    const seen: number[] = [];
    tracker.subscribeProgress((p) => seen.push(p));
    await run(tracker, v, 8);
    expect(seen.at(-1)).toBe(0);
    tracker.stop();
  });

  it("subscribeProgress reports changes, replays the current value, and stop() sets 0", async () => {
    const { tracker, v } = setup([0.5, 0.4, 0.5, 0.6]);
    await tracker.start();
    const seen: number[] = [];
    const unsub = tracker.subscribeProgress((p) => seen.push(p));
    expect(seen[0]).toBe(0);
    await run(tracker, v, 4);
    expect(seen.some((p) => p > 0 && p < 1)).toBe(true);
    unsub();
    tracker.stop();
    expect(tracker.progress).toBe(0);
  });
});
