// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { getHandCursor, hasActiveReader, resetHandCursorForTest } from "@/src/camera/hand-cursor-store";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { publishHandForTest, resetThumbTrackerForTest } from "@/src/camera/thumb-tracker";
import { GameplayHandDriver } from "@/src/input/gameplay-hand-driver";
import { HandDrawingDriver } from "@/src/input/mediapipe-input";
import { StrokeStore, type Landmark } from "@/src/input/types";
import { makeHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));
const create = vi.mocked(HandLandmarker.createFromOptions);

// One open hand whose index tip sits at camera-frame (0.3, 0.4): the mirrored cursor is (0.7, 0.4).
const OPEN_HAND: Landmark[] = makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], indexTip: { x: 0.3, y: 0.4 } });
const MIRRORED_TIP = { x: 0.7, y: 0.4 };

let raf: FrameRequestCallback[] = [];
const stepRaf = () => {
  const queue = raf.splice(0);
  queue.forEach((cb) => cb(0));
};
const flush = () => new Promise((r) => setTimeout(r, 0));

function liveStream() {
  const track = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}
function video() {
  return { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSharedStreamForTest();
  resetHandCursorForTest();
  resetThumbTrackerForTest();
  raf = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    raf.push(cb);
    return raf.length;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  resetSharedStreamForTest();
  resetHandCursorForTest();
  resetThumbTrackerForTest();
});

function drawingDriver() {
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  return new HandDrawingDriver({
    canvas,
    video: video(),
    store: new StrokeStore(),
    modelUrl: "/m",
    onStatus: () => undefined,
    onRender: () => undefined,
  });
}

describe("HandDrawingDriver publishes its reader to the shared cursor", () => {
  it("is a live reader from the moment it starts, even while the model still loads", async () => {
    setSharedStream(liveStream());
    create.mockReturnValue(new Promise(() => undefined)); // model never finishes here
    const driver = drawingDriver();
    void driver.start();
    await flush();
    expect(hasActiveReader()).toBe(true);
    expect(getHandCursor()?.cursor).toBeNull();
  });

  it("publishes the mirrored index fingertip of the hand it tracks, every frame", async () => {
    setSharedStream(liveStream());
    const v = video();
    const lm = { detectForVideo: vi.fn(() => ({ landmarks: [OPEN_HAND] })), close: vi.fn() };
    create.mockResolvedValue(lm as never);
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const driver = new HandDrawingDriver({ canvas, video: v, store: new StrokeStore(), modelUrl: "/m", onStatus: () => undefined, onRender: () => undefined });
    await driver.start();
    v.currentTime = 1;
    stepRaf();
    expect(getHandCursor()).toMatchObject({ source: "drawing", cursor: expect.objectContaining({}) });
    const cursor = getHandCursor()!.cursor!;
    expect(cursor.x).toBeCloseTo(MIRRORED_TIP.x, 6);
    expect(cursor.y).toBeCloseTo(MIRRORED_TIP.y, 6);
    await driver.stop();
  });

  it("publishes no cursor while no hand is in view, and keeps the reader alive", async () => {
    setSharedStream(liveStream());
    const v = video();
    const lm = { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() };
    create.mockResolvedValue(lm as never);
    const driver = drawingDriver();
    await driver.start();
    v.currentTime = 1;
    stepRaf();
    expect(getHandCursor()?.cursor).toBeNull();
    expect(hasActiveReader()).toBe(true);
    await driver.stop();
  });

  it("stop retires its reader so the dwell can start the tracker again", async () => {
    setSharedStream(liveStream());
    create.mockResolvedValue({ detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() } as never);
    const driver = drawingDriver();
    await driver.start();
    expect(hasActiveReader()).toBe(true);
    await driver.stop();
    expect(hasActiveReader()).toBe(false);
  });
});

describe("GameplayHandDriver publishes its reader to the shared cursor", () => {
  it("publishes the mirrored fingertip per frame and retires on stop", async () => {
    setSharedStream(liveStream());
    const v = video();
    create.mockResolvedValue({ detectForVideo: vi.fn(() => ({ landmarks: [OPEN_HAND] })), close: vi.fn() } as never);
    const driver = new GameplayHandDriver({ video: v, onFrame: () => undefined, onStatus: () => undefined });
    await driver.start();
    expect(hasActiveReader()).toBe(true);
    v.currentTime = 1;
    stepRaf();
    expect(getHandCursor()?.source).toBe("gameplay");
    expect(getHandCursor()!.cursor!.x).toBeCloseTo(MIRRORED_TIP.x, 6);
    await driver.stop();
    expect(hasActiveReader()).toBe(false);
  });
});

describe("the shared thumb tracker publishes its reading as source tracker", () => {
  it("a frame through the tracker's own path reaches the store with the mirrored tip", () => {
    publishHandForTest(OPEN_HAND);
    expect(getHandCursor()?.source).toBe("tracker");
    expect(getHandCursor()!.cursor!.x).toBeCloseTo(MIRRORED_TIP.x, 6);
    // The tracker does not count as a page reader: the dwell may start it, and it must not stop itself.
    expect(hasActiveReader()).toBe(false);
  });
});
