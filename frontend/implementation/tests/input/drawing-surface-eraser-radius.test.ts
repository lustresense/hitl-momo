// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DrawingSurface } from "@/src/input";
import type { Landmark } from "@/src/input/types";
import { makeHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const at = (i: number) => 1000 + i * 33;
const fist = (): Landmark[] => makeHand({ ratios: [0.5, 0.5, 0.5, 0.5] });

/** Canvas 400 x 300 on a layout of `cssWidth` x `cssHeight` CSS px. */
function makeSurface(cssWidth = 400, cssHeight = 300) {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: cssWidth, height: cssHeight, right: cssWidth, bottom: cssHeight, x: 0, y: 0, toJSON() {} }) as DOMRect;
  (canvas as unknown as { getContext: unknown }).getContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
  const surface = new DrawingSurface(canvas, null);
  return { canvas, surface, store: surface.store };
}

/** A vertical line at canvas x = 224 from y = 100 to 320 (23 points), 36 px right of the knuckles. */
function drawVerticalLine(store: DrawingSurface["store"]) {
  store.beginStroke();
  for (let y = 100; y <= 320; y += 10) store.addPoint({ x: 224, y });
  store.endStroke();
}

describe("eraser radius (Hapus): default and settable", () => {
  it("by default a fist leaves a line 36 px from the knuckles alone", () => {
    const { surface, store } = makeSurface();
    drawVerticalLine(store);
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([23]);
  });

  it("setEraserRadius(48) makes the same fist cut that line in place", () => {
    const { surface, store } = makeSurface();
    surface.setEraserRadius(48);
    drawVerticalLine(store);
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    // Points within 48 px of (188, 210) are removed: y 180..240 go, the two ends stay.
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([8, 8]);
  });

  it("setEraserRadius keeps the radius inside a safe range and ignores NaN", () => {
    const { surface } = makeSurface();
    const low = surface.setEraserRadius(0);
    expect(low).toBeGreaterThan(0);
    expect(surface.setEraserRadius(-5)).toBe(low);
    const high = surface.setEraserRadius(1e6);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThan(1e6);
    expect(surface.setEraserRadius(Number.NaN)).toBe(high);
  });

  it("the radius is in CSS px: on a 2x backing store a 28 px fist reaches 56 canvas px", () => {
    // Bug: the hand eraser used 28 canvas px, half the pointer eraser's reach on a 2x screen.
    const { canvas, surface, store } = makeSurface(200, 150);
    canvas.width = 400;
    canvas.height = 300;
    store.beginStroke();
    for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: 170 });
    store.endStroke();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    // The line sits 40 canvas px above the knuckle centre: cut between x 150 and 220 only.
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([15, 18]);
  });

  it("the pointer eraser uses the same radius as setEraserRadius", () => {
    const { canvas, surface, store } = makeSurface();
    surface.setEraserRadius(48);
    drawVerticalLine(store);
    surface.setErasing(true);
    const pointer = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: 1 }));
    pointer("pointerdown", 188, 210);
    pointer("pointerup", 188, 210);
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([8, 8]);
  });
});
