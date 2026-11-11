/**
 * S1 — the decided drawing as a sticker on the sky canvas (REVISI §18A, §18C MODE_CANVAS_STAMP_READY).
 * Thumbs-up held 2 s throws it once (after the 1.2 s slide); open palm held 2 s draws again; pinch does nothing here;
 * the canvas takes no ink while the sticker is up. Fake timers, fake surface: the test plays the hand's poses.
 */
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingScreen, type DrawingStamp } from "@/src/components/drawing/DrawingScreen";
import { STAMP_HOLD_MS, STAMP_THROW_MS } from "@/src/components/drawing/StickerStamp";
import { LEVELS } from "@/src/domain/levels";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import type { HandPose } from "@/src/input/hand-gesture";

interface FakeSurface {
  setInkEnabled: ReturnType<typeof vi.fn>;
  options: { onPose?: (pose: HandPose, nowMs: number) => void } & Record<string, unknown>;
}
const fake = vi.hoisted(() => ({ surfaces: [] as FakeSurface[] }));

vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    store = {
      hasActiveStroke: () => false,
      lastActivePoint: () => null,
      endStroke: () => {},
      eraseAt: () => false,
      isErasing: () => false,
      endErase: () => {},
    };
    setInkEnabled = vi.fn();
    constructor(_canvas: unknown, _video: unknown, readonly options: Record<string, unknown>) {
      fake.surfaces.push(this as unknown as FakeSurface);
    }
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve({ kind: "idle" }); }
    setErasing() {}
    undo() {}
    redo() {}
    toDrawingInput() { return { strokes: [], hasInk: true, aspectRatio: 1 }; }
  },
}));

type Props = ComponentProps<typeof DrawingScreen>;
const LEVEL = LEVELS[0]!;

/** Advances the fake clock in 16 ms slices, so requestAnimationFrame loops and timers both run. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}

function pose(pose: HandPose) {
  const surface = fake.surfaces[fake.surfaces.length - 1]!;
  act(() => surface.options.onPose?.(pose, 0));
}

function renderSticker(stampExtra: Partial<DrawingStamp> = {}) {
  const stamp: DrawingStamp = {
    label: "Anjing",
    behavior: "solid",
    drawingInput: null,
    onThrow: vi.fn(),
    onRedraw: vi.fn(),
    ...stampExtra,
  };
  const props: Props = {
    level: LEVEL,
    initialMode: "hand",
    feedback: null,
    surfaceOut: { current: null },
    onSubmit: vi.fn(),
    onExit: vi.fn(),
    phase: "evaluating",
    active: false,
    stamp,
  };
  render(<DrawingScreen {...props} />);
  return { stamp, surface: fake.surfaces[fake.surfaces.length - 1]! };
}

const ring = (id: string) => screen.getByTestId(id);

describe("StickerStamp: the decided drawing waits on the canvas", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    forceInputMode("camera");
    fake.surfaces.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the sticker with its label and both rings, and the canvas takes no ink", () => {
    const { surface } = renderSticker();
    expect(screen.getByTestId("sticker-stamp")).toBeTruthy();
    expect(screen.getByAltText("Stiker Anjing")).toBeTruthy();
    expect(ring("btn-throw-sticker").textContent).toContain("Lempar");
    expect(ring("btn-redraw-sticker").textContent).toContain("Gambar lagi");
    expect(surface.setInkEnabled).toHaveBeenLastCalledWith(false);
  });

  it("a thumbs-up held for the full 2 s throws the sticker once, after the slide", () => {
    const { stamp } = renderSticker();
    advance(32);
    pose("thumb-up");
    advance(STAMP_HOLD_MS + 32);
    // The ring is gone while the sticker slides: a second confirm cannot start another throw.
    expect(screen.queryByTestId("btn-throw-sticker")).toBeNull();
    expect(stamp.onThrow).not.toHaveBeenCalled();
    advance(STAMP_THROW_MS);
    expect(stamp.onThrow).toHaveBeenCalledTimes(1);
    advance(3000);
    expect(stamp.onThrow).toHaveBeenCalledTimes(1);
  });

  it("a thumbs-up shorter than the hold does not throw", () => {
    const { stamp } = renderSticker();
    advance(32);
    pose("thumb-up");
    advance(STAMP_HOLD_MS - 500);
    pose("none");
    advance(STAMP_THROW_MS + 500);
    expect(stamp.onThrow).not.toHaveBeenCalled();
    expect(screen.getByTestId("btn-throw-sticker")).toBeTruthy();
  });

  it("an open palm held for 2 s draws again once; a thumbs-up never does", () => {
    const { stamp } = renderSticker();
    advance(32);
    pose("thumb-up");
    advance(1000);
    pose("none");
    advance(STAMP_HOLD_MS);
    expect(stamp.onRedraw).not.toHaveBeenCalled();
    expect(stamp.onThrow).not.toHaveBeenCalled();
    pose("open-palm");
    advance(STAMP_HOLD_MS + 32);
    expect(stamp.onRedraw).toHaveBeenCalledTimes(1);
    advance(2000);
    expect(stamp.onRedraw).toHaveBeenCalledTimes(1);
    expect(stamp.onThrow).not.toHaveBeenCalled();
  });

  it("pinch neither throws nor draws again, and the canvas gets no stroke while the sticker is up", () => {
    const { stamp, surface } = renderSticker();
    advance(32);
    pose("pinch");
    advance(4000);
    expect(stamp.onThrow).not.toHaveBeenCalled();
    expect(stamp.onRedraw).not.toHaveBeenCalled();
    expect(surface.setInkEnabled).toHaveBeenLastCalledWith(false);
  });

  it("the fallback press holds the same ring: a press of 2 s throws once", () => {
    const { stamp } = renderSticker();
    advance(32);
    fireEvent.pointerDown(ring("btn-throw-sticker"));
    advance(STAMP_HOLD_MS + STAMP_THROW_MS + 64);
    expect(stamp.onThrow).toHaveBeenCalledTimes(1);
  });

  it("without a sticker the canvas shows no sticker and the ink gate follows the screen", () => {
    const props: Props = {
      level: LEVEL,
      initialMode: "hand",
      feedback: null,
      surfaceOut: { current: null },
      onSubmit: vi.fn(),
      onExit: vi.fn(),
      phase: "drawing",
      active: true,
      showCanvasFocus: false,
    };
    render(<DrawingScreen {...props} />);
    expect(screen.queryByTestId("sticker-stamp")).toBeNull();
    expect(fake.surfaces[fake.surfaces.length - 1]!.setInkEnabled).toHaveBeenLastCalledWith(true);
  });
});
