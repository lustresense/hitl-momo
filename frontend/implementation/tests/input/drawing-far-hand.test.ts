// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { HandDrawingDriver } from "@/src/input/mediapipe-input";
import { StrokeStore, type Landmark } from "@/src/input/types";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { pinchHand } from "./hand-fixtures";
import { MIN_HAND_SIZE, handSize } from "@/src/camera/primary-hand";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const create = vi.mocked(HandLandmarker.createFromOptions);

let now = 1000;
let raf: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  resetSharedStreamForTest();
  now = 1000;
  raf = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    raf.push(cb);
    return raf.length;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
  const track = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  setSharedStream({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSharedStreamForTest();
});

/** Shrinks a hand about (ox, oy): a person far from the camera. */
function scaled(hand: Landmark[], k: number, ox: number, oy: number): Landmark[] {
  return hand.map((p) => ({ x: ox + (p.x - 0.5) * k, y: oy + (p.y - 0.7) * k }));
}

/**
 * Runs the live driver with one MediaPipe result per camera frame. `framesOf(i)` gives the hands of frame i.
 * Returns the store, so the test reads what was drawn.
 */
async function drawWith(framesOf: (i: number) => Landmark[][], frames: number) {
  const store = new StrokeStore();
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
  let i = 0;
  const landmarker = { detectForVideo: vi.fn(() => ({ landmarks: framesOf(i) })), close: vi.fn() };
  create.mockResolvedValueOnce(landmarker as never);
  const driver = new HandDrawingDriver({ canvas, video, store, modelUrl: "/m", onStatus: vi.fn(), onRender: vi.fn(), onCursor: vi.fn() });
  await driver.start();
  for (i = 1; i < frames; i++) {
    now += 33;
    video.currentTime += 1 / 30;
    raf.splice(0).forEach((cb) => cb(now));
  }
  await driver.stop();
  const s = store.getStrokes();
  return s.completed.reduce((n, line) => n + line.length, 0) + (s.active?.length ?? 0);
}

/** The player's pinch sweeping left to right across the frame, one step per camera frame. */
const sweep = (i: number) => [pinchHand(0.2 + i * 0.02, 0.55)];

describe("live drawing ignores a far-away person's hand", () => {
  it("the player's pinch draws (control)", async () => {
    const points = await drawWith((i) => sweep(i), 30);
    expect(points).toBeGreaterThan(0);
  });

  it("a small far pinch (below MIN_HAND_SIZE) draws nothing", async () => {
    // The far pinch sweeps like the player's, but shrunk. Every frame must really be below the cut,
    // otherwise the test would prove nothing.
    const farFrames = Array.from({ length: 30 }, (_, i) => [scaled(pinchHand(0.3 + i * 0.003, 0.55), 0.2, 0.2, 0.2)]);
    for (const f of farFrames) expect(handSize(f[0]!)).toBeLessThan(MIN_HAND_SIZE);
    const points = await drawWith((i) => farFrames[i]!, 30);
    expect(points).toBe(0);
  });
});
