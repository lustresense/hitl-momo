// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WaveSweep, WaveTracker, type WaveTrackerOptions } from "@/src/camera/wave-tracker";
import type { FaceBox } from "@/src/camera/face-anchor";
import { resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";
import { WaveLabSampler } from "@/src/components/nui-lab/lab-metrics";
import { handSize } from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";
import { handAt } from "../camera/hand-points";

describe("WaveSweep: the one wave rule", () => {
  /** A wrist swinging left and right, one sample every 33 ms. */
  const swing = (i: number, amp = 0.3) => ({ x: 0.5 + amp * Math.sin((2 * Math.PI * i * 33) / 800), y: 0.5 });

  it("reports progress, swings and detection per frame, and detects a full sweep", () => {
    const sweep = new WaveSweep();
    let detectedAt = -1;
    for (let i = 0; i < 90; i++) {
      const step = sweep.feed(swing(i), i * 33);
      expect(step.progress).toBeGreaterThanOrEqual(0);
      expect(step.progress).toBeLessThanOrEqual(1);
      if (step.detected && detectedAt < 0) detectedAt = i;
    }
    expect(detectedAt).toBeGreaterThan(0);
  });

  it("keeps the sweep across a short gap and restarts after a long one", () => {
    const sweep = new WaveSweep();
    for (let i = 0; i < 20; i++) sweep.feed(swing(i), i * 33);
    const before = sweep.feed(null, 20 * 33).progress;
    expect(before).toBeGreaterThan(0);
    expect(sweep.feed(null, 21 * 33).progress).toBe(before);
    let last = { progress: before, swings: 0, detected: false };
    for (let i = 0; i < 6; i++) last = sweep.feed(null, 500 + i * 33);
    expect(last.progress).toBe(0);
    expect(last.swings).toBe(0);
  });

  it("restarts when the face moves sideways (a head turn), using the face as the reference", () => {
    const sweep = new WaveSweep();
    const face: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };
    for (let i = 0; i < 20; i++) sweep.feed(swing(i), i * 33, { face });
    expect(sweep.feed(swing(20), 20 * 33, { face }).progress).toBeGreaterThan(0);
    const turned = { ...face, x: face.x + 0.6 * face.w + 0.02 };
    expect(sweep.feed(swing(21), 21 * 33, { face: turned }).progress).toBe(0);
  });

  it("reset forgets the sweep and the face reference", () => {
    const sweep = new WaveSweep();
    for (let i = 0; i < 90; i++) sweep.feed(swing(i), i * 33);
    sweep.reset();
    expect(sweep.feed(swing(0), 0)).toEqual({ progress: 0, swings: 0, detected: false });
  });

  it("the lab sampler reports exactly the rule's numbers, frame by frame", () => {
    const sweep = new WaveSweep();
    const lab = new WaveLabSampler();
    for (let i = 0; i < 90; i++) {
      const step = sweep.feed(swing(i), i * 33);
      lab.feed(swing(i), i * 33);
      expect(lab.progress).toBeCloseTo(step.progress, 12);
      expect(lab.reversals).toBe(step.swings);
      expect(lab.detected).toBe(step.detected);
    }
  });
});

// ---- The game (WaveTracker, driven frame by frame) and the lab must agree on the same synthetic hand. ----

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const STEP_MS = 1000 / 30;
interface Frame {
  hands: Landmark[][];
  face: FaceBox | null;
}

let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
let nextId: number;
let now: number;
let frameIndex: number;
const cancelled = new Set<number>();

function step() {
  const q = rafQueue.splice(0);
  for (const f of q) if (!cancelled.has(f.id)) f.cb(now);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetInferenceSchedulerForTest();
  rafQueue = [];
  nextId = 1;
  now = 1000;
  frameIndex = 0;
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

/** Runs the real tracker over the frames; returns its progress after each frame and the wave times. */
async function playGame(frames: Frame[]): Promise<{ progress: number[]; waves: number[] }> {
  const lm = {
    detectForVideo: vi.fn(() => ({ landmarks: frames[frameIndex]!.hands })),
    close: vi.fn(),
  };
  vi.mocked(HandLandmarker.createFromOptions).mockResolvedValue(lm as never);
  const video = { readyState: 4, currentTime: -1 } as HTMLVideoElement;
  const waves: number[] = [];
  const progress: number[] = [];
  const face = { update: vi.fn(), current: vi.fn(() => frames[frameIndex]?.face ?? null) };
  const options: WaveTrackerOptions = {
    getVideo: () => video,
    modelUrl: () => "/m",
    onWave: () => waves.push(now),
    face,
  };
  const tracker = new WaveTracker(options);
  await tracker.start();
  const startedAt = now;
  for (frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    (video as { currentTime: number }).currentTime = frameIndex + 1;
    now = startedAt + frameIndex * STEP_MS;
    step();
    progress.push(tracker.progress);
  }
  tracker.stop();
  return { progress, waves: waves.map((t) => t - startedAt) };
}

/** Runs the lab sampler over the same frames, with the same hand size and face the game would use. */
function playLab(frames: Frame[]): { progress: number[]; detectedAt: number | null } {
  const lab = new WaveLabSampler();
  const progress: number[] = [];
  let detectedAt: number | null = null;
  frames.forEach((f, i) => {
    const hand = f.hands[0];
    const t = i * STEP_MS;
    lab.feed(hand ? hand[0]! : null, t, { handSize: hand ? handSize(hand) : undefined, face: f.face });
    if (lab.detected && detectedAt === null) detectedAt = t;
    progress.push(Math.round(lab.progress * 100) / 100);
  });
  return { progress, detectedAt };
}

const FACE: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };
const frames = (n: number, make: (t: number) => Frame): Frame[] => Array.from({ length: n }, (_, i) => make(i * STEP_MS));

describe("game and lab agree on the same synthetic sequence", () => {
  it("a lone waving hand: same progress every frame and the same detection time", async () => {
    const seq = frames(60, (t) => ({ hands: [handAt(0.5 + 0.12 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.1, 0.12)], face: null }));
    const game = await playGame(seq);
    const lab = playLab(seq);
    expect(game.progress).toEqual(lab.progress);
    expect(game.waves).toHaveLength(1);
    // Times differ only by float rounding (the game counts from its start clock).
    expect(lab.detectedAt).toBeCloseTo(game.waves[0]!, 6);
  });

  it("a head turn with the hand held on the head: both restart the sweep on the same frame", async () => {
    const turned: FaceBox = { ...FACE, x: FACE.x + 0.6 * FACE.w + 0.02 };
    const seq = frames(60, (t) => ({
      hands: [handAt(0.5 + 0.12 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.1, 0.12)],
      face: t < 20 * STEP_MS ? FACE : turned,
    }));
    const game = await playGame(seq);
    const lab = playLab(seq);
    expect(game.progress).toEqual(lab.progress);
    expect(game.waves).toHaveLength(lab.detectedAt === null ? 0 : 1);
    if (lab.detectedAt !== null) expect(lab.detectedAt).toBeCloseTo(game.waves[0]!, 6);
  });

  it("a still hand: neither reports progress nor a wave", async () => {
    const seq = frames(60, () => ({ hands: [handAt(0.5, 0.5, 0.3)], face: null }));
    const game = await playGame(seq);
    const lab = playLab(seq);
    expect(game.waves).toEqual([]);
    expect(lab.detectedAt).toBeNull();
    expect(game.progress).toEqual(lab.progress);
  });
});
