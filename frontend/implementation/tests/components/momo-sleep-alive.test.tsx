// @vitest-environment jsdom
import fs from "fs";
import path from "path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import gsap from "gsap";
import { cleanup, render } from "@testing-library/react";
import { MomoEngine } from "@/src/components/momo/momo-engine";
import { MomoGuide } from "@/src/components/momo/MomoGuide";

/** Only the reduced-motion query matches: the Owner's laptop with "Animation effects" off. */
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
  breath: number;
  bob: number;
  tilt: number;
  P: { r: number };
  step(dt: number): void;
}
const internals = (e: MomoEngine) => e as unknown as Internals;

let engine: MomoEngine | null = null;

beforeAll(() => {
  // The clock is driven by the tests only, so the numbers are exact (same as momo-sleep-wake.test.tsx).
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

/** Moves the clock forward and redraws one frame, as the ticker would. */
function advance(e: MomoEngine, ms: number) {
  gsap.updateRoot(gsap.globalTimeline.time() + ms / 1000);
  internals(e).step(0.016);
}

function scaleY(e: MomoEngine): number {
  const root = (e as unknown as { g: Record<string, SVGElement> }).g.root!;
  return Number(root.getAttribute("transform")!.match(/scale\([-\d.]+ ([-\d.]+)\)/)![1]);
}

const css = fs.readFileSync(path.join(process.cwd(), "app/styles/100-guide.css"), "utf8");
/** The reduced-motion Zzz rules: from the media query that starts them to the end of the file. */
function reducedZzzCss(): string {
  const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.momo-guide__zzz/);
  return m ? css.slice(m.index!) : "";
}

describe("Sleeping Momo stays visibly alive with reduced motion (R12-02)", () => {
  it("the breath swells the body by about 0.9 % (about 2 px on the 250 px cover Momo), not 0.5 %", () => {
    const e = makeMomo(true);
    e.sleep();
    const values: number[] = [];
    for (let t = 0; t <= 4400; t += 100) {
      advance(e, t === 0 ? 0 : 100);
      values.push(scaleY(e));
    }
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThanOrEqual(0.008);
  });

  it("the float rises and sinks at least 2 px each way in reduced motion", () => {
    const e = makeMomo(true);
    e.sleep();
    const bob: number[] = [];
    for (let t = 0; t <= 4000; t += 100) {
      advance(e, t === 0 ? 0 : 100);
      bob.push(internals(e).bob);
    }
    expect(Math.max(...bob)).toBeGreaterThanOrEqual(2);
    expect(Math.min(...bob)).toBeLessThanOrEqual(-2);
  });

  it("the nod (Ngantuk) still tilts her by at least 5 degrees in reduced motion", () => {
    const e = makeMomo(true);
    e.sleep();
    let peak = 0;
    for (let t = 0; t <= 1400; t += 50) {
      advance(e, t === 0 ? 0 : 50);
      peak = Math.max(peak, Math.abs(internals(e).P.r));
    }
    expect(peak).toBeGreaterThanOrEqual(5);
  });

  it("the sleep never freezes: the body is still moving between two frames 1 s apart", () => {
    const e = makeMomo(true);
    e.sleep();
    advance(e, 1000);
    const a = scaleY(e);
    advance(e, 1000);
    expect(scaleY(e)).not.toBeCloseTo(a, 5);
  });
});

describe("Zzz over sleeping Momo with reduced motion (R12-02)", () => {
  it("renders three letters over the sleeping Momo", () => {
    setReducedMotion(true);
    const { container } = render(<MomoGuide step={null} sleeping testId="zzz-test" />);
    const letters = Array.from(container.querySelectorAll(".momo-guide__zzz i")).map((i) => i.textContent);
    expect(letters).toEqual(["z", "z", "Z"]);
    cleanup();
  });

  it("the second and third letters have their own offset, so they do not stack into one z", () => {
    const reduced = reducedZzzCss();
    expect(reduced).not.toBe("");
    expect(reduced).toMatch(/\.momo-guide__zzz i:nth-child\(2\)\s*\{[^}]*(left|bottom):\s*[1-9]/);
    expect(reduced).toMatch(/\.momo-guide__zzz i:nth-child\(3\)\s*\{[^}]*(left|bottom):\s*[1-9]/);
  });

  it("the letters rise a little (a translate that moves up) in reduced motion", () => {
    const frames = css.match(/@keyframes momo-zzz-soft\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(frames).toMatch(/transform:\s*translate\([^)]*-\d/);
  });
});
