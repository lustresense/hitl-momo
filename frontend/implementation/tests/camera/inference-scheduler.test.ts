// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_SHARE,
  FACE_LANE,
  HAND_LANE,
  InferenceScheduler,
  MAX_BUSY_SHARE,
  MAX_INTERVAL_MS,
  SECONDARY_MAX_WAIT_MS,
  getInferenceStats,
  pollDetection,
  resetInferenceSchedulerForTest,
  type InferenceLane,
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
  opts: { costMs: number; durationMs: number; consumers?: number; stepMs?: number; lane?: InferenceLane },
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
    for (const r of readers) s.poll(r, video, detect, opts.lane);
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

  it("the 8 Hz floor never pushes busy time above 50%: a 300 ms detection waits 600 ms before the next start", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const start = clock.t;
    const detect = simulate(s, clock, { costMs: 300, durationMs: 3000 });
    const busy = detect.mock.calls.length * 300;
    expect(s.minIntervalMs()).toBe(600);
    expect(busy / (clock.t - start)).toBeLessThanOrEqual(MAX_BUSY_SHARE + 0.01);
  });

  it("a 1000 ms detection keeps busy at or below 50% of wall time, and the timers in between still run", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const start = clock.t;
    // A 100 ms UI timer, checked on every loop step, stands in for the rest of the main thread.
    let nextTimerAt = clock.t + 100;
    let timerFires = 0;
    const video = fakeVideo();
    const detect = vi.fn(() => {
      clock.t += 1000;
      return { landmarks: [] as number[][] };
    });
    const end = clock.t + 10000;
    while (clock.t < end) {
      clock.t += 16;
      while (clock.t >= nextTimerAt) {
        timerFires++;
        nextTimerAt += 100;
      }
      video.currentTime = clock.t / 1000;
      s.poll({}, video, detect);
    }
    const elapsed = clock.t - start;
    const busy = detect.mock.calls.length * 1000;

    expect(busy / elapsed).toBeLessThanOrEqual(MAX_BUSY_SHARE + 0.02);
    expect(busy / elapsed).toBeGreaterThan(0.4);
    expect(timerFires).toBeGreaterThanOrEqual(30);
  });

  it("a single slow detection widens the gap at once, before the moving average catches up", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    simulate(s, clock, { costMs: 5, durationMs: 500 });
    clock.t += 1000; // the budget gap of the fast stretch has passed
    const video = fakeVideo(100);
    s.poll({}, video, () => {
      clock.t += 400;
      return null;
    });
    expect(s.minIntervalMs()).toBeGreaterThanOrEqual(800);
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

describe("InferenceScheduler: one budget for hand and face", () => {
  it("one camera frame gets at most one inference, whichever model asks first", () => {
    const { now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo(1);
    const hand = vi.fn(() => ({ kind: "hand" }));
    const face = vi.fn(() => ({ kind: "face" }));

    s.poll({}, video, hand, HAND_LANE);
    expect(s.poll({}, video, face, FACE_LANE)).toBeNull();

    expect(hand).toHaveBeenCalledTimes(1);
    expect(face).not.toHaveBeenCalled();
  });

  it("hand and face results never mix: each model gets the value of its own detector", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo(1);
    const hand = {};
    const face = {};

    expect(s.poll(hand, video, () => ({ kind: "hand" }), HAND_LANE)).toEqual({ kind: "hand" });
    clock.t += 1000;
    video.currentTime = 2;
    expect(s.poll(face, video, () => ({ kind: "face" }), FACE_LANE)).toEqual({ kind: "face" });
  });

  it("face looks about 4 times a second when the hand is idle", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const face = simulate(s, clock, { costMs: 5, durationMs: 2000, lane: FACE_LANE });

    expect(face.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(face.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it("face yields to a busy hand, but still gets a look at least every SECONDARY_MAX_WAIT_MS", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo();
    const handCalls = vi.fn();
    const faceStarts: number[] = [];
    const end = clock.t + 5000;

    while (clock.t < end) {
      clock.t += 16;
      video.currentTime = clock.t / 1000;
      s.poll({}, video, () => {
        clock.t += 20;
        handCalls();
        return null;
      }, HAND_LANE);
      s.poll({}, video, () => {
        faceStarts.push(clock.t);
        clock.t += 5;
        return null;
      }, FACE_LANE);
    }

    expect(faceStarts.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < faceStarts.length; i++) {
      const gap = faceStarts[i]! - faceStarts[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(SECONDARY_MAX_WAIT_MS);
      expect(gap).toBeLessThanOrEqual(SECONDARY_MAX_WAIT_MS + 100);
    }
    // The hand keeps most of its rate: the face only takes about one slot in every half second.
    expect(handCalls.mock.calls.length).toBeGreaterThanOrEqual(60);
  });

  it("a face that stops asking (model failed, no face yet) does not hold the hand back", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo();
    // The face asks once, then goes quiet for good.
    s.poll({}, fakeVideo(0.5), () => null, FACE_LANE);
    let handCalls = 0;
    const start = clock.t;
    while (clock.t < start + 3000) {
      clock.t += 16;
      video.currentTime = clock.t / 1000;
      s.poll({}, video, () => {
        handCalls++;
        clock.t += 20;
        return null;
      }, HAND_LANE);
    }
    expect(handCalls).toBeGreaterThanOrEqual(40);
  });

  it("hand and face together keep busy time at or below 50%, even with a slow face", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    const video = fakeVideo();
    let handCount = 0;
    let faceCount = 0;
    const start = clock.t;
    const end = clock.t + 10000;

    while (clock.t < end) {
      clock.t += 16;
      video.currentTime = clock.t / 1000;
      s.poll({}, video, () => {
        handCount++;
        clock.t += 20;
        return null;
      }, HAND_LANE);
      s.poll({}, video, () => {
        faceCount++;
        clock.t += 300;
        return null;
      }, FACE_LANE);
    }

    const busy = handCount * 20 + faceCount * 300;
    expect(faceCount).toBeGreaterThan(0);
    expect(busy / (clock.t - start)).toBeLessThanOrEqual(MAX_BUSY_SHARE + 0.02);
  });

  it("reports per-model stats next to the totals, and busy share of the last second", () => {
    const { clock, now } = makeClock();
    const s = new InferenceScheduler({ now });
    s.poll({}, fakeVideo(1), () => {
      clock.t += 20;
      return null;
    }, HAND_LANE); // starts at 1000 ms
    clock.t = 1500;
    s.poll({}, fakeVideo(2), () => {
      clock.t += 10;
      return null;
    }, FACE_LANE);

    const stats = s.getStats();
    expect(stats.detections).toBe(2);
    expect(stats.avgMs).toBe(15);
    expect(stats.models.hand).toMatchObject({ detections: 1, avgMs: 20, lastMs: 20, effectiveHz: 1 });
    expect(stats.models.face).toMatchObject({ detections: 1, avgMs: 10, lastMs: 10, effectiveHz: 1 });
    expect(stats.busyShare).toBeCloseTo(0.03, 5);
  });

  it("per-model stats are zero before the first detection of that model", () => {
    const { now } = makeClock();
    const s = new InferenceScheduler({ now });
    const stats = s.getStats();
    expect(stats.models.hand).toEqual({ detections: 0, avgMs: null, lastMs: null, effectiveHz: 0 });
    expect(stats.models.face).toEqual({ detections: 0, avgMs: null, lastMs: null, effectiveHz: 0 });
    expect(stats.busyShare).toBe(0);
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
