import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LevelIntro } from "@/src/components/level/LevelIntro";
import { dwellMs } from "@/src/components/momo/MomoChat";
import { LEVELS } from "@/src/domain/levels";
import { NUDGE_TO_SKY } from "@/src/domain/world-intro-script";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

// GSAP does not tick under fake timers in jsdom, so the tweens are recorded and their end is played by hand.
// Owner 2026-11-10 (CAN-UX-STORYBOARD scene 14): the thumb comes only after Momo's last line is typed and read, and
// then Momo flies up over the full normal time. Nothing rises on its own. Timers are never shortened for the tests.
const gs = vi.hoisted(() => {
  interface Tween { target: unknown; vars: Record<string, unknown>; at: number; duration: number }
  class FakeTimeline {
    tweens: Tween[] = [];
    onComplete?: () => void;
    killed = false;
    constructor(vars: { onComplete?: () => void } = {}) {
      this.onComplete = vars.onComplete;
      timelines.push(this);
    }
    private end() {
      return Math.max(0, ...this.tweens.map((t) => t.at + t.duration));
    }
    private add(target: unknown, vars: Record<string, unknown>, at?: number) {
      const duration = typeof vars.duration === "number" ? vars.duration : 0;
      this.tweens.push({ target, vars, at: at ?? this.end(), duration });
      return this;
    }
    to(target: unknown, vars: Record<string, unknown>, at?: number) {
      return this.add(target, vars, at);
    }
    fromTo(target: unknown, _from: Record<string, unknown>, vars: Record<string, unknown>, at?: number) {
      return this.add(target, vars, at);
    }
    /** Chained helpers the avatar's idle timeline uses (momo-engine.ts); they only need to return the timeline. */
    call(_fn: () => void, _args?: unknown, at?: number) {
      return this.add(null, {}, at);
    }
    set(target: unknown, vars: Record<string, unknown>, at?: number) {
      return this.add(target, vars, at);
    }
    timeScale() {
      return this;
    }
    kill() {
      this.killed = true;
    }
    /** Plays the timeline to its end, as the browser would. */
    play() {
      this.onComplete?.();
    }
  }
  const timelines: FakeTimeline[] = [];
  const tweens: Array<{ target: unknown; vars: Record<string, unknown> }> = [];
  const tweenStub = {
    kill() {},
    pause() {},
    play() {},
    progress() { return 0; },
    timeScale() { return tweenStub; },
    repeat() { return tweenStub; },
    yoyo() { return tweenStub; },
    duration() { return 0; },
    paused() { return false; },
  };
  const gsap = {
    set: vi.fn(),
    killTweensOf: vi.fn(),
    timeline: vi.fn((vars?: { onComplete?: () => void }) => new FakeTimeline(vars)),
    to: vi.fn((target: unknown, vars: Record<string, unknown>) => {
      tweens.push({ target, vars });
      return tweenStub;
    }),
    fromTo: vi.fn(),
    // Used by the avatar's idle loop (momo-engine.ts).
    delayedCall: vi.fn(() => tweenStub),
    ticker: { add: vi.fn(), remove: vi.fn() },
  };
  return { gsap, timelines, tweens, FakeTimeline };
});

vi.mock("gsap", () => ({ gsap: gs.gsap, default: gs.gsap }));
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

// Fine steps: React flushes a timer's next stage only between steps, so coarse steps would stretch the typing and
// shorten the reading pauses. 10 ms keeps the measured pauses true to the timings.
const STEP = 10;
const level = LEVELS[0]!;

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

function advance(ms: number) {
  for (let t = 0; t < ms; t += STEP) act(() => { vi.advanceTimersByTime(STEP); });
}

const rootPhase = () => screen.getByTestId("level-intro").getAttribute("data-phase");
const rootFocus = () => screen.getByTestId("level-intro").getAttribute("data-focus");

/** The timeline that lifts Momo: the one holding the camera tween. */
function riseTimeline() {
  const camera = document.querySelector(".intro-camera");
  return gs.timelines.find((tl) => tl.tweens.some((t) => t.target === camera)) ?? null;
}

/**
 * Runs the intro until the thumb is on screen. Reports when the last line was typed out in full (the reading pause
 * runs after that) and every focus Momo talked about on the way.
 */
function runUntilThumb(limit = 180000) {
  let typedAt: number | null = null;
  const focuses = new Set<string | null>();
  for (let t = 0; t <= limit; t += STEP) {
    if (typedAt === null && document.body.textContent?.includes(NUDGE_TO_SKY)) typedAt = t;
    if (screen.queryByTestId("level-intro")) focuses.add(rootFocus());
    if (screen.queryByTestId("intro-continue")) return { appearedAt: t, finishedAt: typedAt, focuses };
    advance(STEP);
  }
  throw new Error("the thumb never appeared");
}

/**
 * A thumb raised on a ring: the ring arms only after it has seen "no thumb" once (ThumbConfirm), so the thumb is
 * down for a moment first, as it is in a real hand. Then it is raised and held past the 1 s ring.
 */
function raiseThumb() {
  act(() => simulateThumb(false));
  advance(100);
  act(() => simulateThumb(true));
  advance(1200);
}

/** Renders the intro with its opening (book and fly-in) already played, as on a real screen. */
function renderIntro(onFinish = vi.fn()) {
  render(<LevelIntro level={level} onFinish={onFinish} />);
  act(() => gs.timelines[0]?.play());
  return onFinish;
}

