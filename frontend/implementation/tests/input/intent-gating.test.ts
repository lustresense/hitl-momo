import { describe, expect, it, vi } from "vitest";
import { HandStrokePipeline } from "@/src/input/hand-stroke-pipeline";
import { StrokeStore, type Landmark } from "@/src/input/types";

/**
 * Intent gating: only the pinch may write ink. Hands are written out by hand (camera-frame coordinates).
 * Canvas 1000x1000; the pipeline maps the normalized index tip onto it.
 */
const COLS = [0.42, 0.48, 0.54, 0.6];
type Thumb = "tucked" | "up" | "out";
function hand(fingers: ("up" | "down")[], thumb: Thumb = "tucked", xs: number[] = COLS, tipX = 0.42): Landmark[] {
  const h: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
  h[0] = { x: 0.5, y: 0.8 };
  h[9] = { x: 0.5, y: 0.6 };
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach(([mcp, pip, dip, tip], i) => {
    h[mcp!] = { x: COLS[i]!, y: 0.6 };
    h[pip!] = { x: COLS[i]!, y: 0.52 };
    if (fingers[i] === "up") {
      h[dip!] = { x: xs[i]!, y: 0.42 };
      h[tip!] = { x: i === 0 ? tipX : xs[i]!, y: 0.34 };
    } else {
      h[dip!] = { x: COLS[i]!, y: 0.6 };
      h[tip!] = { x: COLS[i]!, y: 0.66 };
    }
  });
  h[2] = { x: 0.38, y: 0.66 };
  h[3] = { x: 0.32, y: 0.64 };
  h[4] = thumb === "up" ? { x: 0.38, y: 0.4 } : thumb === "out" ? { x: 0.26, y: 0.62 } : { x: 0.46, y: 0.64 };
  if (thumb === "tucked") h[3] = { x: 0.42, y: 0.65 };
  return h;
}

const PINCH = (x: number) => {
  // Thumb tip on the index tip: the pinch that draws.
  const h = hand(["up", "down", "down", "down"], "tucked", COLS, x);
  h[4] = { x: x + 0.002, y: 0.34 };
  return h;
};

const POSES: Record<string, Landmark[]> = {
  "thumb-up": hand(["down", "down", "down", "down"], "up"),
  "open-palm": hand(["up", "up", "up", "up"], "out", [0.36, 0.46, 0.56, 0.66]),
  "split-palm": hand(["up", "up", "up", "up"], "out", [0.38, 0.42, 0.62, 0.66]),
  "one-finger": hand(["up", "down", "down", "down"]),
  "three-fingers": hand(["up", "up", "up", "down"]),
  "two-fingers": hand(["up", "up", "down", "down"], "out"),
  fist: hand(["down", "down", "down", "down"]),
};

function setup() {
  const store = new StrokeStore();
  const pipe = new HandStrokePipeline({
    store,
    size: () => ({ width: 1000, height: 1000 }),
    eraser: { radiusCanvasPx: () => 20, radiusCss: () => 20, setRadiusCss: () => undefined },
  });
  let t = 0;
  const feed = (lm: Landmark[] | undefined) => pipe.feedHands(lm ? [lm] : undefined, (t += 50));
  const points = () => {
    const { completed, active } = store.getStrokes();
    return completed.reduce((n, s) => n + s.length, 0) + (active?.length ?? 0);
  };
  return { store, feed, points };
}

describe("intent gating: only the pinch writes ink", () => {
  for (const [name, lm] of Object.entries(POSES)) {
    it(`${name} never starts or adds a stroke`, () => {
      const { store, feed, points } = setup();
      for (let i = 0; i < 30; i++) feed(lm);
      expect(points()).toBe(0);
      expect(store.hasInk()).toBe(false);
    });
  }

  it("a pinch does draw (the control case)", () => {
    const { feed, points } = setup();
    for (let i = 0; i < 6; i++) feed(PINCH(0.3 + i * 0.05));
    expect(points()).toBeGreaterThan(0);
  });

  it("pose changes during a pinch stroke add no ink: the stroke ends at the first non-pinch frame", () => {
    const { store, feed, points } = setup();
    for (let i = 0; i < 6; i++) feed(PINCH(0.3 + i * 0.05));
    const before = points();
    // Transitions: every other pose is shown in turn, then the hand is lost.
    const transitions = [POSES["one-finger"]!, POSES["three-fingers"]!, POSES["thumb-up"]!, POSES["open-palm"]!, POSES["split-palm"]!, POSES["two-fingers"]!, POSES.fist!];
    for (const lm of transitions) for (let i = 0; i < 4; i++) feed(lm);
    feed(undefined);
    expect(points()).toBe(before);
    expect(store.hasActiveStroke()).toBe(false);
  });

  it("a one-finger frame right after a pinch adds no point, and neither does the next one", () => {
    const { feed, points } = setup();
    for (let i = 0; i < 6; i++) feed(PINCH(0.3 + i * 0.05));
    feed(POSES["one-finger"]!);
    const afterOneFrame = points();
    feed(POSES["one-finger"]!);
    expect(points()).toBe(afterOneFrame);
  });
});

describe("Hapus tool on: the new finger poses are commands, not erasers", () => {
  for (const name of ["one-finger", "three-fingers"]) {
    it(`${name} under the eraser tool neither erases nor draws`, () => {
      const store = new StrokeStore();
      store.eraserMode = true;
      const pipe = new HandStrokePipeline({
        store,
        size: () => ({ width: 1000, height: 1000 }),
        eraser: { radiusCanvasPx: () => 20, radiusCss: () => 20, setRadiusCss: () => undefined },
      });
      store.beginStroke();
      for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: 229 });
      store.endStroke();
      const eraseSpy = vi.spyOn(store, "eraseAt");
      for (let i = 0; i < 10; i++) pipe.feedHands([POSES[name]!], 1000 + i * 50);
      expect(eraseSpy).not.toHaveBeenCalled();
      expect(store.getStrokes().completed.map((s) => s.length)).toEqual([41]);
    });
  }
});
