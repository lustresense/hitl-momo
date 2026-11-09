import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, type HandCursorPoint, type HandSource } from "@/src/camera/hand-cursor-store";
import { acquireThumbTracker } from "@/src/camera/thumb-tracker";
import { LevelRibbonBookmark } from "@/src/components/level/LevelRibbonBookmark";
import { LEVELS } from "@/src/domain/levels";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, type Box } from "./gesture-stub";

// The level list is the NUI screen of the level pick: a resting fingertip pulls a ribbon, a click pulls it at once.
// Like every dwell control, the ribbons read the one shared hand cursor and start the shared tracker only when no
// page reader is on the screen (see nui-no-second-reader.test.tsx).
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

/** Ribbon i sits at its own column, so a fingertip can rest on exactly one of them. */
const BOX = (i: number): Box => ({ left: 40 + i * 220, top: 200, width: 160, height: 300 });
const at = (box: Box) => cursorAtPx(box.left + box.width / 2, box.top + box.height / 2);
const OUTSIDE = cursorAtPx(5, 5);

/** The fingertip source the test plays: a page reader (drawing) or the shared tracker (no page reader). */
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
const card = (stage: number) => screen.getByTestId(`level-card-${stage}`) as HTMLElement;

function setup(props: { isLevelUnlocked?: (stage: number) => boolean; paused?: boolean } = {}) {
  const onSelect = vi.fn();
  render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={onSelect} {...props} />);
  for (let i = 0; i < LEVELS.length; i++) placeBox(card(LEVELS[i]!.stage), BOX(i));
  return { onSelect };
}

function fakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
}

beforeEach(() => {
  resetInputModeForTest();
  resetHandCursorForTest();
  reader = null;
  vi.mocked(acquireThumbTracker).mockClear();
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("level list, camera mode: a resting fingertip shows the ring and picks a ribbon", () => {
  beforeEach(fakeClock);

  it("the ring fills on the ribbon while the fingertip rests there", () => {
    setup();
    readFrom(null);
    advance(50);
    readFrom(at(BOX(0)));
    advance(600);
    const pct = Number(card(1).getAttribute("data-progress"));
    expect(pct).toBeGreaterThan(40);
    expect(pct).toBeLessThan(60);
    expect(card(1).getAttribute("data-mode")).toBe("camera");
    // The ring is drawn on the ribbon's pull ring.
    expect(card(1).querySelector(".bm-ring .bm-dwell")).not.toBeNull();
  });

  it("only the ribbon under the fingertip fills; its neighbour stays empty", () => {
    setup({ isLevelUnlocked: () => true });
    readFrom(null);
    advance(50);
    readFrom(at(BOX(1)));
    advance(600);
    expect(Number(card(2).getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(card(1).getAttribute("data-progress")).toBe("0");
    expect(card(3).getAttribute("data-progress")).toBe("0");
  });

  it("a resting fingertip on a locked ribbon says what to finish first and starts nothing", () => {
    const { onSelect } = setup({ isLevelUnlocked: (stage) => stage === 1 });
    readFrom(null);
    advance(50);
    readFrom(at(BOX(1)));
    advance(1300);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Selesaikan Bab 1 dulu");
  });

  it("a paused list (a level intro plays above it) does not read the hand at all", () => {
    const { onSelect } = setup({ paused: true });
    readFrom(null);
    advance(50);
    readFrom(at(BOX(0)));
    advance(1600);
    expect(onSelect).not.toHaveBeenCalled();
    expect(card(1).getAttribute("data-progress")).toBe("0");
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
  });
});

describe("level list, fallback mode: a click pulls the ribbon, no ring", () => {
  beforeEach(fakeClock);

  it("a resting fingertip shows nothing (no ring, no dwell)", () => {
    forceInputMode("fallback");
    const { onSelect } = setup();
    readFrom(null);
    advance(50);
    readFrom(at(BOX(0)));
    advance(1600);
    expect(onSelect).not.toHaveBeenCalled();
    expect(card(1).getAttribute("data-mode")).toBe("fallback");
    expect(card(1).querySelector(".bm-dwell")).toBeNull();
  });
});

describe("level list starts at most one hand tracker", () => {
  beforeEach(fakeClock);

  it("with no page reader the ribbons start the shared tracker after the short wait", () => {
    setup();
    advance(400);
    expect(vi.mocked(acquireThumbTracker)).toHaveBeenCalled();
  });

  it("with a page reader on the screen no ribbon starts a tracker, not even the next ribbon's thumb", () => {
    readFrom(null, "drawing");
    setup();
    advance(1000);
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
  });

  it("the next ribbon's thumb follows a page reader's thumbs-up instead of a second tracker", () => {
    readFrom(null, "drawing", false);
    setup();
    advance(100); // the thumb ring arms after it has seen no thumb once
    readFrom(null, "drawing", true);
    advance(600);
    expect(Number(screen.getByTestId("level-thumb-1").getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(vi.mocked(acquireThumbTracker)).not.toHaveBeenCalled();
  });
});

// GSAP ticks on the animation frame it captured at load, so the pull animation itself runs on the real clock
// (as in ribbon-pull.test.tsx). The fingertip is played by a real interval here.
describe("level list, real clock: the pull animation finishes and starts the level once", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it("a fingertip resting 1.2 s on an open ribbon pulls it: the level starts once, not again while it rests", async () => {
    const { onSelect } = setup();
    let cursor: HandCursorPoint | null = OUTSIDE;
    const tick = setInterval(() => act(() => publishHand({ cursor, source: "tracker" })), 16);
    try {
      await sleep(100); // arms: the fingertip has been outside once
      cursor = at(BOX(0));
      await sleep(900);
      expect(onSelect).not.toHaveBeenCalled(); // not yet: the dwell is 1.2 s
      await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 4000 });
      expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
      await sleep(1500); // still resting on the ribbon: latched
      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      clearInterval(tick);
    }
  });

  it("with a mouse click (fallback) the pull animation finishes and starts the level once", async () => {
    forceInputMode("fallback");
    const { onSelect } = setup();
    fireEvent.click(card(1));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });
});
