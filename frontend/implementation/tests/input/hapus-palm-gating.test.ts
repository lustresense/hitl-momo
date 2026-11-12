import { describe, expect, it, vi } from "vitest";
import { HandStrokePipeline } from "@/src/input/hand-stroke-pipeline";
import { StrokeStore, type Landmark } from "@/src/input/types";
import { fistHand, makeHand, pinchHand } from "./hand-fixtures";

/**
 * Hapus tool on (eraserMode): a fist erases under the knuckles, an open palm does nothing (it neither erases nor
 * draws), and a pinch keeps its own meaning (drag erases while the tool is on). Canvas 1000x1000; the camera point
 * (0.8, 0.229) maps to canvas (200, 229), which is where the finished stroke runs.
 */
const LINE_Y = 229;
const openPalmAt = (camX: number, camY: number): Landmark[] =>
  makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], indexTip: { x: camX, y: camY }, thumbTip: { x: 0.28, y: 0.7 } });

function setup() {
  const store = new StrokeStore();
  store.eraserMode = true;
  const pipe = new HandStrokePipeline({
    store,
    size: () => ({ width: 1000, height: 1000 }),
    eraser: { radiusCanvasPx: () => 20, radiusCss: () => 20, setRadiusCss: () => undefined },
  });
  store.beginStroke();
  for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: LINE_Y });
  store.endStroke();
  const eraseSpy = vi.spyOn(store, "eraseAt");
  let t = 1000;
  const feed = (lm: Landmark[]) => pipe.feedHands([lm], (t += 50));
  return { store, feed, eraseSpy };
}

describe("Hapus tool on: the palm is not an eraser", () => {
  it("an open palm over a finished stroke erases nothing and leaves the stroke whole", () => {
    const { store, feed, eraseSpy } = setup();
    for (let i = 0; i < 12; i++) feed(openPalmAt(0.8, 0.229));
    expect(eraseSpy).not.toHaveBeenCalled();
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([41]);
    expect(store.hasActiveStroke()).toBe(false);
  });

  it("an open palm moving across the stroke neither erases nor starts a new line", () => {
    const { store, feed, eraseSpy } = setup();
    for (let i = 0; i < 12; i++) feed(openPalmAt(0.9 - i * 0.02, 0.229));
    expect(eraseSpy).not.toHaveBeenCalled();
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([41]);
    expect(store.hasActiveStroke()).toBe(false);
  });

  it("control: a fist over the same stroke still erases under the tool", () => {
    const { feed, eraseSpy } = setup();
    for (let i = 0; i < 12; i++) feed(fistHand());
    expect(eraseSpy).toHaveBeenCalled();
  });

  it("control: a pinch drag under the tool still erases (the tool's own drag)", () => {
    const { feed, eraseSpy } = setup();
    for (let i = 0; i < 6; i++) feed(pinchHand(0.8 - i * 0.02, 0.229));
    expect(eraseSpy).toHaveBeenCalled();
  });
});
