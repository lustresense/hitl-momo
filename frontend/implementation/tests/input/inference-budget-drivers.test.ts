// @vitest-environment jsdom
/**
 * The page drivers (drawing and gameplay) read the camera through the shared budget (PANDUAN §8): when a detection is
 * slow they start the next one later, never sooner than the budget allows, and a frame the budget skips is not
 * taken for a lost hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { HandDrawingDriver } from "@/src/input/mediapipe-input";
import { GameplayHandDriver, type GameplayStatus } from "@/src/input/gameplay-hand-driver";
import { StrokeStore, type Landmark } from "@/src/input/types";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { resetInferenceSchedulerForTest, MAX_INTERVAL_MS } from "@/src/camera/inference-scheduler";
import { handAt } from "../camera/hand-points";
import { fistHand, pinchHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const FRAME_MS = 33;
/** Detection cost on the fake main-thread clock. */
const COST_MS = 60;

let now = 1000;
let raf: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  resetSharedStreamForTest();
  resetInferenceSchedulerForTest();
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
  resetInferenceSchedulerForTest();
});

/** A MediaPipe stand-in: every detection costs COST_MS on the fake clock and reports `hands`. */
function slowLandmarker(hands: () => Landmark[][]) {
  const starts: number[] = [];
  const detectForVideo = vi.fn(() => {
    starts.push(now);
    now += COST_MS;
    return { landmarks: hands() };
  });
  return { landmarker: { detectForVideo, close: vi.fn() }, starts };
}

/** Plays `frames` camera frames: the camera moves on every frame, then the queued loop callbacks run. */
function playFrames(video: { currentTime: number }, frames: number) {
  for (let i = 0; i < frames; i++) {
    now += FRAME_MS;
    video.currentTime += 1 / 30;
    raf.splice(0).forEach((cb) => cb(now));
  }
}

function gaps(starts: number[]): number[] {
  return starts.slice(1).map((t, i) => t - starts[i]!);
}

describe("drawing driver under the detection budget", () => {
  it("starts detections no closer together than the budget interval", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
    const { landmarker, starts } = slowLandmarker(() => [pinchHand(0.4)]);
    vi.mocked(HandLandmarker.createFromOptions).mockResolvedValueOnce(landmarker as never);
    const driver = new HandDrawingDriver({ canvas, video, store: new StrokeStore(), modelUrl: "/m", onStatus: vi.fn(), onRender: vi.fn(), onCursor: vi.fn() });
    await driver.start();
    playFrames(video, 90);
    await driver.stop();

    expect(starts.length).toBeGreaterThan(5);
    for (const gap of gaps(starts)) expect(gap).toBeGreaterThanOrEqual(MAX_INTERVAL_MS - 1);
    // Frames arrive every 33 ms, so the next detection is at most one frame after the floor.
    for (const gap of gaps(starts)) expect(gap).toBeLessThanOrEqual(MAX_INTERVAL_MS + FRAME_MS + 1);
  });

  it("a skipped frame is not a stall: the stroke of a steady hand is not cut", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
    const { landmarker } = slowLandmarker(() => [pinchHand(0.4)]);
    vi.mocked(HandLandmarker.createFromOptions).mockResolvedValueOnce(landmarker as never);
    const store = new StrokeStore();
    const onStatus = vi.fn();
    const driver = new HandDrawingDriver({ canvas, video, store, modelUrl: "/m", onStatus, onRender: vi.fn(), onCursor: vi.fn() });
    await driver.start();
    playFrames(video, 60);
    await driver.stop();

    const lost = onStatus.mock.calls.filter(([s]) => (s as { kind: string }).kind === "tracking-lost");
    expect(lost).toHaveLength(0);
    expect(store.hasInk() || store.getStrokes().active !== null).toBe(true);
    void fistHand;
  });
});

describe("gameplay driver under the detection budget", () => {
  it("starts detections no closer together than the budget interval, and never reports the hand lost in between", async () => {
    const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
    const hand = handAt(0.5, 0.5);
    const { landmarker, starts } = slowLandmarker(() => [hand]);
    vi.mocked(HandLandmarker.createFromOptions).mockResolvedValueOnce(landmarker as never);
    const statuses: GameplayStatus[] = [];
    const driver = new GameplayHandDriver({ video, onFrame: vi.fn(), onStatus: (s) => statuses.push(s) });
    await driver.start();
    playFrames(video, 90);
    await driver.stop();

    expect(starts.length).toBeGreaterThan(5);
    for (const gap of gaps(starts)) expect(gap).toBeGreaterThanOrEqual(MAX_INTERVAL_MS - 1);
    const afterFirstTracking = statuses.slice(statuses.indexOf("tracking"));
    expect(afterFirstTracking).not.toContain("tracking-lost");
  });
});
