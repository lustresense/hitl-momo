// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DrawingSurface } from "@/src/input";
import { ERASER_RADIUS_MAX_PX, ERASER_RADIUS_MIN_PX, ERASER_RADIUS_PX } from "@/src/input/eraser";
import type { Landmark } from "@/src/input/types";
import { fistHand, makeHand, pinchHand, spreadHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const W = 400;
const H = 300;
/** Frame clock at about 30 fps, starting at 1 s. */
const at = (i: number) => 1000 + i * 33;

function makeSurface() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const rect = { left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON() {} } as DOMRect;
  canvas.getBoundingClientRect = () => rect;
  (canvas as unknown as { getContext: unknown }).getContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
  const surface = new DrawingSurface(canvas, null);
  return { surface, store: surface.store };
}

/** Horizontal line at canvas y = 210 from x = 0 to 400 (41 points): the fist erases around (188, 210). */
function drawHorizontalLine(store: DrawingSurface["store"]) {
  store.beginStroke();
  for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: 210 });
  store.endStroke();
}

const fist = (): Landmark[] => fistHand();
const strokeLengths = (store: DrawingSurface["store"]) => store.getStrokes().completed.map((s) => s.length);

describe("one hand: the same ink as before the second hand existed", () => {
  it("feeding [hand] draws exactly what feeding the hand alone draws", () => {
    const frames = Array.from({ length: 12 }, (_, i) => pinchHand(0.4 + 0.01 * i));
    const a = makeSurface();
    const b = makeSurface();
    frames.forEach((hand, i) => {
      a.surface.feedHandLandmarksForTest(hand, at(i));
      b.surface.feedHandsForTest([hand], at(i));
    });
    expect(b.store.getStrokes()).toEqual(a.store.getStrokes());
    expect(b.store.getStrokes().completed.length + (b.store.getStrokes().active ? 1 : 0)).toBe(1);
  });
});

