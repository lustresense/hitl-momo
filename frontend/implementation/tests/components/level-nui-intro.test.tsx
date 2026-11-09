import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, type HandCursorPoint, type HandSource } from "@/src/camera/hand-cursor-store";
import { acquireThumbTracker, resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";
import { LevelIntro } from "@/src/components/level/LevelIntro";
import { LEVELS } from "@/src/domain/levels";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, type Box } from "./gesture-stub";

// The level intro is NUI too: the picture cards and the skip are dwell controls, and its "Ke langit" thumb follows a
// page reader when the drawing page under the intro runs one (no second tracker, nui-no-second-reader.test.tsx).
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

const level = LEVELS[0]!;
const CARD_BOX = (i: number): Box => ({ left: 40 + i * 150, top: 520, width: 130, height: 90 });
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

/** Reduced motion: the story goes straight on, and skip or the thumb finishes at once. */
function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
}

/** Renders the intro and lets Momo finish her story, so the picture cards and the thumb are on screen. */
function renderNudge(props: { onFinish?: () => void } = {}) {
  const onFinish = props.onFinish ?? vi.fn();
  render(<LevelIntro level={level} onFinish={onFinish} />);
  advance(9000);
  const cards = level.catalog.map((item, i) => {
    const el = screen.getByTestId(`intro-card-${item.labelId}`);
    placeBox(el, CARD_BOX(i));
    return el;
  });
  placeBox(screen.getByTestId("intro-skip"), SKIP_BOX);
  return { onFinish, cards };
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

describe("level intro, camera mode: the picture cards and the skip are dwell controls", () => {
  it("a fingertip resting 1.2 s on a picture card picks it, and the intro does not rise", () => {
    const { onFinish, cards } = renderNudge();
    expect(cards[0]!.getAttribute("data-mode")).toBe("camera");
    readFrom(null);
    advance(50);
    readFrom(at(CARD_BOX(0)));
    advance(1300);
    expect(cards[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("level-intro").getAttribute("data-picked")).toBe(level.catalog[0]!.labelId);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("only one picture card fills under the fingertip", () => {
    const { cards } = renderNudge();
    readFrom(null);
    advance(50);
    readFrom(at(CARD_BOX(1)));
    advance(600);
    expect(Number(cards[1]!.getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(cards[0]!.getAttribute("data-progress")).toBe("0");
  });

  it("a resting fingertip on Lewati cerita 1.2 s ends the intro", () => {
    const { onFinish } = renderNudge();
    readFrom(null);
    advance(50);
    readFrom(at(SKIP_BOX));
    advance(1300);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("level intro, fallback mode: a click picks a card or skips at once", () => {
  it("a click on a picture card picks it with no ring", () => {
    forceInputMode("fallback");
    const { cards } = renderNudge();
    expect(cards[0]!.getAttribute("data-mode")).toBe("fallback");
    fireEvent.click(cards[0]!);
    expect(cards[0]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("a click on Lewati cerita ends the intro", () => {
    forceInputMode("fallback");
    const { onFinish } = renderNudge();
    fireEvent.click(screen.getByTestId("intro-skip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("level intro: the Ke langit thumb never starts a second tracker", () => {
  it("with no page reader the thumb starts the shared tracker", () => {
    renderNudge();
    expect(vi.mocked(acquireThumbTracker)).toHaveBeenCalled();
  });

  it("with the drawing page's reader live, the thumb follows its thumbs-up and starts no tracker", () => {
    const onFinish = vi.fn();
    readFrom(null, "drawing", false);
    renderNudge({ onFinish });
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
    readFrom(null, "drawing", true);
    advance(600);
    expect(Number(screen.getByTestId("intro-continue").getAttribute("data-progress"))).toBeGreaterThan(0);
    advance(1000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
  });

  it("the shared thumb still rises the intro when no page reader is live", () => {
    const onFinish = vi.fn();
    renderNudge({ onFinish });
    act(() => simulateThumb(true));
    advance(1500);
    expect(onFinish).toHaveBeenCalled();
  });
});
