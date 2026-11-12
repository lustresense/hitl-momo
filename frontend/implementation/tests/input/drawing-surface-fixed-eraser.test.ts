// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingSurface } from "@/src/input";
import { ERASER_RADIUS_PX } from "@/src/input/eraser";
import { fistHand, spreadHand } from "./hand-fixtures";

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

/**
 * Tutorial card 3 (fixedEraser): the Hapus radius stays at its default. The mouse wheel, `[` and `]`, and a second
 * hand that widens must not change it. Without the option (the level canvas) all three still resize it.
 */
const at = (i: number) => 1000 + i * 33;
const fist = () => fistHand();

const surfaces: DrawingSurface[] = [];

afterEach(() => {
  for (const s of surfaces.splice(0)) s.dispose();
  vi.restoreAllMocks();
});

function makeSurface(fixedEraser?: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
  (canvas as unknown as { getContext: unknown }).getContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
  const surface = new DrawingSurface(canvas, null, { fixedEraser });
  surfaces.push(surface);
  surface.setErasing(true);
  return { canvas, surface };
}

/** Wheel over the canvas, as the mouse does it. Returns the event so the page-scroll state can be read. */
function wheel(canvas: HTMLCanvasElement, deltaY: number): Event {
  const event = Object.assign(new Event("wheel", { cancelable: true }), { deltaY });
  canvas.dispatchEvent(event);
  return event;
}

const bracket = (key: "[" | "]") => window.dispatchEvent(new KeyboardEvent("keydown", { key }));

/** A fist erases while the second hand's gap widens: the sizing session the level canvas uses. */
function widenSecondHand(surface: DrawingSurface) {
  for (let i = 0; i < 5; i++) surface.feedHandsForTest([fist(), spreadHand(0.2, 0.2)], at(i));
  for (let i = 5; i <= 30; i++) surface.feedHandsForTest([fist(), spreadHand(0.6, 0.2)], at(i));
}

describe("fixed eraser (tutorial card 3)", () => {
  it("starts at the default radius and setEraserRadius cannot move it", () => {
    const { surface } = makeSurface(true);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
    expect(surface.setEraserRadius(48)).toBe(ERASER_RADIUS_PX);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });

  it("the mouse wheel does not resize it and does not take over the page scroll", () => {
    const { canvas, surface } = makeSurface(true);
    const event = wheel(canvas, -120);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
    expect(event.defaultPrevented).toBe(false);
  });

  it("[ and ] do not resize it", () => {
    const { surface } = makeSurface(true);
    bracket("]");
    bracket("]");
    bracket("[");
    bracket("]");
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });

  it("a second hand that widens does not resize it while the fist erases", () => {
    const { surface } = makeSurface(true);
    widenSecondHand(surface);
    expect(surface.getEraserRadius()).toBe(ERASER_RADIUS_PX);
  });
});

describe("default eraser (level canvas) still resizes", () => {
  it("the wheel, [ ] and a widening second hand all change the radius", () => {
    const wheelCase = makeSurface();
    wheel(wheelCase.canvas, -120);
    expect(wheelCase.surface.getEraserRadius()).toBeGreaterThan(ERASER_RADIUS_PX);

    const keyCase = makeSurface();
    bracket("]");
    expect(keyCase.surface.getEraserRadius()).toBeGreaterThan(ERASER_RADIUS_PX);

    const handCase = makeSurface();
    widenSecondHand(handCase.surface);
    expect(handCase.surface.getEraserRadius()).toBeGreaterThan(ERASER_RADIUS_PX + 10);
  });
});
