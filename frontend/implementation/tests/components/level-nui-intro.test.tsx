import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, type HandCursorPoint, type HandSource } from "@/src/camera/hand-cursor-store";
import { acquireThumbTracker, resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";
import { LevelIntro } from "@/src/components/level/LevelIntro";
import { LEVELS } from "@/src/domain/levels";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, type Box } from "./gesture-stub";

// The level intro is NUI too: the skip is a dwell control, and its "Aku mengerti" thumb follows a page reader when
// the drawing page under the intro runs one (no second tracker, nui-no-second-reader.test.tsx).
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("gsap", async () => {
  const { gsapClockStub } = await import("./gsap-clock-stub");
  const gsap = gsapClockStub();
  return { gsap, default: gsap };
});
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

const level = LEVELS[0]!;
const SKIP_BOX: Box = { left: 900, top: 20, width: 60, height: 60 };
const at = (box: Box) => cursorAtPx(box.left + box.width / 2, box.top + box.height / 2);
const OUTSIDE = cursorAtPx(5, 5);

let reader: { cursor: HandCursorPoint | null; source: HandSource; thumbUp?: boolean } | null = null;
function readFrom(cursor: HandCursorPoint | null, source: HandSource = "tracker", thumbUp?: boolean) {
  reader = { cursor, source, thumbUp };
  act(() => publishHand({ cursor, source, thumbUp }));
}
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      if (reader) publishHand({ cursor: reader.cursor, source: reader.source, thumbUp: reader.thumbUp });
      vi.advanceTimersByTime(16);
    });
  }
}

/** Reduced motion: the story is shown at once, and the rise keeps its normal length. */
function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
}

/** Renders the intro and lets Momo finish her story, so the thumb is on screen. */
function renderNudge(props: { onFinish?: () => void } = {}) {
  const onFinish = props.onFinish ?? vi.fn();
  render(<LevelIntro level={level} onFinish={onFinish} />);
  for (let t = 0; t < 180000 && !screen.queryByTestId("intro-continue"); t += 16) advance(16);
  placeBox(screen.getByTestId("intro-skip"), SKIP_BOX);
  return { onFinish };
}

beforeEach(() => {
  stubReducedMotion();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetHandCursorForTest();
  resetThumbTrackerForTest();
  reader = null;
  vi.mocked(acquireThumbTracker).mockClear();
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("level intro, camera mode: the skip is a dwell control", () => {
  it("a resting fingertip 1.2 s on Lewati cerita ends the intro", () => {
    const { onFinish } = renderNudge();
    readFrom(null);
    advance(50);
    readFrom(at(SKIP_BOX));
    advance(1300);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("a fingertip outside the skip does not end the intro", () => {
    const { onFinish } = renderNudge();
    readFrom(null);
    advance(50);
    readFrom(OUTSIDE);
    advance(1300);
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByTestId("level-intro").getAttribute("data-phase")).toBe("nudge");
  });
});

describe("level intro, fallback mode: a click skips at once", () => {
  it("a click on Lewati cerita ends the intro", () => {
    forceInputMode("fallback");
    const { onFinish } = renderNudge();
    fireEvent.click(screen.getByTestId("intro-skip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("level intro: the Aku mengerti thumb never starts a second tracker", () => {
  it("with no page reader the thumb starts the shared tracker", () => {
    renderNudge();
    expect(vi.mocked(acquireThumbTracker)).toHaveBeenCalled();
  });

  it("with the drawing page's reader live, the thumb follows its thumbs-up and starts no tracker", () => {
    const onFinish = vi.fn();
    readFrom(null, "drawing", false);
    renderNudge({ onFinish });
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
    // The ring arms only after it has seen the thumb down once; the page's thumb goes up after that.
    readFrom(null, "drawing", false);
    advance(100);
    readFrom(null, "drawing", true);
    advance(600);
    expect(Number(screen.getByTestId("intro-continue").getAttribute("data-progress"))).toBeGreaterThan(0);
    advance(4000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
  });

  it("the shared thumb still rises the intro when no page reader is live", () => {
    const onFinish = vi.fn();
    renderNudge({ onFinish });
    act(() => simulateThumb(false));
    advance(100);
    act(() => simulateThumb(true));
    advance(1200);
    advance(3500);
    expect(onFinish).toHaveBeenCalled();
  });
});
