import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { acquireThumbTracker } from "@/src/camera/thumb-tracker";
import { publishHand, resetHandCursorForTest, startHandHeartbeat } from "@/src/camera/hand-cursor-store";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";

// Fake surface: the test plays the student by setting ink, poses and status on it.
interface FakeOptions {
  onInkChange?: (hasInk: boolean) => void;
  onPose?: (pose: string, nowMs: number) => void;
  onStatusChange?: (status: { kind: string; reason?: string; message?: string }) => void;
}
interface FakeSurface {
  options: FakeOptions;
  ink: boolean;
  toDrawingInput: ReturnType<typeof vi.fn>;
}
const fake = vi.hoisted(() => ({ surfaces: [] as FakeSurface[] }));

vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    ink = false;
    // useDrawingSurface wraps the store's stroke/erase methods, so the fake needs a store too.
    store = { endStroke() {}, eraseAt: () => false, hasActiveStroke: () => false, lastActivePoint: () => null };
    toDrawingInput = vi.fn(() => ({ strokes: this.ink ? [[{ x: 1, y: 1 }]] : [], hasInk: this.ink, aspectRatio: 1 }));
    constructor(_canvas: unknown, _video: unknown, readonly options: FakeOptions) {
      fake.surfaces.push(this as unknown as FakeSurface);
    }
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve({ kind: "idle" }); }
    setErasing() {}
    undo() {}
    redo() {}
  },
}));
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
// Spy on the shared tracker (real behaviour kept): the drawing screen must never start it for the finish ring.
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

const FINISH_LABEL = "Tahan jempol kalau sudah selesai";
type Props = ComponentProps<typeof DrawingScreen>;

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}

function renderDrawing(extra: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  const props: Props = {
    level: LEVELS[0]!,
    initialMode: "pointer",
    feedback: null,
    surfaceOut: { current: null },
    onSubmit,
    onExit: vi.fn(),
    // The focus phase (dark backdrop, tool review) hides the finish ring and Tebak; it has its own tests.
    // These tests start from a drawing that is already under way.
    showCanvasFocus: false,
    ...extra,
  };
  const view = render(<DrawingScreen {...props} />);
  const surface = fake.surfaces[fake.surfaces.length - 1]!;
  const rerenderWith = (more: Partial<Props>) => view.rerender(<DrawingScreen {...props} {...more} />);
  return { onSubmit, surface, rerenderWith };
}

/** The student puts ink on the canvas. */
function putInk(surface: FakeSurface) {
  surface.ink = true;
  act(() => surface.options.onInkChange?.(true));
}
/** The drawing surface reports the hand pose for one frame. */
function showPose(surface: FakeSurface, pose: string) {
  act(() => surface.options.onPose?.(pose, 0));
}
const finishConfirm = () => screen.queryByTestId("btn-finish-drawing");

describe("drawing finish: Momo waits for the student's thumbs-up (replaces R11 auto-ask, Owner 2026-11-09)", () => {
  beforeEach(() => {
    resetHandCursorForTest();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    fake.surfaces.length = 0;
    vi.mocked(acquireThumbTracker).mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetInputModeForTest();
  });

  it("without ink there is no finish confirm", () => {
    renderDrawing();
    expect(finishConfirm()).toBeNull();
  });

  it("with ink the finish confirm is on screen as a camera progress ring with the student's label", () => {
    const { surface } = renderDrawing();
    putInk(surface);
    expect(finishConfirm()).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: FINISH_LABEL })).toBeTruthy();
  });

  it("a thumbs-up held for 2 s confirms once, with onSubmit(null)", () => {
    const { onSubmit, surface } = renderDrawing();
    putInk(surface);
    advance(50); // the ring arms only after it has seen no thumb
    showPose(surface, "thumb-up");
    advance(1900);
    expect(onSubmit).not.toHaveBeenCalled();
    advance(300);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(null);
    advance(3000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("the drawing surface's own hand reports fill the ring and no second hand tracker is started", () => {
    // The drawing surface's driver is the one reader on this screen: it publishes while it runs (a heartbeat here).
    act(() => publishHand({ cursor: null, source: "drawing" }));
    const stopDriver = startHandHeartbeat("drawing");
    try {
      const { onSubmit, surface } = renderDrawing();
      putInk(surface);
      advance(1500); // well past the old 1 s rest: nothing may submit before the thumb
      expect(onSubmit).not.toHaveBeenCalled();
      showPose(surface, "thumb-up");
      advance(2200);
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(acquireThumbTracker).not.toHaveBeenCalled();
    } finally {
      stopDriver();
    }
  });

  it("idle with ink for 5 s and no thumb never asks by itself", () => {
    const { onSubmit, surface } = renderDrawing();
    putInk(surface);
    advance(5000);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("while the student draws Momo stays quiet: no provisional guess call and no mumble", () => {
    const { surface } = renderDrawing();
    putInk(surface);
    advance(3000);
    expect(surface.toDrawingInput).not.toHaveBeenCalled();
    // textContent, not text matchers: MomoChat may split the typed letters into separate elements.
    expect(document.body.textContent).not.toContain("hmm");
    expect(document.body.textContent).toContain("Gambar objekmu dulu, ya. Nanti aku coba tebak!");
  });

  it("the finish confirm is hidden while the mission briefing is open", () => {
    const { surface, rerenderWith } = renderDrawing();
    putInk(surface);
    expect(finishConfirm()).not.toBeNull(); // control: shows with the briefing closed
    rerenderWith({ missionOpen: true });
    expect(finishConfirm()).toBeNull();
  });

  it("the finish confirm is gone once the drawing is handed over (phase is no longer drawing)", () => {
    const { surface, rerenderWith } = renderDrawing();
    putInk(surface);
    expect(finishConfirm()).not.toBeNull();
    rerenderWith({ phase: "predicting" });
    expect(finishConfirm()).toBeNull();
  });

  it("when hand tracking stops, a thumb reported before does not confirm by itself", () => {
    const { onSubmit, surface } = renderDrawing();
    putInk(surface);
    advance(50);
    showPose(surface, "thumb-up");
    advance(1000);
    act(() => surface.options.onStatusChange?.({ kind: "error", reason: "tracker-error", message: "Kamera gagal" }));
    advance(3000);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fallback mode: holding the finish button for 2 s confirms once", () => {
    act(() => forceInputMode("fallback"));
    const { onSubmit, surface } = renderDrawing();
    putInk(surface);
    advance(50);
    const button = screen.getByRole("button", { name: FINISH_LABEL });
    fireEvent.pointerDown(button);
    advance(1900);
    expect(onSubmit).not.toHaveBeenCalled();
    advance(300);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it("the Tebak Gambarku button still submits with a plain click", () => {
    const { onSubmit, surface } = renderDrawing();
    putInk(surface);
    // Camera mode (the default) keeps Tebak behind "Bantuan": open it first, as a student would.
    fireEvent.click(screen.getByTestId("btn-drawing-help"));
    fireEvent.click(screen.getByTestId("btn-submit-drawing"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});
