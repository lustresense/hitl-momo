import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";

// Fake surface: records the ink gate so the test can check the canvas takes no strokes during the focus phase.
interface FakeSurface {
  setInkEnabled: ReturnType<typeof vi.fn>;
  options: Record<string, unknown>;
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
    toDrawingInput() { return { strokes: [], hasInk: false, aspectRatio: 1 }; }
  },
}));

type Props = ComponentProps<typeof DrawingScreen>;
const LEVEL = LEVELS[0]!;

function renderDrawing(extra: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  const props: Props = {
    level: LEVEL,
    initialMode: "pointer",
    feedback: null,
    surfaceOut: { current: null },
    onSubmit,
    onExit: vi.fn(),
    ...extra,
  };
  render(<DrawingScreen {...props} />);
  return { onSubmit, surface: fake.surfaces[fake.surfaces.length - 1]! };
}

/**
 * Advances the fake clock in 20 ms slices until `done` holds. Momo's typing and reading pauses run as a timer chain
 * (each stage schedules the next after React re-renders), so one long jump would stop after the first stage.
 */
function runUntil(done: () => boolean, maxMs = 60000) {
  for (let t = 0; t < maxMs && !done(); t += 20) {
    act(() => {
      vi.advanceTimersByTime(20);
    });
  }
  expect(done()).toBe(true);
}

const section = () => document.getElementById("screen-drawing") as HTMLElement;
const backdrop = () => screen.queryByTestId("drawing-focus-backdrop");
const startThumb = () => screen.queryByTestId("btn-focus-start");
const bubbleText = () => document.querySelector(".momo-bubble")?.textContent ?? "";
const TOOL_LINE_1 = "Ini empat alat di sebelah kanan.";
const TOOL_LINE_MOUSE = "Ini empat alat di sebelah kanan: Gambar, Hapus, Mundur, dan Maju.";
const TOOL_LINE_LAST = "Mundur: tunjukkan dua jari. Maju: tunjukkan telapak tangan.";
const CATALOG_LAST_LINE = "Kalau sudah siap, acungkan jempol dan tahan.";
const CUE_LINE = "Gambar objekmu dulu, ya. Nanti aku coba tebak!";

describe("drawing canvas focus phase (REVISI §13: dark backdrop, tool review, catalog, Mulai Menggambar)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    fake.surfaces.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetInputModeForTest();
  });

  it("on arrival the screen goes dark, the canvas takes no ink and Momo reviews the tools", () => {
    const { surface } = renderDrawing({ phase: "drawing" });
    expect(backdrop()).not.toBeNull();
    expect(section().getAttribute("data-focus")).toBe("tools");
    expect(surface.setInkEnabled).toHaveBeenLastCalledWith(false);
    expect((screen.getByTestId("draw-canvas") as HTMLElement).style.pointerEvents).toBe("none");
    runUntil(() => bubbleText().includes(TOOL_LINE_1));
  });

  it("after the four tool lines and their pause the catalog of this level is shown, with no thumb yet", () => {
    renderDrawing({ phase: "drawing" });
    runUntil(() => section().getAttribute("data-focus") === "catalog");
    expect(startThumb()).toBeNull();
    expect(screen.queryAllByRole("listitem").length).toBe(0);
    runUntil(() => bubbleText().includes(CATALOG_LAST_LINE));
    // The chips and the thumb appear once the last catalog line has had its reading pause.
    runUntil(() => startThumb() !== null);
    for (const item of LEVEL.catalog) expect(screen.getByText(item.displayName)).toBeTruthy();
    expect(startThumb()?.textContent).toContain("Mulai Menggambar");
  });

  it("holding the thumb for a full second starts drawing: backdrop gone, canvas and ink open, Momo's cue returns", () => {
    forceInputMode("fallback");
    const { onSubmit, surface } = renderDrawing({ phase: "drawing" });
    runUntil(() => startThumb() !== null);
    // The ring arms after it has seen "no thumb" once; a moment on screen is enough.
    for (let t = 0; t < 200; t += 20) act(() => { vi.advanceTimersByTime(20); });
    fireEvent.pointerDown(startThumb()!);
    runUntil(() => backdrop() === null);
    expect(section().getAttribute("data-focus")).toBe("off");
    expect(surface.setInkEnabled).toHaveBeenLastCalledWith(true);
    expect((screen.getByTestId("draw-canvas") as HTMLElement).style.pointerEvents).toBe("auto");
    runUntil(() => bubbleText().includes(CUE_LINE));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a thumb held for less than a second does not start drawing", () => {
    forceInputMode("fallback");
    renderDrawing({ phase: "drawing" });
    runUntil(() => startThumb() !== null);
    fireEvent.pointerDown(startThumb()!);
    for (let t = 0; t < 900; t += 20) act(() => { vi.advanceTimersByTime(20); });
    fireEvent.pointerUp(startThumb()!);
    for (let t = 0; t < 2000; t += 20) act(() => { vi.advanceTimersByTime(20); });
    expect(backdrop()).not.toBeNull();
  });

  it("the Top-3 card and the prediction thumb never show during the focus phase", () => {
    renderDrawing({ phase: "drawing" });
    runUntil(() => startThumb() !== null);
    expect(screen.queryByTestId("btn-finish-drawing")).toBeNull();
    expect(screen.queryByTestId("popup-evaluating")).toBeNull();
  });

  it("the review uses the mouse copy (names the tools) in pointer mode", () => {
    forceInputMode("fallback");
    renderDrawing({ phase: "drawing" });
    runUntil(() => bubbleText().includes(TOOL_LINE_MOUSE));
  });

  it("the review names the gestures in camera mode", () => {
    forceInputMode("camera");
    renderDrawing({ phase: "drawing" });
    runUntil(() => bubbleText().includes(TOOL_LINE_1));
    runUntil(() => bubbleText().includes(TOOL_LINE_LAST));
  });

  it("the toolbar is raised above the backdrop during the tool review only", () => {
    renderDrawing({ phase: "drawing" });
    expect(section().getAttribute("data-focus")).toBe("tools");
    runUntil(() => section().getAttribute("data-focus") === "catalog");
  });

  it("showCanvasFocus={false} keeps the plain drawing screen: no backdrop, canvas open, Momo's cue at once", () => {
    const { surface } = renderDrawing({ phase: "drawing", showCanvasFocus: false });
    expect(backdrop()).toBeNull();
    expect(surface.setInkEnabled).toHaveBeenLastCalledWith(true);
    expect((screen.getByTestId("draw-canvas") as HTMLElement).style.pointerEvents).toBe("auto");
    runUntil(() => bubbleText().includes(CUE_LINE));
  });

  it("no focus phase while Momo predicts or the result is shown", () => {
    renderDrawing({ phase: "evaluating", showCanvasFocus: true });
    expect(backdrop()).toBeNull();
  });
});
