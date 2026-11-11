/**
 * Placement and exploration gestures in the integrated stage, end to end without a camera: synthetic hands go through
 * the real GameplayHandDriver (MediaPipe is mocked), the stage's pose and grab hooks, and the rings. The game
 * controller is mocked, so the test checks which controller call each gesture makes.
 *
 * Time: fake timers (setTimeout and Date). Each stepFrame() is one camera frame, 16 ms on the ring's clock, and
 * sleep() advances the fake clock, so the 150 ms grab drop is exact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameStage } from "@/src/components/game/GameStage";
import { LEVELS } from "@/src/domain/levels";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { resetHandCursorForTest } from "@/src/camera/hand-cursor-store";
import type { Landmark } from "@/src/input/types";
import { poseHand, rollHand, type FixturePose } from "../input/pose-fixtures";

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

const ctl = vi.hoisted(() => ({
  setInput: vi.fn(),
  setPlacement: vi.fn(() => true),
  commitPlacementAt: vi.fn(() => true),
  reposition: vi.fn(),
  rotate: vi.fn(() => true),
}));
vi.mock("@/src/game/game-controller", () => ({
  GameController: class {
    mount = vi.fn().mockResolvedValue(undefined);
    unmount = vi.fn();
    setInput = ctl.setInput;
    setPlacement = ctl.setPlacement;
    commitPlacementAt = ctl.commitPlacementAt;
    retry = vi.fn();
    reposition = ctl.reposition;
    rotate = ctl.rotate;
  },
}));

let video: HTMLVideoElement;
let frameClock = 0;
let ringClock = 0;
let rafQueue: FrameRequestCallback[] = [];
let rafSpy: { mockRestore: () => void } | null = null;

/** One camera frame: a new video time makes the driver run detection once, and every rAF callback runs on the 16 ms clock. */
function stepFrame() {
  frameClock += 1;
  video.currentTime = frameClock;
  ringClock += 16;
  act(() => {
    const queued = rafQueue.splice(0);
    queued.forEach((cb) => cb(ringClock));
  });
}

function stepFrames(n: number) {
  for (let i = 0; i < n; i++) stepFrame();
}

