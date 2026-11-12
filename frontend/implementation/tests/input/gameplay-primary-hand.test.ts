// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { GameplayHandDriver, type GameplayFrame } from "@/src/input/gameplay-hand-driver";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { MIN_HAND_SIZE, handSize } from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";
import { makeHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

/** An open hand with the index tip at (x, y). */
const shaped = (x: number, y: number): Landmark[] => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], indexTip: { x, y } });
/** The same hand scaled by k about its wrist (0.5, 0.9) and moved to (ox, oy): a person further or closer. */
const place = (hand: Landmark[], k: number, ox: number, oy: number): Landmark[] =>
  hand.map((p) => ({ x: ox + (p.x - 0.5) * k, y: oy + (p.y - 0.9) * k }));

/** The player: the large hand on the right. */
const player = (): Landmark[] => shaped(0.6, 0.5);
/** A second person further away: valid (above MIN_HAND_SIZE) but about half the player's size, on the left. */
const bystander = (): Landmark[] => place(shaped(0.5, 0.5), 0.5, 0.2, 0.5);
/** The same bystander walking closer: bigger than the player for one frame. */
const bigBystander = (): Landmark[] => place(shaped(0.5, 0.5), 1.1, 0.2, 0.5);

let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  resetSharedStreamForTest();
  rafQueue = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  vi.mocked(FilesetResolver.forVisionTasks).mockResolvedValue({} as never);
  const track = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  setSharedStream({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSharedStreamForTest();
});

/** Runs the driver over `framesOf(i)` (MediaPipe's hands per camera frame) and returns the frames it emitted. */
async function drive(framesOf: (i: number) => Landmark[][], frames: number): Promise<GameplayFrame[]> {
  let i = 0;
  const landmarker = { detectForVideo: vi.fn(() => ({ landmarks: framesOf(i) })), close: vi.fn() };
  vi.mocked(HandLandmarker.createFromOptions).mockResolvedValue(landmarker as never);
  const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement & { currentTime: number };
  const out: GameplayFrame[] = [];
  const driver = new GameplayHandDriver({ video, onFrame: (f) => out.push(f), onStatus: vi.fn() });
  await driver.start();
  for (i = 1; i < frames; i++) {
    video.currentTime += 1;
    const q = rafQueue.splice(0);
    for (const cb of q) cb(performance.now());
  }
  await driver.stop();
  return out;
}

describe("gameplay steering follows the player's hand, not the first hand listed", () => {
  it("the bystander is smaller than the player but still valid (the test would prove nothing otherwise)", () => {
    expect(handSize(bystander())).toBeGreaterThanOrEqual(MIN_HAND_SIZE);
    expect(handSize(bystander())).toBeLessThan(handSize(player()));
  });

  it("the cursor follows the player when the bystander is listed first", async () => {
    const frames = await drive(() => [bystander(), player()], 3);
    const tracked = frames.filter((f) => f.tracked);
    expect(tracked.length).toBeGreaterThan(0);
    // Mirrored index tip of the player: x = 1 - 0.6 = 0.4.
    for (const f of tracked) expect(f.cursor?.x).toBeCloseTo(0.4, 2);
  });

  it("a bigger bystander hand on the next frame does not take over the player's lock", async () => {
    const frames = await drive((i) => (i === 0 ? [bystander(), player()] : [bigBystander(), player()]), 3);
    const last = frames.filter((f) => f.tracked).at(-1);
    expect(last?.cursor?.x).toBeCloseTo(0.4, 2);
  });
});
