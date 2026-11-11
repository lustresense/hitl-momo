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
import { pointingHand } from "../input/gameplay-fixtures";

// The next frame "sees" this hand (undefined = no hand in view).
const mp = vi.hoisted(() => ({ hand: undefined as Landmark[] | undefined, created: 0 }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  HandLandmarker: {
    createFromOptions: async () => {
      mp.created++;
      return {
        detectForVideo: () => ({ landmarks: mp.hand ? [mp.hand] : [] }),
        close: () => undefined,
      };
    },
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

// Hands are built with pointingHand(angle): the index finger's direction on the student's screen.

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
    // Both: the model exists AND the driver has queued its first frame. A queued rAF alone can be
    // another component's frame, which would let the steps run before the driver loop starts.
    await vi.waitFor(() => {
      expect(mp.created).toBeGreaterThan(0);
      expect(rafQueue.length).toBeGreaterThan(0);
    }, { timeout: 3000, interval: 5 });
    await new Promise((resolve) => setTimeout(resolve, 0));
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
  mp.created = 0;
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

    mp.hand = pointingHand(170);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput()).toEqual({ left: true, right: false, jump: false });

    mp.hand = pointingHand(10);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput()).toEqual({ left: false, right: true, jump: false });

    mp.hand = pointingHand(-60);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput()).toEqual({ left: false, right: false, jump: false });
  });

  it("a finger pointing straight up is a jump, and lowering it ends the jump", async () => {
    await startInCamera("gameplay");

    mp.hand = pointingHand(90);
    for (let i = 0; i < 6; i++) stepFrame();
    expect(lastInput()).toEqual({ left: false, right: false, jump: true });

    mp.hand = pointingHand(-60);
    for (let i = 0; i < 3; i++) stepFrame();
    expect(lastInput().jump).toBe(false);
  });

  it("the hand status never shows the old 'NUI NOT VERIFIED' label to the student", async () => {
    await startInCamera("gameplay");
    expect(screen.queryByText(/NUI NOT VERIFIED/)).toBeNull();
  });

  it("losing the hand stops Thinman at once", async () => {
    await startInCamera("gameplay");

    mp.hand = pointingHand(170);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(lastInput().left).toBe(true);

    mp.hand = undefined;
    stepFrame();
    expect(lastInput()).toEqual({ left: false, right: false, jump: false });
  });

  it("the on-screen direction button lights up while the hand gives that direction", async () => {
    await startInCamera("gameplay");

    mp.hand = pointingHand(170);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(screen.getByTestId("move-left").classList.contains("is-hand-active")).toBe(true);
    expect(screen.getByTestId("move-right").classList.contains("is-hand-active")).toBe(false);

    mp.hand = pointingHand(-60);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(screen.getByTestId("move-left").classList.contains("is-hand-active")).toBe(false);
  });

  it("the guide shows the gesture wording once hand control is on", async () => {
    await startInCamera("gameplay");
    const guide = screen.getByTestId("control-guide");
    expect(guide.getAttribute("data-mode")).toBe("camera");
    expect(guide.textContent).toContain("Pakai tanganmu");
    expect(screen.getByTestId("guide-card-jump").textContent).toContain(
      "Telunjuk tegak ke atas untuk lompat. Miring ke kiri atau kanan untuk lompat sambil jalan.",
    );
  });
});

describe("placing the object keeps the pinch for grabbing", () => {
  it("a pinch while placing never sends a jump", async () => {
    await startInCamera("placing");

    mp.hand = pointingHand(0, { pinchGap: 0.2 });
    for (let i = 0; i < 8; i++) stepFrame();
    expect(everSentJump()).toBe(false);
  });
});
