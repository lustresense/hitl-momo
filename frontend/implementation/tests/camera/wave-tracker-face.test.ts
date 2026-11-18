// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WaveTracker, type WaveTrackerOptions } from "@/src/camera/wave-tracker";
import type { FaceBox } from "@/src/camera/face-anchor";
import type { Landmark } from "@/src/input/types";
import { handAt } from "./hand-points";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

/** Frame 0 is the first frame of the run; each frame is 33 ms (30 fps). */
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

/** The player's face, centred at x 0.5, top 0.2, 0.2 wide and 0.25 high. */
const FACE: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };

/**
 * Runs the tracker over the frames, one camera frame per step. Returns the time (ms) each wave was reported at.
 * The detector and the face source both read the frame of the current step.
 */
async function play(frames: Frame[]): Promise<number[]> {
  const lm = {
    detectForVideo: vi.fn(() => ({ landmarks: frames[frameIndex]!.hands })),
    close: vi.fn(),
  };
  vi.mocked(HandLandmarker.createFromOptions).mockResolvedValue(lm as never);
  const video = { readyState: 4, currentTime: -1 } as HTMLVideoElement;
  const waves: number[] = [];
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
  }
  tracker.stop();
  return waves.map((t) => t - startedAt);
}

const frames = (n: number, make: (t: number) => Frame): Frame[] =>
  Array.from({ length: n }, (_, i) => make(i * STEP_MS));

describe("WaveTracker with the face anchor", () => {
  it("the player's wave above the head is recognised within 1.0 s, with the face in view", async () => {
    const waves = await play(
      frames(45, (t) => ({
        hands: [handAt(0.5 + 0.12 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.1, 0.12)],
        face: FACE,
      })),
    );
    expect(waves.length).toBe(1);
    expect(waves[0]!).toBeLessThanOrEqual(1000);
  });

  it("a bystander waving far to the side of the player is ignored", async () => {
    const waves = await play(
      frames(90, (t) => ({
        hands: [handAt(0.9 + 0.05 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.5, 0.3)],
        face: FACE,
      })),
    );
    expect(waves).toEqual([]);
  });

  it("a face misread as a hand, swinging side to side, is ignored", async () => {
    const waves = await play(
      frames(90, (t) => ({
        hands: [handAt(0.5 + 0.05 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.325, 0.2)],
        face: FACE,
      })),
    );
    expect(waves).toEqual([]);
  });

  it("a head shaking 'no' with the hand held on the head makes no wave", async () => {
    const shake = (t: number) => 0.5 + 0.2 * Math.sin(2 * Math.PI * 2 * (t / 1000));
    const waves = await play(
      frames(90, (t) => {
        const cx = shake(t);
        return {
          hands: [handAt(cx, 0.5, 0.12)],
          face: { x: cx - 0.1, y: 0.2, w: 0.2, h: 0.25 },
        };
      }),
    );
    expect(waves).toEqual([]);
  });

  it("with no face in view the plain rule still recognises a lone waving hand", async () => {
    const waves = await play(
      frames(45, (t) => ({
        hands: [handAt(0.8 + 0.12 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.5, 0.3)],
        face: null,
      })),
    );
    expect(waves.length).toBe(1);
  });

  it("a bigger bystander hand that also waves does not stop the player's wave", async () => {
    const waves = await play(
      frames(45, (t) => ({
        hands: [
          handAt(0.92, 0.5, 0.4),
          handAt(0.5 + 0.12 * Math.sin(2 * Math.PI * 2 * (t / 1000)), 0.1, 0.12),
        ],
        face: FACE,
      })),
    );
    expect(waves.length).toBe(1);
    expect(waves[0]!).toBeLessThanOrEqual(1000);
  });
});
