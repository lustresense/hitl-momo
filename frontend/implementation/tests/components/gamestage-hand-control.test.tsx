/**
 * Hand control end to end in the integrated stage, with no camera: synthetic 21-point hands go
 * through the real GameplayHandDriver (MediaPipe is mocked), the real InputArbiter and the
 * real useHandControl wiring, and must reach the game controller as the right DirectionInput.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { GameStage } from "@/src/components/game/GameStage";
import { LEVELS } from "@/src/domain/levels";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import type { Landmark } from "@/src/input/types";

// The next frame "sees" this hand (undefined = no hand in view).
const mp = vi.hoisted(() => ({ hand: undefined as Landmark[] | undefined }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  HandLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ landmarks: mp.hand ? [mp.hand] : [] }),
      close: () => undefined,
    }),
  },
}));

const ctl = vi.hoisted(() => ({ setInput: vi.fn() }));
vi.mock("@/src/game/game-controller", () => ({
  GameController: class {
    mount = vi.fn().mockResolvedValue(undefined);
    unmount = vi.fn();
    setInput = ctl.setInput;
    setPlacement = vi.fn().mockReturnValue(true);
    commitPlacementAt = vi.fn().mockReturnValue(true);
    retry = vi.fn();
    reposition = vi.fn();
  },
}));

/**
 * Hand seen by the student. `side` is where the index fingertip sits on the student's screen
 * (0 = far left, 1 = far right); the camera image is mirrored, so the raw x is 1 - side.
 * Hand span is 0.2, so a thumb gap of 0.2 is a pinch (ratio 1.0 is open).
 */
function hand(side: number, pinchGap = 1): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.9 };
  lm[9] = { x: 0.5, y: 0.7 };
  lm[8] = { x: 1 - side, y: 0.4 };
  lm[4] = { x: 1 - side - pinchGap * 0.2, y: 0.4 };
  return lm;
}

let video: HTMLVideoElement;
let frameClock = 0;
let rafQueue: FrameRequestCallback[] = [];
let rafSpy: { mockRestore: () => void } | null = null;

/** One camera frame: a new video time makes the driver run detection and the arbiter once. */
function stepFrame() {
  frameClock += 1;
  video.currentTime = frameClock;
  act(() => {
    const queued = rafQueue.splice(0);
    queued.forEach((cb) => cb(performance.now()));
  });
}

function mountCameraVideo(): HTMLVideoElement {
  const host = document.createElement("div");
  host.className = "global-camera-host";
  const el = document.createElement("video");
  el.className = "camera-video";
  let time = 0;
  Object.defineProperty(el, "currentTime", { configurable: true, get: () => time, set: (t: number) => { time = t; } });
  Object.defineProperty(el, "readyState", { configurable: true, get: () => 4 });
  host.appendChild(el);
  document.body.appendChild(host);
  return el;
}

function liveStream(): MediaStream {
  const track = {
    readyState: "live",
    stop: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

const lastInput = () => ctl.setInput.mock.calls.at(-1)?.[0] as { left: boolean; right: boolean; jump: boolean };
const everSentJump = () => ctl.setInput.mock.calls.some(([i]) => (i as { jump: boolean }).jump);

/**
 * Wait until the lazily imported driver is running: it has created its landmarker and queued
 * its first camera frame. The import of the driver module can take several ticks, so poll.
 */
async function settle() {
  await act(async () => {
    await vi.waitFor(() => expect(rafQueue.length).toBeGreaterThan(0), { timeout: 3000, interval: 5 });
  });
}

/**
 * Integrated stage, student enters the world. Camera mode turns hand control on by itself, so no
 * toggle is clicked (R13: no hand toggle in camera mode).
 */
async function startInCamera(phase: "placing" | "gameplay") {
  render(
    <GameStage
      integrated
      level={LEVELS[0]!}
      behavior="solid"
      decision={{ type: "accept", finalLabel: "papan", sourceRank: 1 }}
      drawingInput={null}
      phase={phase}
      onOutcomeReported={() => {}}
      onRedraw={() => {}}
      onFallComplete={() => {}}
      onCommitPlacement={() => {}}
      onReposition={() => {}}
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByTestId("btn-enter-world"));
  });
  await settle();
}

beforeEach(() => {
  mp.hand = undefined;
  ctl.setInput.mockClear();
  resetSharedStreamForTest();
  setSharedStream(liveStream());
  video = mountCameraVideo();
  frameClock = 0;
  rafQueue = [];
  rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
});

afterEach(() => {
  cleanup();
  rafSpy?.mockRestore();
  rafSpy = null;
  resetSharedStreamForTest();
  document.querySelectorAll(".global-camera-host").forEach((el) => el.remove());
});

describe("hand control reaches Thinman in the gameplay phase", () => {
  it("hand on the left side -> left, right side -> right, centre -> stop", async () => {
    await startInCamera("gameplay");

    mp.hand = hand(0.2);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput()).toEqual({ left: true, right: false, jump: false });

    mp.hand = hand(0.8);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput()).toEqual({ left: false, right: true, jump: false });

    mp.hand = hand(0.5);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput()).toEqual({ left: false, right: false, jump: false });
  });

  it("a held pinch is jump, and opening the hand ends it", async () => {
    await startInCamera("gameplay");

    mp.hand = hand(0.5, 0.2);
    for (let i = 0; i < 6; i++) stepFrame();
    expect(lastInput()).toEqual({ left: false, right: false, jump: true });

    mp.hand = hand(0.5, 1);
    for (let i = 0; i < 3; i++) stepFrame();
    expect(lastInput().jump).toBe(false);
  });

  it("losing the hand stops Thinman at once", async () => {
    await startInCamera("gameplay");

    mp.hand = hand(0.2);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput().left).toBe(true);

    mp.hand = undefined;
    stepFrame();
    expect(lastInput()).toEqual({ left: false, right: false, jump: false });
  });

  it("the on-screen direction button lights up while the hand gives that direction", async () => {
    await startInCamera("gameplay");

    mp.hand = hand(0.2);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(screen.getByTestId("move-left").classList.contains("is-hand-active")).toBe(true);
    expect(screen.getByTestId("move-right").classList.contains("is-hand-active")).toBe(false);

    mp.hand = hand(0.5);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(screen.getByTestId("move-left").classList.contains("is-hand-active")).toBe(false);
  });

  it("the guide shows the gesture wording once hand control is on", async () => {
    await startInCamera("gameplay");
    const guide = screen.getByTestId("control-guide");
    expect(guide.getAttribute("data-mode")).toBe("camera");
    expect(guide.textContent).toContain("Pakai tanganmu");
    expect(screen.getByTestId("guide-card-jump").textContent).toContain("Satukan telunjuk dan jempol untuk lompat.");
  });
});

describe("placing the object keeps the pinch for grabbing", () => {
  it("a pinch while placing never sends a jump", async () => {
    await startInCamera("placing");

    mp.hand = hand(0.5, 0.2);
    for (let i = 0; i < 8; i++) stepFrame();
    expect(everSentJump()).toBe(false);
  });
});
