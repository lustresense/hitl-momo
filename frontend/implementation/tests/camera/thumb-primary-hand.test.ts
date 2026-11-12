// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireThumbTracker,
  getHandGestureState,
  resetThumbTrackerForTest,
} from "@/src/camera/thumb-tracker";
import { setSharedStream } from "@/src/camera/shared-stream";
import { takeHandLandmarker } from "@/src/camera/landmarker-warmup";
import { resetInferenceSchedulerForTest } from "@/src/camera/inference-scheduler";
import type { Landmark } from "@/src/input/types";

vi.mock("@/src/camera/landmarker-warmup", () => ({ takeHandLandmarker: vi.fn() }));

/** Fist with the thumb raised: a thumbs-up (same geometry as the thumb-tracker state tests). */
function thumbsUpHand(): Landmark[] {
  const h: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.9 };
  h[9] = { x: 0.5, y: 0.6 };
  for (const [pip, tip, x] of [[6, 8, 0.45], [10, 12, 0.5], [14, 16, 0.55], [18, 20, 0.6]] as const) {
    h[pip] = { x, y: 0.6 };
    h[tip] = { x, y: 0.8 };
  }
  h[2] = { x: 0.4, y: 0.6 };
  h[4] = { x: 0.4, y: 0.4 };
  return h;
}

/** An open hand scaled down and moved: a small hand far from the player. */
function openHandSmallAt(cx: number, cy: number, k: number): Landmark[] {
  const h: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.9 };
  h[9] = { x: 0.5, y: 0.6 };
  h[4] = { x: 0.3, y: 0.6 };
  h[8] = { x: 0.6, y: 0.3 };
  return h.map((p) => ({ x: cx + (p.x - 0.5) * k, y: cy + (p.y - 0.6) * k }));
}

let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
let frame: number;
let current: Landmark[][];
let release: (() => void) | null = null;
/**
 * Frame clock in ms. The shared inference gate and the primary-hand lock both read performance.now(). Frames stepped
 * back to back are microseconds apart on the wall clock, so the gate sometimes skipped a frame and the test flaked
 * (1 in ~10 alone). Each frame is 33 ms here, like a camera, so the result depends on the frames only.
 */
let clockMs = 1000;

function step() {
  const q = rafQueue.splice(0);
  for (const f of q) f.cb(0);
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  rafQueue = [];
  frame = 0;
  current = [];
  clockMs = 1000;
  // A gate with no history: a detection from an earlier test must not hold this test's budget closed.
  resetInferenceSchedulerForTest();
  vi.spyOn(performance, "now").mockImplementation(() => clockMs);
  let nextId = 1;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(() => frame);
  const landmarker = {
    detectForVideo: vi.fn(() => ({ landmarks: current })),
    close: vi.fn(),
  };
  vi.mocked(takeHandLandmarker).mockResolvedValue({ landmarker: landmarker as never, delegate: "CPU", fellBack: false });
  setSharedStream({ getVideoTracks: () => [{ readyState: "live", addEventListener() {}, removeEventListener() {} }] } as unknown as MediaStream);
  resetThumbTrackerForTest();
});

afterEach(() => {
  release?.();
  release = null;
  resetThumbTrackerForTest();
  setSharedStream(null);
  vi.restoreAllMocks();
});

/** Starts the tracker once (first call) and feeds one frame of hands per step. */
async function track(frames: Landmark[][][]) {
  if (!release) {
    release = acquireThumbTracker();
    await flush();
  }
  for (const hands of frames) {
    frame++;
    clockMs += 33;
    current = hands;
    step();
  }
}

describe("thumb tracker reads the primary hand, not the first one MediaPipe lists", () => {
  it("a thumbs-up from the player is seen even when a small far hand is listed first", async () => {
    const far = openHandSmallAt(0.15, 0.3, 0.4);
    await track([[far, thumbsUpHand()]]);
    expect(getHandGestureState().thumbUp).toBe(true);
  });

  it("keeps the locked player's hand when a bigger hand from far away appears first", async () => {
    const player = thumbsUpHand();
    await track([[openHandSmallAt(0.15, 0.3, 0.4), player]]);
    expect(getHandGestureState().thumbUp).toBe(true);
    // A larger open hand far from the player's wrist is listed first in the next frame.
    await track([[openHandSmallAt(0.1, 0.2, 1.0), player]]);
    expect(getHandGestureState().thumbUp).toBe(true);
  });

  it("a far-away hand alone (below MIN_HAND_SIZE) does not show a thumbs-up", async () => {
    await track([[thumbsUpHand().map((p) => ({ x: 0.1 + (p.x - 0.5) * 0.1, y: 0.2 + (p.y - 0.6) * 0.1 }))]]);
    expect(getHandGestureState().thumbUp).toBe(false);
    expect(getHandGestureState().handVisible).toBe(false);
  });
});
