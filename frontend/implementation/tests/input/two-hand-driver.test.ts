// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { HandDrawingDriver } from "@/src/input/mediapipe-input";
import { StrokeStore, type Landmark } from "@/src/input/types";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { fistHand, pinchHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const create = vi.mocked(HandLandmarker.createFromOptions);

/** Frame clock: 33 ms per camera frame, so the pipeline sees a steady 30 fps. */
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

/**
 * Starts a live driver whose MediaPipe reports `hands` on every camera frame, then runs `frames` frames.
 * start() processes the first frame itself; each later frame is one scheduled loop callback.
 */
async function runDriver(store: StrokeStore, hands: Landmark[][], frames: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
  const landmarker = { detectForVideo: vi.fn(() => ({ landmarks: hands })), close: vi.fn() };
  create.mockResolvedValueOnce(landmarker as never);
  const driver = new HandDrawingDriver({ canvas, video, store, modelUrl: "/m", onStatus: vi.fn(), onRender: vi.fn(), onCursor: vi.fn() });
  await driver.start();
  for (let i = 1; i < frames; i++) {
    now += 33;
    video.currentTime += 1 / 30;
    raf.splice(0).forEach((cb) => cb(now));
  }
  await driver.stop();
  return { landmarker };
}

describe("live driver: two hands", () => {
  it("asks MediaPipe for two hands", async () => {
    await runDriver(new StrokeStore(), [], 1);
    expect((create.mock.calls[0]![1] as { numHands: number }).numHands).toBe(2);
  });

  it("with a fist and a pinching hand in view, the pinch does not draw and the fist erases", async () => {
    const store = new StrokeStore();
    store.beginStroke();
    for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: 210 });
    store.endStroke();
    await runDriver(store, [pinchHand(0.3), fistHand()], 6);
    expect(store.getStrokes().active).toBeNull();
    // The fist removes the points around its knuckles (188, 210); the line is cut, nothing new is drawn.
    const kept = store.getStrokes().completed.reduce((n, s) => n + s.length, 0);
    expect(kept).toBeLessThan(41);
    expect(kept).toBeGreaterThan(0);
  });

  it("with one pinching hand the driver draws as before", async () => {
    const store = new StrokeStore();
    await runDriver(store, [pinchHand(0.4)], 6);
    expect(store.getStrokes().completed.length + (store.getStrokes().active ? 1 : 0)).toBe(1);
    expect(store.hasInk()).toBe(true);
  });
});
