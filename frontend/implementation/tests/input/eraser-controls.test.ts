// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingSurface } from "@/src/input";
import { ERASER_RADIUS_MAX_PX, ERASER_RADIUS_MIN_PX, ERASER_RADIUS_PX, ERASER_SIZE_STEP_PX } from "@/src/input/eraser";
import { fistHand, pinchHand, spreadHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

/** Surfaces made by a test are disposed after it: their window key listeners must not leak into the next test. */
const made: DrawingSurface[] = [];
afterEach(() => {
  made.splice(0).forEach((s) => s.dispose());
  document.body.innerHTML = "";
});

/** A canvas context that records every call, so tests can look at what was drawn. */
function recordingContext() {
  const calls: Record<string, unknown[][]> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        (calls[prop] ??= []).push(args);
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, calls };
}

function makeSurface(width = 400, height = 300) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const rect = { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
  canvas.getBoundingClientRect = () => rect;
  const rec = recordingContext();
  (canvas as unknown as { getContext: unknown }).getContext = () => rec.ctx;
  document.body.appendChild(canvas);
  const surface = new DrawingSurface(canvas, null);
  made.push(surface);
  return { canvas, surface, rec };
}

const wheel = (canvas: HTMLCanvasElement, deltaY: number) => {
  const ev = new WheelEvent("wheel", { deltaY, cancelable: true, bubbles: true });
  canvas.dispatchEvent(ev);
  return ev;
};
const key = (k: string, target?: EventTarget) => {
  const ev = new KeyboardEvent("keydown", { key: k, cancelable: true, bubbles: true });
  (target ?? window).dispatchEvent(ev);
  return ev;
};

describe("mouse wheel sizes the eraser while the Hapus tool is on", () => {
  it("wheel up makes the eraser bigger and wheel down smaller, by one step per notch", () => {
    const { canvas, surface } = makeSurface();
    surface.setErasing(true);
    wheel(canvas, -100);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX + ERASER_SIZE_STEP_PX);
    wheel(canvas, 100);
    wheel(canvas, 100);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX - ERASER_SIZE_STEP_PX);
  });

  it("the wheel never takes the eraser past its bounds", () => {
    const { canvas, surface } = makeSurface();
    surface.setErasing(true);
    for (let i = 0; i < 40; i++) wheel(canvas, -100);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_MAX_PX);
    for (let i = 0; i < 40; i++) wheel(canvas, 100);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_MIN_PX);
  });

  it("with the Hapus tool off the wheel scrolls the page and leaves the radius alone", () => {
    const { canvas, surface } = makeSurface();
    const ev = wheel(canvas, -100);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("[ and ] size the eraser while the Hapus tool is on", () => {
  it("] makes it bigger and [ smaller, one step each", () => {
    const { surface } = makeSurface();
    surface.setErasing(true);
    key("]");
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX + ERASER_SIZE_STEP_PX);
    key("[");
    key("[");
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX - ERASER_SIZE_STEP_PX);
  });

  it("does nothing with the Hapus tool off", () => {
    const { surface } = makeSurface();
    const ev = key("]");
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does nothing while the student types in a text field", () => {
    const { surface } = makeSurface();
    surface.setErasing(true);
    const input = document.createElement("input");
    document.body.appendChild(input);
    key("]", input);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });

  it("ignores the key with Ctrl, Alt or Meta held (browser shortcuts keep working)", () => {
    const { surface } = makeSurface();
    surface.setErasing(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "]", ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "]", metaKey: true }));
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });

  it("stops listening after dispose", () => {
    const { surface } = makeSurface();
    surface.setErasing(true);
    surface.dispose();
    key("]");
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });
});

describe("the eraser ring shows the reach of the eraser on the canvas", () => {
  it("while a fist erases, a ring as wide as the current radius is drawn at the knuckles", () => {
    const { surface, rec } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandsForTest([fistHand()], 1000 + i * 33);
    const rings = (rec.calls["arc"] ?? []).filter((a) => a[2] === ERASER_RADIUS_PX);
    expect(rings.length).toBeGreaterThan(0);
    // Knuckle centre of the fixture hand: (188, 210) in canvas px.
    const last = rings[rings.length - 1]!;
    expect(Math.abs((last[0] as number) - 188)).toBeLessThan(2);
    expect(Math.abs((last[1] as number) - 210)).toBeLessThan(2);
  });

  it("with the Hapus tool on, the ring follows the pointer", () => {
    const { canvas, surface, rec } = makeSurface();
    surface.setErasing(true);
    canvas.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 120, clientY: 90, pointerId: 1 }));
    expect((rec.calls["arc"] ?? []).some((a) => a[2] === ERASER_RADIUS_PX)).toBe(true);
  });

  it("with the Hapus tool off and a pinch drawing, no eraser ring is drawn", () => {
    const { surface, rec } = makeSurface();
    for (let i = 0; i < 4; i++) surface.feedHandsForTest([pinchHand(0.4)], 1000 + i * 33);
    expect((rec.calls["arc"] ?? []).some((a) => a[2] === ERASER_RADIUS_PX)).toBe(false);
  });

  it("while the second hand sets the size, the ring carries the size number", () => {
    const { surface, rec } = makeSurface();
    for (let i = 0; i < 4; i++) surface.feedHandsForTest([fistHand()], 1000 + i * 33);
    surface.feedHandsForTest([fistHand(), handWithGap(0.3)], 1200);
    expect((rec.calls["fillText"] ?? []).map((a) => a[0])).toContain(String(ERASER_RADIUS_PX));
  });
});

const handWithGap = (gap: number) => spreadHand(gap, 0.2);
