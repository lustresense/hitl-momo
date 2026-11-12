/**
 * Input mode of the integrated world stage (NUI rule, R13). Camera mode: hand control runs by
 * itself (no toggle) and the direction buttons only show the hand. Fallback mode: mouse and
 * keyboard buttons work and no hand reader runs. Synthetic 21-point hands and a fake camera only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { GameStage } from "@/src/components/game/GameStage";
import { LEVELS } from "@/src/domain/levels";
import { resetSharedStreamForTest, setSharedStream } from "@/src/camera/shared-stream";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import type { Landmark } from "@/src/input/types";
import { pointingHand } from "../input/gameplay-fixtures";
import type { HumanDecision } from "@/src/domain/types";

const mp = vi.hoisted(() => ({
  hand: undefined as Landmark[] | undefined,
  /** Every HandLandmarker build attempt (GPU or CPU). One driver start = one attempt on success. */
  attempts: 0,
  fail: false,
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  HandLandmarker: {
    createFromOptions: async () => {
      mp.attempts++;
      if (mp.fail) throw new Error("model failed to load");
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

beforeAll(() => {
  // jsdom has no PointerEvent: give fireEvent.pointerDown a pointerId, as the other stage tests do.
  if (typeof window !== "undefined" && !window.PointerEvent) {
    class PointerEventPolyfill extends Event {
      pointerId: number;
      constructor(type: string, params: { pointerId?: number; bubbles?: boolean; cancelable?: boolean } = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
      }
    }
    // @ts-expect-error polyfill
    window.PointerEvent = PointerEventPolyfill;
    // @ts-expect-error polyfill
    globalThis.PointerEvent = PointerEventPolyfill;
  }
});

/** Hand seen by the student: side 0 = far left, 1 = far right; a pinch gap of 0.2 is a pinch. */
// Hands are built with pointingHand(angle): the index finger's direction on the student's screen.

let video: HTMLVideoElement;
let frameClock = 0;
let rafQueue: FrameRequestCallback[] = [];
let rafSpy: { mockRestore: () => void } | null = null;

/** One camera frame: a new video time makes the driver run detection once. */
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

const NO_INPUT = { left: false, right: false, jump: false };
/** The input the game controller received last (neutral before anything was sent). */
const current = () => (ctl.setInput.mock.calls.at(-1)?.[0] as typeof NO_INPUT | undefined) ?? NO_INPUT;
const button = (testId: string) => screen.getByTestId(testId);

/** The lazily imported driver has created its landmarker and queued its first frame. */
async function settle() {
  await act(async () => {
    // The model exists AND the driver has queued its first frame (another component's rAF alone
    // would let the steps run before the driver loop starts).
    await vi.waitFor(() => {
      expect(mp.attempts).toBeGreaterThan(0);
      expect(rafQueue.length).toBeGreaterThan(0);
    }, { timeout: 3000, interval: 5 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Same object identity on every render, as the app passes it: a new decision would remount the world.
const DECISION: HumanDecision = { type: "accept", finalLabel: "papan", sourceRank: 1 };

function stage(phase: "placing" | "gameplay") {
  return (
    <GameStage
      integrated
      level={LEVELS[0]!}
      behavior="solid"
      decision={DECISION}
      drawingInput={null}
      phase={phase}
      onOutcomeReported={() => {}}
      onRedraw={() => {}}
      onFallComplete={() => {}}
      onCommitPlacement={() => {}}
      onReposition={() => {}}
    />
  );
}

/** Integrated stage, student enters the world. No hand-control toggle is clicked. */
async function startStage(phase: "placing" | "gameplay") {
  const view = render(stage(phase));
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mp.hand = undefined;
  mp.attempts = 0;
  mp.fail = false;
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
  resetInputModeForTest();
  document.querySelectorAll(".global-camera-host").forEach((el) => el.remove());
});

describe("camera mode: hand control on by itself, buttons only show the hand", () => {
  it("the hand steers Thinman with no toggle click", async () => {
    forceInputMode("camera");
    await startStage("gameplay");
    await settle();

    mp.hand = pointingHand(170);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(current()).toEqual({ left: true, right: false, jump: false });
    expect(mp.attempts).toBe(1);
  });

  it("direction buttons take a silent press and hold, and light up while the hand gives that direction", async () => {
    forceInputMode("camera");
    await startStage("gameplay");
    await settle();

    const left = button("move-left");
    expect(left.getAttribute("aria-disabled")).toBeNull();
    expect(left.style.pointerEvents).not.toBe("none");

    fireEvent.pointerDown(button("move-right"), { pointerId: 1 });
    expect(current().right).toBe(true);
    fireEvent.pointerUp(button("move-right"), { pointerId: 1 });
    expect(current().right).toBe(false);

    fireEvent.pointerDown(button("move-jump"), { pointerId: 2 });
    expect(current().jump).toBe(true);
    fireEvent.pointerUp(button("move-jump"), { pointerId: 2 });
    expect(current().jump).toBe(false);

    mp.hand = pointingHand(170);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(left.classList.contains("is-hand-active")).toBe(true);
  });

  it("the guide shows the gesture wording and follows a mode change", async () => {
    forceInputMode("camera");
    await startStage("gameplay");
    await settle();

    const guide = screen.getByTestId("control-guide");
    expect(guide.getAttribute("data-mode")).toBe("camera");
    expect(screen.getByText("Pakai tanganmu")).toBeTruthy();

    act(() => forceInputMode("fallback"));
    expect(screen.getByTestId("control-guide").getAttribute("data-mode")).toBe("fallback");
    expect(screen.getByText("Pakai keyboard atau tombol")).toBeTruthy();
  });
});

describe("fallback mode: mouse and keyboard, no hand reader", () => {
  it("on-screen buttons work with the mouse, and the camera is never read", async () => {
    forceInputMode("fallback");
    await startStage("gameplay");

    const right = button("move-right");
    expect(right.getAttribute("aria-disabled")).toBeNull();
    expect(right.style.pointerEvents).not.toBe("none");

    fireEvent.pointerDown(right, { pointerId: 1 });
    expect(current().right).toBe(true);
    fireEvent.pointerUp(right, { pointerId: 1 });
    expect(current().right).toBe(false);
    expect(mp.attempts).toBe(0);
  });
});

describe("camera trouble turns the buttons back on (R13), and the hand returns with the camera", () => {
  it("no live camera means buttons, even in camera mode", async () => {
    forceInputMode("camera");
    setSharedStream(null);
    await startStage("gameplay");

    expect(button("move-left").getAttribute("aria-disabled")).toBeNull();
    fireEvent.pointerDown(button("move-left"), { pointerId: 1 });
    expect(current().left).toBe(true);
    expect(mp.attempts).toBe(0);
  });

  it("a hand reader that cannot load turns the buttons on", async () => {
    forceInputMode("camera");
    mp.fail = true;
    await startStage("gameplay");

    await act(async () => {
      await vi.waitFor(() => expect(mp.attempts).toBeGreaterThan(0), { timeout: 3000, interval: 5 });
      await vi.waitFor(() => expect(button("move-left").classList.contains("is-indicator")).toBe(false), {
        timeout: 3000,
        interval: 5,
      });
    });

    fireEvent.pointerDown(button("move-left"), { pointerId: 1 });
    expect(current().left).toBe(true);
  });

  it("the camera going away turns the buttons on, and the camera coming back restores hand control", async () => {
    forceInputMode("camera");
    await startStage("gameplay");
    await settle();
    expect(button("move-left").classList.contains("is-indicator")).toBe(true);

    act(() => setSharedStream(null));
    await act(async () => {
      await vi.waitFor(() => expect(button("move-left").classList.contains("is-indicator")).toBe(false), {
        timeout: 3000,
        interval: 20,
      });
    });

    act(() => setSharedStream(liveStream()));
    await act(async () => {
      await vi.waitFor(() => expect(mp.attempts).toBe(2), { timeout: 3000, interval: 20 });
    });
    await settle();
    expect(button("move-left").classList.contains("is-indicator")).toBe(true);

    mp.hand = pointingHand(10);
    for (let i = 0; i < 4; i++) stepFrame();
    expect(current()).toEqual({ left: false, right: true, jump: false });
  });
});

describe("one hand reader per stage visit", () => {
  it("placing into gameplay keeps the same reader: the model loads once and jump still works", async () => {
    forceInputMode("camera");
    const view = await startStage("placing");
    await settle();
    expect(mp.attempts).toBe(1);

    act(() => view.rerender(stage("gameplay")));
    await act(async () => {});

    mp.hand = pointingHand(90);
    for (let i = 0; i < 6; i++) stepFrame();
    expect(mp.attempts).toBe(1);
    expect(current().jump).toBe(true);
  });
});
