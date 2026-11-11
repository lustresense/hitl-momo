/**
 * The stage's input chip in camera mode shows only problems the student can act on. A working hand
 * shows nothing, and no test label such as "(uji coba)" is ever printed. Synthetic hands and fake
 * frames only: there is no camera in the test sandbox.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { GameStage } from "@/src/components/game/GameStage";
import { LEVELS } from "@/src/domain/levels";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import type { Landmark } from "@/src/input/types";
import { pointingHand } from "../input/gameplay-fixtures";

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

let video: HTMLVideoElement;
let frameClock = 0;
let rafQueue: FrameRequestCallback[] = [];
let rafSpy: { mockRestore: () => void } | null = null;

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

async function settle() {
  await act(async () => {
    await vi.waitFor(() => {
      expect(mp.created).toBeGreaterThan(0);
      expect(rafQueue.length).toBeGreaterThan(0);
    }, { timeout: 3000, interval: 5 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function startInCamera() {
  render(
    <GameStage
      integrated
      level={LEVELS[0]!}
      behavior="solid"
      decision={{ type: "accept", finalLabel: "papan", sourceRank: 1 }}
      drawingInput={null}
      phase="gameplay"
      onOutcomeReported={() => {}}
      onRedraw={() => {}}
      onFallComplete={() => {}}
      onCommitPlacement={() => {}}
      onReposition={() => {}}
    />,
  );
  await act(async () => {});
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

describe("stage input chip in camera mode", () => {
  it("a working hand shows no chip, and the test label is never printed", async () => {
    await startInCamera();
    mp.hand = pointingHand(0);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(screen.queryByTestId("input-status")).toBeNull();
    expect(screen.queryByText(/uji coba/)).toBeNull();
  });

  it("a hand that leaves the frame shows its status, without the test label", async () => {
    await startInCamera();
    mp.hand = pointingHand(0);
    for (let i = 0; i < 4; i++) stepFrame();
    mp.hand = undefined;
    stepFrame();
    expect(screen.getByTestId("input-status").textContent).toBe("Tangan tidak terlihat");
    expect(screen.queryByText(/uji coba/)).toBeNull();
  });
});
