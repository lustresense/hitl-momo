// @vitest-environment jsdom
import fs from "fs";
import path from "path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import gsap from "gsap";
import { cleanup, render } from "@testing-library/react";
import { MomoEngine, MOMO_WAKE_MS } from "@/src/components/momo/momo-engine";
import { MomoAvatar } from "@/src/components/momo/MomoAvatar";

/** Only the reduced-motion query matches, as on a student's device with that setting on. */
function setReducedMotion(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

interface Internals {
  F: Record<string, number>;
  mo: Record<string, number>;
  breath: number;
  bob: number;
  tilt: number;
  step(dt: number): void;
}

const internals = (e: MomoEngine) => e as unknown as Internals;
let engine: MomoEngine | null = null;

beforeAll(() => {
  // Time is driven by the tests only (gsap.updateRoot), never by the real clock, so the numbers below are exact.
  gsap.ticker.sleep();
});
afterEach(() => {
  engine?.destroy();
  engine = null;
  cleanup();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

function makeMomo(reduced: boolean): MomoEngine {
  setReducedMotion(reduced);
  const host = document.createElement("div");
  document.body.appendChild(host);
  engine = new MomoEngine(host);
  return engine;
}

/** Moves the clock forward and redraws the frame, as the ticker would. */
function advance(e: MomoEngine, ms: number) {
  gsap.updateRoot(gsap.globalTimeline.time() + ms / 1000);
  internals(e).step(0.016);
}

/** The body's vertical scale as the SVG transform has it now. */
function scaleY(e: MomoEngine): number {
  const root = (e as unknown as { g: Record<string, SVGElement> }).g.root!;
  const m = root.getAttribute("transform")!.match(/scale\(([-\d.]+) ([-\d.]+)\)/)!;
  return Number(m[2]);
}
function scaleX(e: MomoEngine): number {
  const root = (e as unknown as { g: Record<string, SVGElement> }).g.root!;
  const m = root.getAttribute("transform")!.match(/scale\(([-\d.]+) ([-\d.]+)\)/)!;
  return Number(m[1]);
}

/** Samples the body scale every 100 ms over `ms`. */
function sampleScaleY(e: MomoEngine, ms: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= ms; t += 100) {
    advance(e, t === 0 ? 0 : 100);
    out.push(scaleY(e));
  }
  return out;
}

describe("Momo asleep breathes (the Owner: the sleep must be a real animation)", () => {
  it("the body swells and shrinks slowly while she sleeps", () => {
    const e = makeMomo(false);
    e.sleep();
    // From the start: the trough is at 0 s and 4.2 s, the peak at 2.1 s.
    const values = sampleScaleY(e, 4400);
    expect(Math.max(...values)).toBeGreaterThan(1.012);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.016);
    expect(Math.min(...values)).toBeLessThan(1.002);
    // It breathes in and out: the scale goes up and comes back down within one 2.1 s cycle.
    expect(values.indexOf(Math.max(...values))).toBeGreaterThan(0);
    expect(values.at(-1)!).toBeLessThan(Math.max(...values));
  });

  it("the body gets narrower as it gets taller (scaleX = 1 - 0.6 x breath)", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    const pairs: Array<[number, number]> = [];
    for (let t = 0; t < 2400; t += 100) {
      advance(e, 100);
      pairs.push([scaleY(e), scaleX(e)]);
    }
    const top = pairs.reduce((a, b) => (b[0] > a[0] ? b : a));
    expect(top[0]).toBeGreaterThan(1.012);
    expect(top[1]).toBeLessThan(1);
  });

  it("the breath keeps going in reduced motion, at 60 % (a swell of about 0.9 %, enough to see)", () => {
    const e = makeMomo(true);
    e.sleep();
    const values = sampleScaleY(e, 4400);
    expect(Math.max(...values)).toBeGreaterThan(1.008);
    expect(Math.max(...values)).toBeLessThan(1.01);
    expect(Math.min(...values)).toBeLessThan(1.001);
  });

  it("the wings droop slowly while she sleeps, between 8 and 12", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000); // the wings reach 8 first (the set() tween takes 0.7 s), then the sag runs
    const seen: number[] = [];
    for (let t = 0; t <= 6000; t += 100) {
      advance(e, t === 0 ? 0 : 100);
      seen.push(internals(e).mo.fl!);
    }
    expect(Math.min(...seen)).toBeCloseTo(8, 0);
    expect(Math.max(...seen)).toBeCloseTo(12, 0);
  });

  it("the wings droop slowly in reduced motion too", () => {
    const e = makeMomo(true);
    e.sleep();
    advance(e, 1500);
    const a = internals(e).mo.fl!;
    advance(e, 1500);
    expect(internals(e).mo.fl!).not.toBeCloseTo(a, 2);
  });
});

