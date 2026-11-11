/**
 * Card 3 of the tutorial with the hand (R4): the practice canvas is the real DrawingSurface, driven by synthetic
 * 21-point hands. Only the pinch draws; a fist erases; two fingers hold for undo; an open or split palm holds for redo.
 * Each tool is reported once, and only when the drawing really changed.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDrawingSurface, type DrawingToolUsed } from "@/src/components/drawing/hooks/useDrawingSurface";
import type { DrawingSurface } from "@/src/input";
import { makeHand, pinchHand, spreadHand } from "../input/hand-fixtures";
import { ERASER_RADIUS_PX } from "@/src/input/eraser";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const W = 400;
const H = 300;
/** Frame clock at about 30 fps. */
let clock = 1000;
const tick = () => (clock += 33);

// Hand shapes, written out here so the expectations do not reuse the code under test.
const noHand = () => makeHand({ ratios: [1, 1, 1, 1] });
const thumbUp = () => makeHand({ ratios: [0.5, 0.5, 0.5, 0.5], thumbMcp: { x: 0.36, y: 0.7 }, thumbTip: { x: 0.36, y: 0.5 } });
const openPalm = () => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] });
const twoFingers = () => makeHand({ ratios: [1.5, 1.5, 0.5, 0.5] });
const splitPalm = () => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], tipX: [0.38, 0.42, 0.62, 0.66] });
/** A closed fist. The eraser acts at the palm centre (the folded fingertips sit in the palm), about (0.5, 0.74) here. */
const fist = () => makeHand({ ratios: [0.5, 0.5, 0.5, 0.5] });
/** The height of the palm centre in camera frame, where a stroke must be for the fist to reach it. */
const PALM_Y = 0.74;

/** jsdom has no 2D canvas: a permissive context is enough for the surface to draw. */
function stubCanvas2d() {
  const ctx = new Proxy(
    { canvas: { width: W, height: H }, getImageData: () => ({ data: new Uint8ClampedArray(4) }) } as Record<string | symbol, unknown>,
    {
      get: (target, key) => (key in target ? target[key] : () => undefined),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
}

/** The tutorial's practice wiring: the hook around a real DrawingSurface, reports collected in order. */
function setup(fixedEraser = false) {
  stubCanvas2d();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const canvasRef = { current: canvas };
  const surfaceOut: { current: DrawingSurface | null } = { current: null };
  const reported: DrawingToolUsed[] = [];
  renderHook(() =>
    useDrawingSurface({ canvasRef, surfaceOut, initialMode: "pointer", active: true, onToolUsed: (tool) => reported.push(tool), fixedEraser }),
  );
  const surface = surfaceOut.current!;
  expect(surface).toBeTruthy();
  return { surface, store: surface.store, reported };
}

function feed(surface: DrawingSurface, hand: () => ReturnType<typeof makeHand>, frames: number) {
  for (let i = 0; i < frames; i++) surface.feedHandLandmarksForTest(hand(), tick());
}

/** A pinch sweep from x0 to x1 at the palm's height (camera frame), then the hand lets go. */
function drawStroke(surface: DrawingSurface, x0 = 0.4, x1 = 0.6) {
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    surface.feedHandLandmarksForTest(pinchHand(x, PALM_Y), tick());
  }
  feed(surface, noHand, 4);
}

describe("card 3 by hand: only the pinch draws", () => {
  it("thumb-up, open palm, split palm and two fingers never start or add a stroke, even when they change", () => {
    const { surface, store, reported } = setup();
    for (let round = 0; round < 3; round++) {
      feed(surface, thumbUp, 10);
      feed(surface, openPalm, 10);
      feed(surface, splitPalm, 6);
      feed(surface, twoFingers, 6);
    }
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(reported).toEqual([]);
  });
});

describe("card 3 by hand: each tool is reported once, for a real change", () => {
  it("a pinch sweep is one draw, reported when the stroke ends", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(reported).toEqual(["draw"]);
  });

  it("a fist erases the stroke under its palm; a fist over blank paper reports nothing", () => {
    const { surface, store, reported } = setup();
    feed(surface, fist, 8);
    expect(reported).toEqual([]);

    drawStroke(surface, 0.4, 0.6);
    expect(reported).toEqual(["draw"]);

    // The palm cuts the middle out of the 8-point stroke: fewer ink points are left.
    const inkBefore = store.getStrokes().completed.reduce((n, s) => n + s.length, 0);
    feed(surface, fist, 8);
    const inkAfter = store.getStrokes().completed.reduce((n, s) => n + s.length, 0);
    expect(inkAfter).toBeLessThan(inkBefore);
    expect(reported).toContain("erase");

    const erased = reported.filter((t) => t === "erase").length;
    feed(surface, fist, 8);
    expect(reported.filter((t) => t === "erase")).toHaveLength(erased);
  });

  it("two fingers held for undo report undo only when there was a step to undo", () => {
    const { surface, store, reported } = setup();
    feed(surface, twoFingers, 20);
    expect(reported).toEqual([]);

    drawStroke(surface);
    expect(reported).toEqual(["draw"]);

    feed(surface, twoFingers, 20);
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(reported).toEqual(["draw", "undo"]);
  });

  it("the palm split holds for redo: nothing before an undo, then one redo", () => {
    const { surface, store, reported } = setup();
    feed(surface, splitPalm, 20);
    expect(reported).toEqual([]);

    drawStroke(surface);
    feed(surface, twoFingers, 20);
    expect(store.getStrokes().completed).toHaveLength(0);

    feed(surface, splitPalm, 20);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(reported).toEqual(["draw", "undo", "redo"]);
  });
});

describe("card 3 by hand: the open palm redoes too", () => {
  it("an open palm held after an undo redoes the stroke once", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    feed(surface, twoFingers, 20);
    expect(store.getStrokes().completed).toHaveLength(0);

    feed(surface, openPalm, 20);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(reported).toEqual(["draw", "undo", "redo"]);
  });
});

describe("card 3 by hand: the practice eraser keeps its fixed size", () => {
  it("a second hand that widens does not resize the eraser", () => {
    const { surface } = setup(true);
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.2, 0.2)], tick());
    for (let i = 0; i < 30; i++) surface.feedHandsForTest([fist(), spreadHand(0.6, 0.2)], tick());
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });
});