beforeEach(() => {
  stubMotion(false);
  gs.timelines.length = 0;
  gs.tweens.length = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetThumbTrackerForTest();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("level intro: the thumb waits for Momo's words", () => {
  it("the thumb appears only after the last line is typed and its reading pause has passed", () => {
    renderIntro();
    const { appearedAt, finishedAt } = runUntilThumb();
    expect(finishedAt).not.toBeNull();
    expect(appearedAt - finishedAt!).toBeGreaterThanOrEqual(dwellMs(NUDGE_TO_SKY) - STEP);
  });

  it("the thumb is labelled Aku mengerti, not Ke langit", () => {
    renderIntro();
    runUntilThumb();
    expect(screen.getByTestId("intro-continue").getAttribute("aria-label")).toBe("Aku mengerti");
  });

  it("the story waits 1.5 s before Momo's first line, at normal length", () => {
    render(<LevelIntro level={level} onFinish={vi.fn()} />);
    advance(1400);
    expect(document.querySelector(".momo-bubble")).toBeNull();
    advance(1000);
    expect(document.querySelector(".momo-bubble")).not.toBeNull();
  });

  it("there are no picture cards in the intro (they moved to the drawing screen)", () => {
    renderIntro();
    runUntilThumb();
    expect(screen.queryByTestId("intro-cards")).toBeNull();
    expect(document.querySelector("[data-testid^=intro-card-]")).toBeNull();
  });
});

describe("level intro: Momo moves to what she talks about, with a dark stage", () => {
  it("Momo talks about Thinman first and then about the gap, gliding between them", () => {
    renderIntro();
    const { focuses } = runUntilThumb();
    expect(focuses.has("thinman")).toBe(true);
    expect(focuses.has("ahead")).toBe(true);
    const momo = document.querySelector(".intro-momo");
    expect(gs.tweens.some((t) => t.target === momo && t.vars.duration === 1.1)).toBe(true);
  });

  it("the stage has a dark backdrop element during the story", () => {
    renderIntro();
    expect(screen.getByTestId("intro-dim")).toBeTruthy();
    expect(rootPhase()).toBe("story");
  });

  it("Momo is 290 px tall and flies in from a smaller size, coming forward", () => {
    render(<LevelIntro level={level} onFinish={vi.fn()} />);
    const avatar = document.querySelector<HTMLElement>(".momo-chat__avatar");
    expect(avatar?.style.height).toBe("290px");
    const fly = gs.timelines[0]!.tweens.find((t) => t.vars.opacity === 1)!;
    expect(fly.vars.scale).toBe(1);
    expect(gs.gsap.set.mock.calls.some(([, vars]) => (vars as { scale?: number }).scale === 0.82)).toBe(true);
  });
});

describe("level intro: Momo flies up only after the thumb", () => {
  it("without a thumb Momo never rises on her own, however long she waits", () => {
    const onFinish = renderIntro();
    runUntilThumb();
    advance(30000);
    expect(rootPhase()).toBe("nudge");
    expect(screen.getByTestId("intro-continue")).toBeTruthy();
    expect(riseTimeline()).toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("a thumb lifts Momo and the camera over the normal flight, and hands over only when it lands", () => {
    const onFinish = renderIntro();
    runUntilThumb();
    raiseThumb();
    const tl = riseTimeline();
    expect(rootPhase()).toBe("rise");
    expect(tl).not.toBeNull();
    const camera = tl!.tweens.find((t) => t.vars.yPercent === 0)!;
    const momo = tl!.tweens.find((t) => t.vars.y === 0 && t.vars.x === 0)!;
    expect(camera.duration).toBe(2.1);
    expect(momo.duration).toBe(1.15);
    expect(momo.at).toBe(0.28);
    expect(onFinish).not.toHaveBeenCalled();
    act(() => tl!.play());
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("the hand-over has no fade: the root is never tweened to transparent", () => {
    const onFinish = renderIntro();
    runUntilThumb();
    raiseThumb();
    const root = screen.getByTestId("level-intro");
    act(() => riseTimeline()!.play());
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(gs.tweens.some((t) => t.target === root && "opacity" in t.vars)).toBe(false);
  });

  it("reduced motion keeps the same flight length, without the repeated wobble", () => {
    stubMotion(true);
    const onFinish = renderIntro();
    runUntilThumb();
    raiseThumb();
    const tl = riseTimeline();
    expect(tl).not.toBeNull();
    expect(tl!.tweens.find((t) => t.vars.yPercent === 0)!.duration).toBe(2.1);
    expect(tl!.tweens.find((t) => t.vars.y === 0 && t.vars.x === 0)!.duration).toBe(1.15);
    expect(tl!.tweens.some((t) => "rotation" in t.vars)).toBe(false);
    expect(onFinish).not.toHaveBeenCalled();
    act(() => tl!.play());
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("reduced motion still flies Momo in over the normal 0.95 s, not a snap to her place", () => {
    stubMotion(true);
    render(<LevelIntro level={level} onFinish={vi.fn()} />);
    const fly = gs.timelines[0]!.tweens.find((t) => t.vars.opacity === 1)!;
    expect(fly.duration).toBe(0.95);
    expect(fly.at).toBe(0);
  });

  it("unmounting kills the intro timelines, so nothing fires later", () => {
    render(<LevelIntro level={level} onFinish={vi.fn()} />);
    const fly = gs.timelines[0]!;
    cleanup();
    expect(fly.killed).toBe(true);
  });
});