describe("two hands: a fist erases and the other hand never draws", () => {
  it("a pinching second hand draws nothing while the first hand is a fist", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 12; i++) surface.feedHandsForTest([fist(), pinchHand(0.3 + 0.02 * i)], at(i));
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(0);
  });

  it("the fist still erases at the knuckles while the second hand is in view", () => {
    const { surface, store } = makeSurface();
    drawHorizontalLine(store);
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.6, 0.2)], at(i));
    // Radius 28 px around (188, 210) removes x 160..210; the two ends stay.
    expect(strokeLengths(store)).toEqual([16, 19]);
  });

  it("a fist listed second is still the eraser, and the other hand does not draw", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 6; i++) surface.feedHandsForTest([pinchHand(0.3), fist()], at(i));
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(0);
  });

  it("the eraser radius starts at its current value when the second hand first appears (no jump)", () => {
    const { surface } = makeSurface();
    for (let i = 0; i < 3; i++) surface.feedHandsForTest([fist()], at(i));
    surface.feedHandsForTest([fist(), spreadHand(0.8, 0.2)], at(3));
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });

  it("widening the second hand's gap grows the radius, closing it shrinks the radius", () => {
    const { surface } = makeSurface();
    // Warm-up: the fist must be stable (three frames) before the session anchors on the gap.
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.2, 0.2)], at(i));
    const start = surface.getEraserRadius();
    for (let i = 5; i <= 30; i++) surface.feedHandsForTest([fist(), spreadHand(0.6, 0.2)], at(i));
    const wide = surface.getEraserRadius();
    expect(wide).toBeGreaterThan(start + 10);
    for (let i = 31; i <= 60; i++) surface.feedHandsForTest([fist(), spreadHand(0.1, 0.2)], at(i));
    expect(surface.getEraserRadius()).toBeLessThan(start);
  });

  it("the radius stays inside the min and max bounds with two hands", () => {
    const { surface } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.12, 0.2)], at(i));
    for (let i = 5; i <= 155; i++) surface.feedHandsForTest([fist(), spreadHand(3, 0.2)], at(i));
    expect(surface.getEraserRadius()).toBeLessThanOrEqual(ERASER_RADIUS_MAX_PX);
    expect(surface.getEraserRadius()).toBeGreaterThan(ERASER_RADIUS_MAX_PX - 2.5);
    // The second hand leaves, then comes back wide open (new session at the held maximum), then closes fully.
    for (let i = 156; i <= 157; i++) surface.feedHandsForTest([fist()], at(i));
    for (let i = 158; i <= 170; i++) surface.feedHandsForTest([fist(), spreadHand(0.8, 0.2)], at(i));
    for (let i = 171; i <= 400; i++) surface.feedHandsForTest([fist(), spreadHand(0, 0.2)], at(i));
    expect(surface.getEraserRadius()).toBeGreaterThanOrEqual(ERASER_RADIUS_MIN_PX);
    expect(surface.getEraserRadius()).toBeLessThan(ERASER_RADIUS_MIN_PX + 2.5);
  });

  it("the radius moves only while a fist and a second hand are both in view", () => {
    const { surface } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.2, 0.2)], at(i));
    for (let i = 5; i <= 25; i++) surface.feedHandsForTest([fist(), spreadHand(0.6, 0.2)], at(i));
    const grown = surface.getEraserRadius();
    expect(grown).toBeGreaterThan(ERASER_RADIUS_PX);
    // Second hand gone: the last radius is held, even while the fist keeps erasing.
    for (let i = 26; i <= 35; i++) surface.feedHandsForTest([fist()], at(i));
    expect(surface.getEraserRadius()).toBe(grown);
    // No fist (a pinch draws): a second hand's gap changes nothing.
    for (let i = 36; i <= 45; i++) surface.feedHandsForTest([pinchHand(0.3), spreadHand(0.1, 0.2)], at(i));
    expect(surface.getEraserRadius()).toBe(grown);
  });

  it("when the second hand returns after a loss, the radius holds and does not jump", () => {
    const { surface } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.2, 0.2)], at(i));
    for (let i = 5; i <= 25; i++) surface.feedHandsForTest([fist(), spreadHand(0.6, 0.2)], at(i));
    const held = surface.getEraserRadius();
    for (let i = 26; i <= 35; i++) surface.feedHandsForTest([fist()], at(i));
    surface.feedHandsForTest([fist(), spreadHand(0.1, 0.2)], at(36));
    expect(surface.getEraserRadius()).toBe(held);
  });

  it("one pass with a changing radius is one undo step that restores the whole line", () => {
    const { surface, store } = makeSurface();
    drawHorizontalLine(store);
    surface.feedHandsForTest([fist(), spreadHand(0.2, 0.2)], at(0));
    for (let i = 1; i <= 15; i++) surface.feedHandsForTest([fist(), spreadHand(0.2 + 0.03 * i, 0.2)], at(i));
    // Fist opens (open palm, no second hand): the pass ends here.
    surface.feedHandsForTest([makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] })], at(16));
    surface.feedHandsForTest([makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] })], at(17));
    expect(store.hasInk()).toBe(true);
    // One undo gives back the whole line (the pass is one step); the next undo removes the line itself.
    expect(store.undo()).toBe(true);
    expect(strokeLengths(store)).toEqual([41]);
    expect(store.undo()).toBe(true);
    expect(store.hasInk()).toBe(false);
  });
});

describe("two pinching hands: only one draws", () => {
  it("with no fist, the two pinching hands make at most one stroke", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 12; i++) surface.feedHandsForTest([pinchHand(0.3 + 0.01 * i), pinchHand(0.7)], at(i));
    const strokes = store.getStrokes();
    expect((strokes.active ? 1 : 0) + strokes.completed.length).toBeLessThanOrEqual(1);
    expect(strokes.active).not.toBeNull();
  });
});
