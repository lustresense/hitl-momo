/**
 * Card 3 NUI contract (REV-B03-005): pinch=draw, five fingers=erase,
 * one index=undo, two fingers=redo, and fist is forbidden in tutorial mode.
 * These synthetic tests are UNIT_ONLY; a real webcam acceptance pass is still required.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDrawingSurface, type DrawingToolUsed } from "@/src/components/drawing/hooks/useDrawingSurface";
import type { DrawingSurface } from "@/src/input";
import { fistHand, makeHand, pinchHand } from "../input/hand-fixtures";
import { ERASER_RADIUS_PX } from "@/src/input/eraser";

const W = 400;
const H = 300;
const PALM_Y = 0.74;
let clock = 1000;
const tick = () => (clock += 33);

const noHand = () => makeHand({ ratios: [1, 1, 1, 1] });
const openPalm = () => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] });
const spreadPalm = () => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], tipX: [0.38, 0.42, 0.62, 0.66] });
const oneFinger = () => makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], thumbTip: { x: 0.36, y: 0.7 } });
const twoFingers = () => makeHand({ ratios: [1.5, 1.5, 0.5, 0.5] });
const fist = () => fistHand();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clock = 1000;
});

function stubCanvas2d() {
  const ctx = new Proxy(
    { canvas: { width: W, height: H }, getImageData: () => ({ data: new Uint8ClampedArray(4) }) } as Record<string | symbol, unknown>,
    {
      get: (target, key) => (key in target ? target[key] : () => undefined),
      set: (target, key, value) => { target[key] = value; return true; },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
}

function setup() {
  stubCanvas2d();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const canvasRef = { current: canvas };
  const surfaceOut: { current: DrawingSurface | null } = { current: null };
  const reported: DrawingToolUsed[] = [];
  renderHook(() => useDrawingSurface({
    canvasRef,
    surfaceOut,
    initialMode: "pointer",
    active: true,
    onToolUsed: (tool) => reported.push(tool),
    fixedEraser: true,
  }));
  const surface = surfaceOut.current!;
  expect(surface).toBeTruthy();
  return { surface, store: surface.store, reported };
}

function feed(surface: DrawingSurface, hand: () => ReturnType<typeof makeHand>, frames: number) {
  for (let i = 0; i < frames; i++) surface.feedHandLandmarksForTest(hand(), tick());
}

function drawStroke(surface: DrawingSurface, x0 = 0.4, x1 = 0.6) {
  for (let i = 0; i <= 9; i++) {
    const x = x0 + ((x1 - x0) * i) / 9;
    surface.feedHandLandmarksForTest(pinchHand(x, PALM_Y), tick());
  }
  feed(surface, noHand, 5);
}

describe("Card 3 uses a single current gesture vocabulary end-to-end", () => {
  it("pinch commits exactly one real stroke/checklist event", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(reported).toEqual(["draw"]);
  });

  it("five fingers erase actual ink; repeating the gesture on blank ink adds no fake event", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    const before = store.getStrokes().completed.reduce((n, s) => n + s.length, 0);
    feed(surface, openPalm, 12);
    const after = store.getStrokes().completed.reduce((n, s) => n + s.length, 0);
    expect(after).toBeLessThan(before);
    expect(reported).toContain("erase");
    const count = reported.filter((t) => t === "erase").length;
    feed(surface, openPalm, 12);
    expect(reported.filter((t) => t === "erase")).toHaveLength(count);
  });

  it("spread five fingers also act as erase, never as redo", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    const spy = vi.spyOn(store, "eraseAt");
    feed(surface, spreadPalm, 12);
    expect(spy).toHaveBeenCalled();
    expect(reported).not.toContain("redo");
  });

  it("one finger does undo and two fingers do redo, one event per held pose", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    feed(surface, oneFinger, 20);
    expect(store.getStrokes().completed).toHaveLength(0);
    feed(surface, twoFingers, 20);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(reported).toEqual(["draw", "undo", "redo"]);
  });

  it("old fist gesture never erases in tutorial, even with Hapus tool on", () => {
    const { surface, store, reported } = setup();
    drawStroke(surface);
    surface.setErasing(true);
    const spy = vi.spyOn(store, "eraseAt");
    feed(surface, fist, 12);
    expect(spy).not.toHaveBeenCalled();
    expect(reported).toEqual(["draw"]);
  });

  it("the tutorial keeps one fixed eraser radius", () => {
    const { surface } = setup();
    surface.setEraserRadius(64);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });

  it("undo/redo on blank history never marks a completed tool", () => {
    const { surface, reported } = setup();
    act(() => { feed(surface, oneFinger, 20); feed(surface, twoFingers, 20); });
    expect(reported).toEqual([]);
  });
});
