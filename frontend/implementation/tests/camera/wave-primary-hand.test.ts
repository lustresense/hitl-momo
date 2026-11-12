// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WaveTracker } from "@/src/camera/wave-tracker";
import type { Landmark } from "@/src/input/types";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
let nextId: number;
let now: number;

function step() {
  const q = rafQueue.splice(0);
  for (const f of q) f.cb(now);
}
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A 21-point hand centred on cx with the wrist at index 0 (a real MediaPipe hand has 21 points). */
function hand(cx: number, cy: number, size: number): Landmark[] {
  const pts: Landmark[] = [];
  for (let i = 0; i < 21; i++) pts.push({ x: cx - size / 2 + (size * (i % 5)) / 4, y: cy - size / 2 + (size * Math.floor(i / 5)) / 4 });
  pts[0] = { x: cx, y: cy + size / 2 };
  return pts;
}

beforeEach(() => {
  vi.clearAllMocks();
  rafQueue = [];
  nextId = 1;
  now = 1000;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
});

afterEach(() => vi.restoreAllMocks());

/**
 * Runs the tracker over `frames` (what MediaPipe reports per video frame), one video frame and one rAF step each,
 * 100 ms apart. currentTime starts at -1 so the loop's first call (before any frame) detects nothing.
 */
async function run(frames: Landmark[][][]) {
  const v = { readyState: 4, currentTime: -1 } as HTMLVideoElement;
  let i = 0;
  const lm = {
    detectForVideo: vi.fn(() => ({ landmarks: frames[Math.min(i, frames.length - 1)] ?? [] })),
    close: vi.fn(),
  };
  vi.mocked(HandLandmarker.createFromOptions).mockResolvedValue(lm as never);
  const onWave = vi.fn();
  const tracker = new WaveTracker({ getVideo: () => v, modelUrl: () => "/m", onWave });
  await tracker.start();
  for (i = 0; i < frames.length; i++) {
    now += 100;
    (v as { currentTime: number }).currentTime = i;
    step();
  }
  return { tracker, onWave };
}

/** The player's wrist sweeping left-right-left-right and back to the start. */
const SWEEP = [0.5, 0.42, 0.34, 0.42, 0.5, 0.58, 0.66, 0.58, 0.5];

describe("WaveTracker reads only the primary hand", () => {
  it("a wave from the player's hand completes while a distractor hand moves randomly", async () => {
    const distractorX = [0.08, 0.14, 0.06, 0.12, 0.09, 0.15, 0.07, 0.13, 0.1];
    // The distractor is listed FIRST, so a tracker that reads landmarks[0] would follow it.
    const frames = SWEEP.map((x, i) => [hand(distractorX[i]!, 0.3, 0.35), hand(x, 0.5, 0.4)]);
    const { onWave } = await run(frames);
    expect(onWave).toHaveBeenCalledTimes(1);
  });

  it("a distractor-only wave does not count while the locked hand is still", async () => {
    const still = hand(0.5, 0.5, 0.4);
    const distractorX = [0.1, 0.2, 0.05, 0.25, 0.1, 0.2, 0.05, 0.25, 0.1];
    const frames = distractorX.map((x) => [hand(x, 0.3, 0.35), still]);
    const { onWave } = await run(frames);
    expect(onWave).not.toHaveBeenCalled();
  });

  it("a far-away person's sweeping hand (below MIN_HAND_SIZE) never counts as a wave", async () => {
    const frames = SWEEP.map((x) => [hand(x, 0.2, 0.04)]);
    const { onWave, tracker } = await run(frames);
    expect(onWave).not.toHaveBeenCalled();
    expect(tracker.progress).toBe(0);
  });
});