/** Lets time pass (the grab drop timer runs), with the stage's React state flushed. */
async function sleep(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** `roll` turns the whole hand in the picture plane (degrees, clockwise positive): the palm's twist. */
function setHand(pose: FixturePose | undefined, dx = 0, roll = 0) {
  mp.hand = pose ? rollHand(poseHand(pose, dx), roll) : undefined;
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

/** Waits until the lazily imported driver is running: its landmarker exists and its first frame is queued. */
async function settle() {
  await act(async () => {
    await vi.waitFor(() => {
      expect(mp.created).toBeGreaterThan(0);
      expect(rafQueue.length).toBeGreaterThan(0);
    }, { timeout: 3000, interval: 5 });
  });
}

interface StageOptions {
  phase: "placing" | "gameplay";
  onRedraw?: () => void;
}

async function startInCamera({ phase, onRedraw = () => {} }: StageOptions) {
  render(
    <GameStage
      integrated
      level={LEVELS[0]!}
      behavior="solid"
      decision={{ type: "accept", finalLabel: "papan", sourceRank: 1 }}
      drawingInput={null}
      phase={phase}
      onOutcomeReported={() => {}}
      onRedraw={onRedraw}
      onFallComplete={() => {}}
      onCommitPlacement={() => {}}
      onReposition={() => {}}
    />,
  );
  await act(async () => {});
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  mp.hand = undefined;
  mp.created = 0;
  for (const fn of Object.values(ctl)) fn.mockClear();
  ctl.setPlacement.mockReturnValue(true);
  ctl.commitPlacementAt.mockReturnValue(true);
  ctl.rotate.mockReturnValue(true);
  resetHandCursorForTest();
  resetSharedStreamForTest();
  setSharedStream(liveStream());
  video = mountCameraVideo();
  frameClock = 0;
  ringClock = 0;
  rafQueue = [];
  rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  rafSpy?.mockRestore();
  rafSpy = null;
  resetSharedStreamForTest();
  resetHandCursorForTest();
  document.querySelectorAll(".global-camera-host").forEach((el) => el.remove());
});

// Frames for a ring to fill: 16 ms each, so 1.5 s is about 94 frames and 2 s about 125. Pose voting needs about 3.
const FILL_1_5_S = 110;
const FILL_2_S = 140;

describe("placing: the grab, the place and the redraw rings", () => {
  it("a pinch held for its ring lets the object follow the hand; before the ring it does not move", async () => {
    await startInCamera({ phase: "placing" });
    setHand("pinch");
    stepFrames(60);
    expect(ctl.setPlacement).not.toHaveBeenCalled();

    stepFrames(FILL_1_5_S);
    expect(screen.getByTestId("placement-holding")).toBeTruthy();

    setHand("pinch", 0.12);
    stepFrames(6);
    expect(ctl.setPlacement).toHaveBeenCalled();
    expect(ctl.commitPlacementAt).not.toHaveBeenCalled();
  });

  it("releasing the pinch for longer than 150 ms drops the object in place, without placing it", async () => {
    await startInCamera({ phase: "placing" });
    setHand("pinch");
    stepFrames(FILL_1_5_S);
    expect(screen.getByTestId("placement-holding")).toBeTruthy();

    setHand("open-palm");
    stepFrames(6);
    await sleep(220);
    expect(screen.queryByTestId("placement-holding")).toBeNull();
    expect(screen.getByTestId("ring-grab")).toBeTruthy();
    expect(ctl.commitPlacementAt).not.toHaveBeenCalled();
  });

  it("thumbs-up fires the place ring after 2 s and places the object once", async () => {
    await startInCamera({ phase: "placing" });
    setHand("thumb-up");
    stepFrames(FILL_2_S - 30);
    expect(ctl.commitPlacementAt).not.toHaveBeenCalled();
    stepFrames(60);
    expect(ctl.commitPlacementAt).toHaveBeenCalledTimes(1);
  });

  it("open palm fires the redraw ring after its hold, and nothing else", async () => {
    const onRedraw = vi.fn();
    await startInCamera({ phase: "placing", onRedraw });
    setHand("open-palm");
    stepFrames(FILL_2_S + 30);
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(ctl.commitPlacementAt).not.toHaveBeenCalled();
    expect(ctl.setPlacement).not.toHaveBeenCalled();
  });

  it("one, two and three fingers never place, grab or redraw", async () => {
    const onRedraw = vi.fn();
    await startInCamera({ phase: "placing", onRedraw });
    for (const pose of ["one-finger", "two-fingers", "three-fingers"] as const) {
      setHand(pose);
      stepFrames(FILL_2_S + 30);
    }
    expect(onRedraw).not.toHaveBeenCalled();
    expect(ctl.commitPlacementAt).not.toHaveBeenCalled();
    expect(ctl.setPlacement).not.toHaveBeenCalled();
    expect(screen.queryByTestId("placement-holding")).toBeNull();
  });
});

describe("gameplay: exploration of a placed object", () => {
  it("the rings are shown in camera mode; pinch picks the object up and the release places it", async () => {
    await startInCamera({ phase: "gameplay" });
    expect(screen.getByTestId("ring-move")).toBeTruthy();
    expect(screen.getByTestId("ring-rotate")).toBeTruthy();

    setHand("pinch");
    stepFrames(FILL_1_5_S);
    expect(ctl.reposition).toHaveBeenCalledTimes(1);

    setHand("open-palm");
    stepFrames(6);
    await sleep(220);
    expect(ctl.commitPlacementAt).toHaveBeenCalledTimes(1);
  });

  it("the palm starts the turn after its hold; a still palm turns nothing; a twist turns a quarter turn", async () => {
    await startInCamera({ phase: "gameplay" });
    setHand("open-palm");
    stepFrames(FILL_1_5_S + 20);
    expect(screen.getByTestId("object-turn")).toBeTruthy();
    expect(ctl.rotate).not.toHaveBeenCalled();

    stepFrames(30);
    expect(ctl.rotate).not.toHaveBeenCalled();

    setHand("open-palm", 0, 50);
    stepFrames(6);
    expect(ctl.rotate).toHaveBeenCalledTimes(1);
    expect(ctl.reposition).not.toHaveBeenCalled();
  });

  it("the thumbs-up ends the turn; the twist after it turns nothing", async () => {
    await startInCamera({ phase: "gameplay" });
    setHand("open-palm");
    stepFrames(FILL_1_5_S + 20);
    setHand("thumb-up");
    stepFrames(6);
    expect(screen.queryByTestId("object-turn")).toBeNull();
    setHand("open-palm", 0, 60);
    stepFrames(6);
    expect(ctl.rotate).not.toHaveBeenCalled();
  });

  it("thumbs-up does nothing while the object is played", async () => {
    await startInCamera({ phase: "gameplay" });
    setHand("thumb-up");
    stepFrames(FILL_2_S + 30);
    expect(ctl.reposition).not.toHaveBeenCalled();
    expect(ctl.rotate).not.toHaveBeenCalled();
    expect(ctl.commitPlacementAt).not.toHaveBeenCalled();
  });
});

describe("fallback: no camera, no rings, the plain button stays", () => {
  it("placing shows the plain button, and it places on a click", async () => {
    resetSharedStreamForTest();
    render(
      <GameStage
        integrated
        level={LEVELS[0]!}
        behavior="solid"
        decision={{ type: "accept", finalLabel: "papan", sourceRank: 1 }}
        drawingInput={null}
        phase="placing"
        onOutcomeReported={() => {}}
        onRedraw={() => {}}
        onFallComplete={() => {}}
        onCommitPlacement={() => {}}
        onReposition={() => {}}
      />,
    );
    await act(async () => {});
    expect(screen.queryByTestId("ring-place")).toBeNull();
    fireEvent.click(screen.getByTestId("btn-confirm-placement"));
    expect(ctl.commitPlacementAt).toHaveBeenCalledTimes(1);
  });

  it("the stage never prints the old fallback label to the student", async () => {
    render(
      <GameStage
        integrated={false}
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
    expect(screen.queryByText(/BUKAN NUI/)).toBeNull();
    expect(screen.queryByText(/FALLBACK/)).toBeNull();
  });
});
