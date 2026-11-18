import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest } from "@/src/camera/hand-cursor-store";
import { LevelRibbonBookmark } from "@/src/components/level/LevelRibbonBookmark";
import { LEVELS } from "@/src/domain/levels";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import type { HandPose } from "@/src/input/hand-gesture";
import { resetPose, setPose } from "./pose-stub";

// The level list in camera mode: a finger count held on a bab's ring picks that bab (1, 2 or 3 fingers).
// The ring is a GestureRing under each ribbon. The hand is the pose stub: the real hook is replaced, as on the
// other finger-ring screens. Mouse fallback: the ribbon is pulled by hand or by a click, with no ring.
vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./pose-stub");
  return { ...actual, useHandGesture: stub.usePoseStub };
});
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

/** The ring hold time (GestureRing holdMs for a bab). Tests play it through fake timers, never a shorter one. */
const RING_HOLD_MS = 1500;

function setup(props: { isLevelUnlocked?: (stage: number) => boolean; paused?: boolean } = {}) {
  const onSelect = vi.fn();
  render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={onSelect} {...props} />);
  return { onSelect };
}

const ring = (stage: number) => screen.getByTestId(`level-pick-${stage}`) as HTMLElement;
const card = (stage: number) => screen.getByTestId(`level-card-${stage}`) as HTMLElement;

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      vi.advanceTimersByTime(16);
    });
  }
}

/** The ring arms on the empty hand first; then the pose is held for `ms` and released. */
function hold(pose: HandPose, ms: number) {
  advance(64);
  act(() => setPose(pose));
  advance(ms);
  act(() => setPose("none"));
  advance(64);
}

function fakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
}

beforeEach(() => {
  resetInputModeForTest();
  resetHandCursorForTest();
  resetPose();
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("level list, camera mode: a finger count held on a bab's ring picks that bab", () => {
  beforeEach(fakeClock);

  it("one finger fills Bab 1's ring, and no other bab's ring moves", () => {
    setup({ isLevelUnlocked: () => true });
    advance(64);
    act(() => setPose("one-finger"));
    advance(600);
    const pct = Number(ring(1).getAttribute("data-progress"));
    expect(pct).toBeGreaterThan(30);
    expect(pct).toBeLessThan(50);
    expect(ring(1).getAttribute("data-state")).toBe("filling");
    expect(ring(2).getAttribute("data-progress")).toBe("0");
    expect(ring(3).getAttribute("data-progress")).toBe("0");
  });

  it("two fingers fill only Bab 2's ring", () => {
    setup({ isLevelUnlocked: () => true });
    advance(64);
    act(() => setPose("two-fingers"));
    advance(600);
    expect(Number(ring(2).getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(ring(1).getAttribute("data-progress")).toBe("0");
    expect(ring(3).getAttribute("data-progress")).toBe("0");
  });

  it("a hold shorter than the ring drains it and picks nothing", () => {
    const { onSelect } = setup({ isLevelUnlocked: () => true });
    hold("one-finger", 800);
    advance(2000);
    expect(ring(1).getAttribute("data-progress")).toBe("0");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("open palm and pinch pick no bab, however long they are held", () => {
    setup({ isLevelUnlocked: () => true });
    hold("open-palm", 2500);
    hold("pinch", 2500);
    expect(ring(1).getAttribute("data-progress")).toBe("0");
    expect(ring(2).getAttribute("data-progress")).toBe("0");
  });

  it("a locked bab's ring stays grey with a padlock, never fills, and says which bab to finish first", () => {
    const { onSelect } = setup({ isLevelUnlocked: (stage) => stage === 1 });
    hold("two-fingers", 2500);
    expect(ring(2).getAttribute("data-state")).toBe("locked");
    expect(ring(2).querySelector(".gesture-ring__lock")).not.toBeNull();
    expect(ring(2).textContent).toContain("Selesaikan Bab 1 dulu");
    expect(ring(2).getAttribute("data-progress")).toBe("0");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a paused list (a level intro is on top) reads no fingers", () => {
    setup({ paused: true, isLevelUnlocked: () => true });
    hold("one-finger", 2500);
    expect(ring(1).getAttribute("data-state")).toBe("disabled");
    expect(ring(1).getAttribute("data-progress")).toBe("0");
  });

  it("each ring sits under its own ribbon", () => {
    setup({ isLevelUnlocked: () => true });
    for (const level of LEVELS.filter((l) => l.stage <= 3)) {
      expect(card(level.stage).closest(".bm-slot")?.contains(ring(level.stage))).toBe(true);
    }
  });

  it("the ribbon's circle shows as many fingers as its bab number", () => {
    setup({ isLevelUnlocked: () => true });
    for (const stage of [1, 2, 3]) {
      expect(card(stage).querySelectorAll(".bm-ring .finger-glyph rect")).toHaveLength(stage);
    }
  });
});

describe("level list: the next ribbon's thumb follows a page reader instead of a second tracker", () => {
  beforeEach(fakeClock);

  it("a page reader's thumbs-up fills the next ribbon's thumb ring", () => {
    setup({ isLevelUnlocked: () => true });
    for (let t = 0; t < 120; t += 16) {
      act(() => {
        publishHand({ cursor: null, source: "drawing", thumbUp: false });
        vi.advanceTimersByTime(16);
      });
    }
    for (let t = 0; t < 600; t += 16) {
      act(() => {
        publishHand({ cursor: null, source: "drawing", thumbUp: true });
        vi.advanceTimersByTime(16);
      });
    }
    expect(Number(screen.getByTestId("level-thumb-1").getAttribute("data-progress"))).toBeGreaterThan(0);
  });
});

describe("level list, fallback mode: no ring, the ribbon is pulled by hand or a click", () => {
  beforeEach(fakeClock);

  it("there is no finger ring, and the circle shows the arrow, not fingers", () => {
    forceInputMode("fallback");
    setup({ isLevelUnlocked: () => true });
    expect(screen.queryByTestId("level-pick-1")).toBeNull();
    expect(card(1).querySelector(".bm-ring .finger-glyph")).toBeNull();
    expect(card(1).getAttribute("data-mode")).toBe("fallback");
  });

  it("fingers held in fallback mode pick nothing", () => {
    forceInputMode("fallback");
    const { onSelect } = setup({ isLevelUnlocked: () => true });
    hold("one-finger", 2500);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("level list, real clock: the pull animation finishes and starts the level once", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it("one finger held through the ring picks Bab 1: the level starts once, not again while held", async () => {
    const { onSelect } = setup({ isLevelUnlocked: () => true });
    await sleep(100); // the ring arms on the empty hand first
    act(() => setPose("one-finger"));
    await sleep(RING_HOLD_MS - 300);
    expect(onSelect).not.toHaveBeenCalled(); // not yet: the ring needs its full hold
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
    await sleep(1200); // still held: latched
    expect(onSelect).toHaveBeenCalledTimes(1);
    act(() => setPose("none"));
  });

  it("with a mouse click (fallback) the pull animation finishes and starts the level once", async () => {
    forceInputMode("fallback");
    const { onSelect } = setup();
    fireEvent.click(card(1));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });
});
