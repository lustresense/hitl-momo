// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_SHARE,
  InferenceScheduler,
  MAX_INTERVAL_MS,
  getInferenceStats,
  pollDetection,
  resetInferenceSchedulerForTest,
} from "@/src/camera/inference-scheduler";

/** A fake main-thread clock: the scheduler reads it, and a detection moves it forward by its cost. */
function makeClock() {
  const clock = { t: 1000 };
  return { clock, now: () => clock.t };
}

function fakeVideo(currentTime = 0): HTMLVideoElement {
  return { currentTime } as HTMLVideoElement;
}

/**
 * Plays `durationMs` of camera time: each rAF step (16 ms) the camera has a new frame, and every reader polls.
 * A detection costs `costMs` on the fake clock.
 */
function simulate(
  s: InferenceScheduler,
  clock: { t: number },
  opts: { costMs: number; durationMs: number; consumers?: number; stepMs?: number },
) {
  const video = fakeVideo();
  const readers = Array.from({ length: opts.consumers ?? 1 }, () => ({}));
  const detect = vi.fn(() => {
    clock.t += opts.costMs;
    return { landmarks: [] as number[][] };
  });
  const end = clock.t + opts.durationMs;
  while (clock.t < end) {
    clock.t += opts.stepMs ?? 16;
    video.currentTime = clock.t / 1000;
    for (const r of readers) s.poll(r, video, detect);
  }
  return detect;
}

describe("InferenceScheduler: one read per camera frame", () => {
  it("a second reader of the same frame gets the first result and no second detectForVideo call", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo(1);
    const detect = vi.fn(() => ({ landmarks: [[1]] }));
    const a = {};
    const b = {};

    const first = s.poll(a, video, detect);
    const second = s.poll(b, video, detect);

    expect(detect).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    // The same reader asking again about the frame it already has gets nothing new.
    expect(s.poll(a, video, detect)).toBeNull();
  });

  it("a new frame is read again, and the reader sees the frame the camera shows now (latest wins)", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo(1);
    const seen: number[] = [];
    const detect = vi.fn(() => {
      seen.push(video.currentTime);
      return { landmarks: [] };
    });
    const r = {};
    s.poll(r, video, detect);

    clock.t += 100; // slower than any budget interval: the next frame is allowed
    video.currentTime = 2;
    s.poll(r, video, detect);

    expect(seen).toEqual([1, 2]);
  });

  it("two readers on one camera frame still cost one detection per frame over time", () => {
    const one = makeClock();
    const two = makeClock();
    const single = simulate(new InferenceScheduler({ now: one.now }), one.clock, { costMs: 5, durationMs: 1000, consumers: 1 });
    const pair = simulate(new InferenceScheduler({ now: two.now }), two.clock, { costMs: 5, durationMs: 1000, consumers: 2 });

    expect(pair.mock.calls.length).toBe(single.mock.calls.length);
  });

  it("timestamps passed to detectForVideo strictly increase, even within one millisecond", () => {
    const { now } = makeClock();
    const s = new InferenceScheduler({ now });
    const stamps: number[] = [];
    for (let i = 1; i <= 3; i++) {
      s.poll({}, fakeVideo(i), (ts) => {
        stamps.push(ts);
        return null;
      });
    }
    expect(stamps[1]!).toBeGreaterThan(stamps[0]!);
    expect(stamps[2]!).toBeGreaterThan(stamps[1]!);
  });
});

describe("InferenceScheduler: adaptive budget", () => {
  it("a 20 ms detection runs about every 57 ms (about 35% of wall time), not every frame", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const start = clock.t;
    const detect = simulate(s, clock, { costMs: 20, durationMs: 2000 });
    const elapsed = clock.t - start;
    const busy = detect.mock.calls.length * 20;

    expect(s.minIntervalMs()).toBeGreaterThan(56);
    expect(s.minIntervalMs()).toBeLessThan(58);
    const share = busy / elapsed;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThanOrEqual(BUDGET_SHARE + 0.02);
  });

  it("never waits longer than the 8 Hz floor: a 60 ms detection still runs about 8 times a second", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    simulate(s, clock, { costMs: 60, durationMs: 2000 });

    expect(s.minIntervalMs()).toBe(MAX_INTERVAL_MS);
    const stats = s.getStats();
    expect(stats.effectiveHz).toBeGreaterThanOrEqual(7);
    expect(stats.effectiveHz).toBeLessThanOrEqual(8);
  });

  it("does not add a wait beyond the floor when one detection is slower than the floor", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const detect = simulate(s, clock, { costMs: 300, durationMs: 3000 });
    // 300 ms per detection is the real limit: about 3 a second, with no artificial extra gap.
    expect(detect.mock.calls.length).toBeGreaterThanOrEqual(8);
  });

  it("adapts when the cost changes: a slow stretch lowers the rate to the floor", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    simulate(s, clock, { costMs: 5, durationMs: 1000 });
    expect(s.minIntervalMs()).toBeLessThan(20);

    simulate(s, clock, { costMs: 60, durationMs: 1000 });
    expect(s.minIntervalMs()).toBe(MAX_INTERVAL_MS);
  });

  it("a clock that went backwards does not hold the budget closed", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo(1);
    const detect = vi.fn(() => {
      clock.t += 20;
      return { landmarks: [] };
    });
    s.poll({}, video, detect);
    clock.t = 0; // e.g. a restored page or a test clock
    video.currentTime = 2;
    s.poll({}, video, detect);
    expect(detect).toHaveBeenCalledTimes(2);
  });
});

describe("InferenceScheduler: stats", () => {
  it("reports the moving average, the last duration and the detections and skipped frames", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    expect(s.getStats().avgMs).toBeNull();
    simulate(s, clock, { costMs: 20, durationMs: 1000 });
    const stats = s.getStats();
    expect(stats.avgMs).toBe(20);
    expect(stats.lastMs).toBe(20);
    expect(stats.detections).toBeGreaterThan(0);
    expect(stats.skippedFrames).toBeGreaterThan(0);
  });

  it("the module-level gate measures real detection time and feeds getInferenceStats()", () => {
    resetInferenceSchedulerForTest();
    let t = 500;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => t);
    try {
      const video = fakeVideo(1);
      pollDetection({}, video, () => {
        t += 20;
        return { landmarks: [] };
      });
      expect(getInferenceStats().avgMs).toBe(20);
      expect(getInferenceStats().detections).toBe(1);
    } finally {
      spy.mockRestore();
      resetInferenceSchedulerForTest();
    }
  });
});

describe("InferenceScheduler: failures", () => {
  it("a throwing detection propagates, is not delivered as a result, and is timed", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo(1);
    expect(() =>
      s.poll({}, video, () => {
        clock.t += 7;
        throw new Error("tracker broke");
      }),
    ).toThrow("tracker broke");
    expect(s.getStats().lastMs).toBe(7);
    expect(s.getStats().detections).toBe(0);
  });
});

afterEach(() => resetInferenceSchedulerForTest());
beforeEach(() => resetInferenceSchedulerForTest());
