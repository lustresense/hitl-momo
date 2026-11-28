// @vitest-environment jsdom
/**
 * AUDIO-INT-1 (onboarding area): pure mapping logic and edge detectors, with `@/src/audio` mocked.
 * UNIT_ONLY evidence: nothing here plays a sound; it proves which event ids are requested and when.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const emit = vi.fn();
vi.mock("@/src/audio", () => ({
  audio: { emit: (...args: unknown[]) => emit(...args) },
}));

import gsap from "gsap";
import { MomoEngine } from "@/src/components/momo/momo-engine";
import { R83Bubble } from "@/src/features/shared/R83Bubble";
import { notchRate, shouldSoundRebound } from "@/src/features/level-select/ribbon-audio";
import { advanceFootsteps, STEP_STRIDE_PX } from "@/src/features/tutorial/walk-steps";
import {
  buildCloseCardTimeline,
  buildExitTimeline,
  buildOpenCardTimeline,
  withSilentAudio,
  type TutorialDomRefs,
} from "@/src/features/tutorial/tutorial-animations";
import { computeTutorialLayout, type CardIndex } from "@/src/features/tutorial/tutorial-machine";

const ids = (): string[] => emit.mock.calls.map((c) => String(c[0]));

beforeEach(() => emit.mockClear());
afterEach(() => cleanup());

describe("ribbon pull audio mapping", () => {
  it("maps notch 1..4 to the pentatonic rates and clamps out-of-range notches", () => {
    expect([1, 2, 3, 4].map(notchRate)).toEqual([1, 1.122, 1.26, 1.498]);
    expect(notchRate(0)).toBe(1);
    expect(notchRate(9)).toBe(1.498);
    expect(notchRate(Number.NaN)).toBe(1);
  });

  it("sounds a rebound only for a visible pull (a plain tap and a launch stay silent)", () => {
    expect(shouldSoundRebound({ action: "none" })).toBe(false);
    expect(shouldSoundRebound({ action: "launch", stage: 1, restLength: 300, fromLength: 460 })).toBe(false);
    expect(shouldSoundRebound({ action: "rebound", stage: 1, restLength: 300, fromLength: 300 })).toBe(false);
    expect(shouldSoundRebound({ action: "rebound", stage: 1, restLength: 300, fromLength: 340 })).toBe(true);
    expect(shouldSoundRebound({ action: "rebound-locked", stage: 2, restLength: 200, fromLength: 200, tugged: false, message: "" })).toBe(false);
    expect(shouldSoundRebound({ action: "rebound-locked", stage: 2, restLength: 200, fromLength: 203, tugged: true, message: "" })).toBe(true);
  });
});

describe("footstep stride counter", () => {
  it("gives at most one step per stride and never a burst", () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 100; i++) {
      const r = advanceFootsteps(acc, 1); // 100 px in 1 px frames
      acc = r.acc;
      if (r.step) steps++;
    }
    expect(steps).toBe(Math.floor(100 / STEP_STRIDE_PX));
    expect(advanceFootsteps(0, 500)).toEqual({ acc: 500 % STEP_STRIDE_PX, step: true });
    expect(advanceFootsteps(5, 0)).toEqual({ acc: 5, step: false });
    expect(advanceFootsteps(5, Number.NaN).step).toBe(false);
  });
});

describe("R83Bubble bubble.show edge", () => {
  const rect = { left: 600, top: 300, right: 760, bottom: 560, width: 160, height: 260 };
  it("sounds once when hidden -> visible, not on text swaps, and again after a hide", () => {
    const view = render(<R83Bubble text="Halo" visible={false} getMomoRect={() => rect} />);
    expect(ids()).toEqual([]);
    view.rerender(<R83Bubble text="Halo" visible getMomoRect={() => rect} />);
    expect(ids()).toEqual(["bubble.show"]);
    view.rerender(<R83Bubble text="Baris dua" visible getMomoRect={() => rect} />);
    view.rerender(<R83Bubble text="Baris tiga" visible getMomoRect={() => rect} />);
    expect(ids()).toEqual(["bubble.show"]);
    view.rerender(<R83Bubble text="Baris tiga" visible={false} getMomoRect={() => rect} />);
    view.rerender(<R83Bubble text="Lagi" visible getMomoRect={() => rect} />);
    expect(ids()).toEqual(["bubble.show", "bubble.show"]);
  });
});

describe("MomoEngine sounds", () => {
  it("emits momo.flap and momo.wave for the discrete wing actions only", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const engine = new MomoEngine(host);
    engine.set("Senang", true);
    engine.sleep(true);
    engine.wake("Tenang");
    expect(ids()).toEqual([]); // sleep, wake, mood changes: Momo is silent
    engine.flap();
    engine.wave();
    expect(ids()).toEqual(["momo.flap", "momo.wave"]);
    engine.destroy();
    host.remove();
  });
});

function makeRefs(): TutorialDomRefs {
  const mk = <T extends HTMLElement>(tag: string): T => document.body.appendChild(document.createElement(tag)) as T;
  const col = <T extends HTMLElement>(tag: string): { current: Array<T | null> } => ({ current: [mk<T>(tag), mk<T>(tag), mk<T>(tag)] });
  return {
    cardRefs: col<HTMLElement>("article"),
    flipRefs: col<HTMLDivElement>("div"),
    playRefs: col<HTMLElement>("section"),
    doneRefs: col<HTMLSpanElement>("span"),
  };
}

describe("tutorial card timeline sounds", () => {
  const layout = computeTutorialLayout(1280, 720);
  const idx: CardIndex = 1;

  it("open: flip at the start, bifold at its own beat", () => {
    const tl = buildOpenCardTimeline(makeRefs(), layout, idx, () => undefined);
    tl.progress(1);
    expect(ids()).toEqual(["card.flip", "card.bifold"]);
    tl.kill();
  });

  it("close: fold sound then the done stamp; the exit adds the card.exit whoosh", () => {
    const refs = makeRefs();
    const close = buildCloseCardTimeline(refs, layout, idx, () => undefined);
    close.progress(1);
    expect(ids()).toEqual(["card.close", "card.stamp"]);
    close.kill();
    emit.mockClear();
    const exit = buildExitTimeline(refs, null, layout, () => undefined, () => undefined);
    exit.progress(1);
    expect(ids()).toEqual(["card.close", "card.stamp", "card.exit"]);
    exit.kill();
  });

  it("a dev skip fast-forward (progress(1) inside withSilentAudio) fires nothing", () => {
    const tl = buildOpenCardTimeline(makeRefs(), layout, idx, () => undefined);
    withSilentAudio(() => tl.progress(1));
    expect(ids()).toEqual([]);
    tl.kill();
    // The silence is scoped: the next real timeline sounds again.
    const next = buildOpenCardTimeline(makeRefs(), layout, idx, () => undefined);
    next.progress(1);
    expect(ids()).toEqual(["card.flip", "card.bifold"]);
    next.kill();
    gsap.globalTimeline.clear();
  });
});
