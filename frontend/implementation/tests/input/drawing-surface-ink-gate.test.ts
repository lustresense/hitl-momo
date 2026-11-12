// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingSurface } from "@/src/input";
import type { Landmark } from "@/src/input/types";
import { makeHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

/**
 * The ink gate (DrawingScreen): while a cover is on the canvas (focus phase, level intro) or the sticker waits
 * there, the surface takes no ink from the pointer or the hand, runs no eraser pass, and no undo or redo.
 */
const at = (i: number) => 1000 + i * 33;
const pinch = (x: number, y = 0.55, gap = 0.004): Landmark[] =>
  makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], indexTip: { x, y }, thumbTip: { x: x + gap, y } });
const fist = (): Landmark[] => makeHand({ ratios: [0.5, 0.5, 0.5, 0.5] });
const none = (): Landmark[] => makeHand({ ratios: [1, 1, 1, 1] });

const surfaces: DrawingSurface[] = [];
afterEach(() => {
  for (const s of surfaces.splice(0)) s.dispose();
  vi.restoreAllMocks();
});

function makeSurface() {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const rect = { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} } as DOMRect;
  canvas.getBoundingClientRect = () => rect;
  (canvas as unknown as { getContext: unknown }).getContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
  const surface = new DrawingSurface(canvas, null, {});
  surfaces.push(surface);
  return { canvas, surface, store: surface.store };
}

/** A pinch line of eight frames, released by an open hand. Returns the next frame index. */
function drawLine(surface: DrawingSurface, start: number): number {
  for (let i = 0; i < 8; i++) surface.feedHandLandmarksForTest(pinch(0.2 + 0.05 * i), at(start + i));
  for (let i = 8; i < 12; i++) surface.feedHandLandmarksForTest(none(), at(start + i));
  return start + 12;
}

function pointerStroke(canvas: HTMLCanvasElement) {
  canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: 40, clientY: 40, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: 90, clientY: 60, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: 120, clientY: 60, bubbles: true }));
}

describe("ink gate: a shut gate takes no ink, no eraser pass and no undo or redo", () => {
  it("is open by default: a pinch line draws", () => {
    const { surface, store } = makeSurface();
    drawLine(surface, 0);
    expect(store.getStrokes().completed).toHaveLength(1);
  });

  it("a shut gate takes no pinch stroke", () => {
    const { surface, store } = makeSurface();
    surface.setInkEnabled(false);
    drawLine(surface, 0);
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(store.getStrokes().active).toBeNull();
  });

  it("a shut gate takes no pointer stroke, while the open gate does", () => {
    const { canvas, surface, store } = makeSurface();
    surface.setInkEnabled(false);
    pointerStroke(canvas);
    expect(store.getStrokes().completed).toHaveLength(0);
    surface.setInkEnabled(true);
    pointerStroke(canvas);
    expect(store.getStrokes().completed).toHaveLength(1);
  });

  it("a fist cannot erase while the gate is shut", () => {
    const { surface, store } = makeSurface();
    const t = drawLine(surface, 0);
    const before = JSON.stringify(store.getStrokes().completed);
    surface.setInkEnabled(false);
    for (let i = 0; i < 6; i++) surface.feedHandLandmarksForTest(fist(), at(t + i));
    expect(JSON.stringify(store.getStrokes().completed)).toBe(before);
    expect(store.isErasing()).toBe(false);
  });

  it("undo and redo do nothing while the gate is shut", () => {
    const { surface, store } = makeSurface();
    drawLine(surface, 0);
    surface.setInkEnabled(false);
    expect(surface.undo()).toBe(false);
    expect(store.getStrokes().completed).toHaveLength(1);
    surface.setInkEnabled(true);
    expect(surface.undo()).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(0);
    surface.setInkEnabled(false);
    expect(surface.redo()).toBe(false);
    expect(store.getStrokes().completed).toHaveLength(0);
  });

  it("shutting the gate mid-stroke closes the open line, and later pinches add nothing", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(pinch(0.2 + 0.05 * i), at(i));
    expect(store.hasActiveStroke()).toBe(true);
    surface.setInkEnabled(false);
    expect(store.hasActiveStroke()).toBe(false);
    expect(store.getStrokes().completed).toHaveLength(1);
    for (let i = 5; i < 12; i++) surface.feedHandLandmarksForTest(pinch(0.2 + 0.05 * i), at(i));
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(store.hasActiveStroke()).toBe(false);
  });

  it("reopening the gate draws again", () => {
    const { surface, store } = makeSurface();
    surface.setInkEnabled(false);
    surface.setInkEnabled(true);
    drawLine(surface, 0);
    expect(store.getStrokes().completed).toHaveLength(1);
  });
});
