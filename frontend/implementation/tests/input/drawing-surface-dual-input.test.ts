// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Landmark } from "@/src/input/types";
import { makeHand } from "./hand-fixtures";

// The MediaPipe driver is replaced: the hand is fed through the surface's test pipeline, as in the stroke tests.
vi.mock("../../src/input/mediapipe-input", () => ({
  HandDrawingDriver: class {
    constructor(private readonly o: { onStatus: (s: unknown) => void }) {}
    async start() {
      this.o.onStatus({ kind: "ready" });
    }
    async stop() {}
  },
}));
import { DrawingSurface } from "../../src/input";

const W = 400;
const H = 300;
const at = (i: number) => 1000 + i * 33;

const none = (): Landmark[] => makeHand({ ratios: [1, 1, 1, 1] });
/** Thumb touching the index tip at camera point (x, y). */
const pinch = (x: number, y = 0.55, gap = 0.004): Landmark[] =>
  makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], indexTip: { x, y }, thumbTip: { x: x + gap, y } });

function setup() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const rect = { left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON() {} } as DOMRect;
  canvas.getBoundingClientRect = () => rect;
  (canvas as unknown as { getContext: unknown }).getContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
  document.body.appendChild(canvas);
  const surface = new DrawingSurface(canvas, document.createElement("video"), {});
  return { canvas, surface, store: surface.store };
}

/** A real mouse event on the canvas, at canvas pixels (the rect above is 1:1). */
function mouse(canvas: HTMLCanvasElement, type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

function mouseStroke(canvas: HTMLCanvasElement, from: [number, number], to: [number, number]) {
  mouse(canvas, "pointerdown", from[0], from[1]);
  mouse(canvas, "pointermove", to[0], to[1]);
  mouse(canvas, "pointerup", to[0], to[1]);
}

describe("camera mode keeps the mouse: one store, two sources, the hand stays primary", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("a mouse stroke draws while the hand driver is on (tutorial card 3 and the level canvas in camera mode)", async () => {
    const { canvas, surface, store } = setup();
    await surface.setMode("hand");
    expect(surface.getMode()).toBe("hand");
    mouseStroke(canvas, [50, 50], [200, 140]);
    expect(store.getStrokes().completed).toHaveLength(1);
    expect(surface.isEmpty()).toBe(false);
  });

  it("while a pinch draws, mouse events add no points to its stroke", async () => {
    const { canvas, surface, store } = setup();
    await surface.setMode("hand");
    for (let i = 0; i < 3; i++) surface.feedHandLandmarksForTest(pinch(0.4), at(i));
    const before = store.getStrokes().active?.length ?? -1;
    expect(before).toBeGreaterThan(0);
    mouseStroke(canvas, [300, 200], [310, 210]);
    expect(store.getStrokes().active?.length).toBe(before);
    expect(store.getStrokes().completed).toHaveLength(0);
  });

  it("a mouse stroke open when a pinch starts is closed there; the pinch then draws its own stroke", async () => {
    const { canvas, surface, store } = setup();
    await surface.setMode("hand");
    mouse(canvas, "pointerdown", 50, 50);
    mouse(canvas, "pointermove", 120, 90);
    for (let i = 0; i < 4; i++) surface.feedHandLandmarksForTest(pinch(0.4), at(i));
    for (let i = 4; i < 8; i++) surface.feedHandLandmarksForTest(none(), at(i));
    // The mouse stroke was closed when the pinch began, and the pinch stroke closed when the hand let go.
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(2);
  });

  it("when the mouse lifts in camera mode, its dot goes too: the hand owns the cursor again", async () => {
    const { canvas, surface } = setup();
    await surface.setMode("hand");
    mouseStroke(canvas, [50, 50], [200, 140]);
    expect((surface as unknown as { cursor: unknown }).cursor).toBeNull();
  });

  it("after the hand lets go, the mouse draws again", async () => {
    const { canvas, surface, store } = setup();
    await surface.setMode("hand");
    for (let i = 0; i < 4; i++) surface.feedHandLandmarksForTest(pinch(0.4), at(i));
    for (let i = 4; i < 8; i++) surface.feedHandLandmarksForTest(none(), at(i));
    const before = store.getStrokes().completed.length;
    mouseStroke(canvas, [300, 200], [310, 210]);
    expect(store.getStrokes().completed.length).toBe(before + 1);
  });
});
