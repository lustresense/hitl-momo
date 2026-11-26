import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasController, type CanvasToolId } from "@/src/features/canvas";
import { ERASER_RADIUS_PX, GUESS_IDLE_MS } from "@/src/nui/core/constants";
import type { InputSample } from "@/src/nui/core/types";

function makeController(
  opts: {
    dpr?: number;
    onToolUsed?: (tool: CanvasToolId) => void;
    beginNib?: (t: number) => Array<{ x: number; y: number; t: number }>;
  } = {},
) {
  const dpr = opts.dpr ?? 1;
  return new CanvasController({
    onToolUsed: opts.onToolUsed,
    getMetrics: () => ({
      rect: { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 },
      canvasWidth: 1000 * dpr,
      canvasHeight: 600 * dpr,
      dpr,
    }),
    getNibBridge: opts.beginNib ? () => ({ beginNib: opts.beginNib! }) : undefined,
  });
}

function sample(partial: Partial<InputSample> & { x: number; y: number }): InputSample {
  return {
    t: partial.t ?? 0,
    x: partial.x,
    y: partial.y,
    inFrame: partial.inFrame ?? true,
    pinch: partial.pinch ?? false,
    pinchStrength: partial.pinch ? 1 : 0,
    nib: partial.nib,
    source: partial.source ?? "mouse",
  };
}

function drawLine(ctrl: CanvasController, x0: number, y0: number, x1: number, y1: number, source: "mouse" | "hand" = "mouse") {
  const mk = (x: number, y: number, pinch: boolean, t: number): InputSample =>
    source === "hand"
      ? sample({ t, x: x + 200, y: y + 200, nib: { x, y }, pinch, source: "hand" })
      : sample({ t, x, y, pinch, source: "mouse" });
  ctrl.feedSample(mk(x0, y0, true, 10));
  ctrl.feedSample(mk((x0 + x1) / 2, (y0 + y1) / 2, true, 20));
  ctrl.feedSample(mk(x1, y1, true, 30));
  ctrl.feedSample(mk(x1, y1, false, 40));
}