describe("Momo asleep floats: she rises and sinks 7 px and leans 2 degrees, one 4 s cycle", () => {
  /** Samples the float every 100 ms for 4 s: t = 0 is when she fell asleep. */
  function sampleFloat(e: MomoEngine) {
    const bob: number[] = [];
    const tilt: number[] = [];
    for (let t = 0; t <= 4000; t += 100) {
      advance(e, t === 0 ? 0 : 100);
      bob.push(internals(e).bob);
      tilt.push(internals(e).tilt);
    }
    return { bob, tilt };
  }

  it("rises 3.5 px at 1 s, sinks 3.5 px at 3 s and is back at rest at 4 s", () => {
    const e = makeMomo(false);
    e.sleep();
    const { bob } = sampleFloat(e);
    expect(bob[0]).toBeCloseTo(0, 3);
    expect(bob[10]).toBeCloseTo(3.5, 2);
    expect(bob[30]).toBeCloseTo(-3.5, 2);
    expect(bob[40]).toBeCloseTo(0, 2);
  });

  it("leans 2 degrees either way over the same 4 s cycle", () => {
    const e = makeMomo(false);
    e.sleep();
    const { tilt } = sampleFloat(e);
    expect(Math.max(...tilt)).toBeCloseTo(2, 2);
    expect(Math.min(...tilt)).toBeCloseTo(-2, 2);
    expect(tilt[40]).toBeCloseTo(0, 2);
  });

  it("reduced motion: the float keeps going at 60 % (about 2.1 px and 1.2 degrees)", () => {
    const e = makeMomo(true);
    e.sleep();
    const { bob, tilt } = sampleFloat(e);
    expect(Math.max(...bob)).toBeCloseTo(3.5 * 0.6, 2);
    expect(Math.min(...bob)).toBeCloseTo(-3.5 * 0.6, 2);
    expect(Math.max(...tilt)).toBeCloseTo(2 * 0.6, 2);
  });

  it("a new expression stops the float at once: she is back at rest", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    expect(internals(e).bob).toBeGreaterThan(3);
    e.set("Senang");
    expect(internals(e).bob).toBe(0);
    expect(internals(e).tilt).toBe(0);
    advance(e, 2400);
    expect(internals(e).bob).toBe(0);
  });

  it("waking settles the float to rest over the wake and it does not come back", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    e.wake("Tenang");
    advance(e, MOMO_WAKE_MS + 600);
    const after = sampleFloat(e);
    expect(Math.max(...after.bob.map(Math.abs))).toBeLessThan(0.001);
    expect(Math.max(...after.tilt.map(Math.abs))).toBeLessThan(0.001);
  });
});

describe("Momo wakes up with blinks", () => {
  it("wake() blinks the eyelids before the expression is set", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    const set = vi.spyOn(e, "set");
    e.wake("Senang");
    const eyes: number[] = [];
    let setAt = -1;
    for (let t = 0; t <= MOMO_WAKE_MS + 50; t += 10) {
      advance(e, t === 0 ? 0 : 10);
      eyes.push(internals(e).F.el!);
      if (setAt < 0 && set.mock.calls.length > 0) setAt = t;
    }
    // Eyelids open, close, open, close, then open fully: two blinks before she is awake.
    let dips = 0;
    let peaked = false;
    for (const v of eyes) {
      if (v >= 0.3) peaked = true;
      if (peaked && v <= 0.02) { dips++; peaked = false; }
    }
    expect(dips).toBeGreaterThanOrEqual(2);
    expect(setAt).toBeGreaterThanOrEqual(MOMO_WAKE_MS - 10);
    expect(eyes.at(-1)!).toBeCloseTo(1, 2);
    expect(set).toHaveBeenCalledWith("Senang");
  });

  it("the wake timeline lasts MOMO_WAKE_MS", () => {
    expect(MOMO_WAKE_MS).toBe(810);
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    e.wake("Tenang");
    const tl = (e as unknown as { wkt: gsap.core.Timeline }).wkt;
    expect(Math.round(tl.duration() * 1000)).toBe(MOMO_WAKE_MS);
  });

  it("the breath stops after she is awake: the body is back to its normal scale and stays there", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    e.wake("Tenang");
    advance(e, MOMO_WAKE_MS + 600);
    const after = sampleScaleY(e, 2400);
    expect(Math.max(...after) - Math.min(...after)).toBeLessThan(0.0005);
    expect(after.at(-1)!).toBeCloseTo(1, 3);
  });

  it("a wake while still asleep is not repeated by a second sleep call", () => {
    const e = makeMomo(false);
    e.sleep();
    advance(e, 1000);
    e.wake("Senang");
    advance(e, 200);
    e.sleep(); // back asleep mid-wake: the wake is dropped, the eyes close again
    advance(e, 1000);
    expect(internals(e).F.el!).toBeCloseTo(0, 2);
  });
});

describe("MomoAvatar wakes her with the wake sequence", () => {
  it("going from sleeping to awake calls wake() with the current expression", () => {
    const wake = vi.spyOn(MomoEngine.prototype, "wake");
    setReducedMotion(false);
    const { rerender } = render(<MomoAvatar expression="Senang" sleeping />);
    expect(wake).not.toHaveBeenCalled();
    rerender(<MomoAvatar expression="Senang" sleeping={false} />);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith("Senang");
    wake.mockRestore();
  });
});

describe("Zzz over the sleeping Momo with reduced motion", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "app/styles/100-guide.css"), "utf8");
  // The reduced-motion rules are a block from the media query to the end of the file (R12-02).
  const mediaAt = css.search(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.momo-guide__zzz/);
  const reducedLine = mediaAt >= 0 ? css.slice(mediaAt) : "";

  it("keeps all three letters on screen (not one frozen letter)", () => {
    expect(reducedLine).not.toBe("");
    expect(reducedLine).not.toMatch(/display:\s*none/);
  });

  it("the three letters rise and fade over 4.8 s in reduced motion (a short rise, not a frozen letter)", () => {
    expect(reducedLine).toMatch(/animation:\s*momo-zzz-soft\s+4\.8s/);
    const frames = css.match(/@keyframes momo-zzz-soft\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(frames).not.toBe("");
    expect(frames).toMatch(/transform:\s*translate\([^)]*-\d/);
    expect(frames).toMatch(/opacity/);
  });
});
