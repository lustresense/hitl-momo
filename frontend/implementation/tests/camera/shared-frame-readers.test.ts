// @vitest-environment jsdom
/**
 * One camera frame, several readers (PANDUAN §3): the wave tracker and the thumb tracker both read the camera
 * preview that GlobalCamera shows. They must share one read per frame, not call detectForVideo twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WaveTracker } from "@/src/camera/wave-tracker";
import { acquireThumbTracker, resetThumbTrackerForTest } from "@/src/camera/thumb-tracker";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
let nextId: number;
const cancelled = new Set<number>();

/** Runs every queued rAF callback once, like one display frame. */
function step() {
  const q = rafQueue.splice(0);
  for (const f of q) if (!cancelled.has(f.id)) f.cb(1000);
}
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

let preview: HTMLVideoElement;
let host: HTMLDivElement;
let lm: { detectForVideo: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
const stream = { getVideoTracks: () => [] } as unknown as MediaStream;

beforeEach(() => {
  rafQueue = [];
  nextId = 1;
  cancelled.clear();
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
    cancelled.add(id as number);
  });
  // Constant clock: detections cost nothing on the budget, so the test only counts reads.
  vi.spyOn(performance, "now").mockImplementation(() => 1000);
  // Every <video> reports a ready frame, so the readers do not wait for a real camera.
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });

  host = document.createElement("div");
  host.className = "global-camera-host";
  preview = document.createElement("video");
  preview.className = "camera-video";
  let currentTime = 0;
  Object.defineProperty(preview, "currentTime", { configurable: true, get: () => currentTime, set: (v: number) => (currentTime = v) });
  host.appendChild(preview);
  document.body.appendChild(host);
  preview.srcObject = stream;

  lm = { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() };
  vi.mocked(HandLandmarker.createFromOptions).mockResolvedValue(lm as never);
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
  resetSharedStreamForTest();
  resetThumbTrackerForTest();
  resetInferenceSchedulerForTest();
});

afterEach(() => {
  resetThumbTrackerForTest();
  resetSharedStreamForTest();
  host.remove();
  vi.restoreAllMocks();
  delete (HTMLMediaElement.prototype as { readyState?: number }).readyState;
});

describe("wave tracker and thumb tracker on one camera preview", () => {
  it("one detectForVideo call per camera frame, and both readers use the preview element", async () => {
    // The camera shows frame 1 when both readers start; the wave tracker reads it on start, the thumb tracker
    // binds to the same frame.
    preview.currentTime = 1 / 30;
    const wave = new WaveTracker({ getVideo: () => preview, modelUrl: () => "/m", onWave: vi.fn() });
    await wave.start();
    const release = acquireThumbTracker();
    setSharedStream(stream);
    await flush();

    for (let frame = 2; frame <= 6; frame++) {
      preview.currentTime = frame / 30;
      step();
    }

    // Six camera frames, six reads: the thumb tracker never reads a frame the wave tracker already read.
    expect(lm.detectForVideo).toHaveBeenCalledTimes(6);
    for (const call of lm.detectForVideo.mock.calls) expect(call[0]).toBe(preview);
    wave.stop();
    release();
  });

  it("without a preview on the page the thumb tracker still reads its own feed of the stream", async () => {
    host.remove();
    const release = acquireThumbTracker();
    setSharedStream(stream);
    await flush();
    step();
    expect(lm.detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of lm.detectForVideo.mock.calls) expect(call[0]).not.toBe(preview);
    release();
  });
});