describe("CanvasController (O-7, O-13, O-14, 5 tools, nib & mouse)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws with mouse (x, y) and hand (nib) and produces normalized DrawingInput", () => {
    const used: CanvasToolId[] = [];
    const ctrl = makeController({ onToolUsed: (t) => used.push(t) });

    // Hand mode: draws at nib (100, 150)->(300, 150), NOT at MCP5 (300, 350)->(500, 350).
    drawLine(ctrl, 100, 150, 300, 150, "hand");
    expect(ctrl.store.getStrokes().completed).toEqual([
      [
        { x: 100, y: 150 },
        { x: 200, y: 150 },
        { x: 300, y: 150 },
      ],
    ]);
    expect(used).toEqual(["pencil"]);
    expect(ctrl.getState().hasInk).toBe(true);

    // Mouse mode: draws at (x, y).
    drawLine(ctrl, 100, 300, 300, 300, "mouse");
    expect(ctrl.store.getStrokes().completed).toHaveLength(2);

    const input = ctrl.toDrawingInput();
    expect(input.hasInk).toBe(true);
    expect(input.strokes).toHaveLength(2);

    // Surface adapter exposes exact same toDrawingInput() for SketchbookApp.
    expect(ctrl.toSurfaceAdapter().toDrawingInput()).toEqual(input);
  });

  it("uses beginNib rollback points when hand starts a stroke", () => {
    const ctrl = makeController({
      beginNib: () => [
        { x: 40, y: 50, t: 0 },
        { x: 60, y: 50, t: 10 },
      ],
    });
    ctrl.feedSample(sample({ t: 20, x: 300, y: 300, nib: { x: 80, y: 50 }, pinch: true, source: "hand" }));
    ctrl.feedSample(sample({ t: 40, x: 320, y: 300, nib: { x: 100, y: 50 }, pinch: true, source: "hand" }));
    ctrl.feedSample(sample({ t: 60, x: 320, y: 300, nib: { x: 100, y: 50 }, pinch: false, source: "hand" }));

    expect(ctrl.store.getStrokes().completed[0]).toEqual([
      { x: 40, y: 50 },
      { x: 60, y: 50 },
      { x: 100, y: 50 },
    ]);
  });

  it("cuts segments (eraseSegments = true, O-7) with 22 px CSS radius scaled by DPR", () => {
    const used: CanvasToolId[] = [];
    const ctrl = makeController({ dpr: 2, onToolUsed: (t) => used.push(t) });
    expect(ctrl.store.eraseSegments).toBe(true);
    expect(ctrl.eraserRadiusCanvasPx()).toBe(ERASER_RADIUS_PX * 2); // 44 canvas px at 2x DPR

    // Draw sparse horizontal stroke across x=100..500 (at 2x DPR: 200..1000 canvas px).
    ctrl.feedSample(sample({ t: 10, x: 100, y: 200, pinch: true }));
    ctrl.feedSample(sample({ t: 20, x: 500, y: 200, pinch: true }));
    ctrl.feedSample(sample({ t: 30, x: 500, y: 200, pinch: false }));
    expect(ctrl.store.getStrokes().completed).toHaveLength(1);

    // Erase across the middle of the sparse segment (x=300 viewport = 600 canvas px, no vertex nearby).
    expect(ctrl.selectTool("eraser")).toBe(true);
    expect(ctrl.store.eraserMode).toBe(true);
    ctrl.feedSample(sample({ t: 40, x: 300, y: 200, pinch: true }));
    ctrl.feedSample(sample({ t: 50, x: 300, y: 200, pinch: false }));

    const pieces = ctrl.store.getStrokes().completed;
    expect(pieces).toHaveLength(2);
    expect(pieces[0]![1]!.x).toBeCloseTo(600 - ERASER_RADIUS_PX * 2, 5);
    expect(pieces[1]![0]!.x).toBeCloseTo(600 + ERASER_RADIUS_PX * 2, 5);
    expect(used).toEqual(["pencil", "eraser"]);
  });

  it("supports undo, redo, and Bersihkan (wipe) + undo restoring all strokes", () => {
    const used: CanvasToolId[] = [];
    const ctrl = makeController({ onToolUsed: (t) => used.push(t) });

    // Empty wipe/undo/redo do nothing and do not mark tool used.
    expect(ctrl.selectTool("clear")).toBe(false);
    expect(ctrl.selectTool("undo")).toBe(false);
    expect(ctrl.selectTool("redo")).toBe(false);
    expect(used).toEqual([]);

    drawLine(ctrl, 50, 50, 150, 50);
    drawLine(ctrl, 50, 120, 150, 120);
    expect(ctrl.store.getStrokes().completed).toHaveLength(2);

    // Undo & redo one stroke
    expect(ctrl.selectTool("undo")).toBe(true);
    expect(ctrl.store.getStrokes().completed).toHaveLength(1);
    expect(ctrl.selectTool("redo")).toBe(true);
    expect(ctrl.store.getStrokes().completed).toHaveLength(2);

    // Clear (Bersihkan) wipes all as one undo step
    expect(ctrl.selectTool("clear")).toBe(true);
    expect(ctrl.store.getStrokes().completed).toHaveLength(0);
    expect(ctrl.getState().hasInk).toBe(false);

    // Undo restores all strokes
    expect(ctrl.selectTool("undo")).toBe(true);
    expect(ctrl.store.getStrokes().completed).toHaveLength(2);
    expect(ctrl.getState().hasInk).toBe(true);

    expect(used).toEqual(["pencil", "pencil", "undo", "redo", "clear", "undo"]);
  });

  it("triggers idleReady after GUESS_IDLE_MS (1000 ms, O-14) with ink, and never auto-predicts while drawing (O-13)", () => {
    const idleEvents: boolean[] = [];
    const ctrl = makeController();
    ctrl.subscribe((s) => idleEvents.push(s.idleReady));

    // Empty canvas stays idleReady = false even after 5000 ms.
    vi.advanceTimersByTime(5000);
    expect(ctrl.getState().idleReady).toBe(false);

    // While drawing (pinch held), idleReady stays false.
    ctrl.feedSample(sample({ t: 10, x: 100, y: 100, pinch: true }));
    ctrl.feedSample(sample({ t: 20, x: 200, y: 100, pinch: true }));
    vi.advanceTimersByTime(2500);
    expect(ctrl.getState().idleReady).toBe(false);

    // Release pinch: idle clock starts (GUESS_IDLE_MS = 1000 ms).
    ctrl.feedSample(sample({ t: 2530, x: 200, y: 100, pinch: false }));
    vi.advanceTimersByTime(GUESS_IDLE_MS - 10);
    expect(ctrl.getState().idleReady).toBe(false);

    vi.advanceTimersByTime(20);
    expect(ctrl.getState().idleReady).toBe(true);
    expect(idleEvents[idleEvents.length - 1]).toBe(true);

    // Hovering without pinch (moving toward GuessRing) does NOT dismiss idleReady.
    ctrl.feedSample(sample({ t: 3600, x: 450, y: 250, pinch: false }));
    expect(ctrl.getState().idleReady).toBe(true);

    // Starting another stroke resets idleReady immediately until idle again.
    ctrl.feedSample(sample({ t: 3700, x: 150, y: 200, pinch: true }));
    expect(ctrl.getState().idleReady).toBe(false);
  });

  it("computes CSS viewport bounding box for GuessRing placement", () => {
    const ctrl = makeController({ dpr: 2 });
    expect(ctrl.getDrawingViewportRect()).toBeNull();
    drawLine(ctrl, 120, 80, 320, 240);
    const rect = ctrl.getDrawingViewportRect();
    expect(rect).toEqual({
      left: 120,
      top: 80,
      right: 320,
      bottom: 240,
      width: 200,
      height: 160,
    });
  });
});
