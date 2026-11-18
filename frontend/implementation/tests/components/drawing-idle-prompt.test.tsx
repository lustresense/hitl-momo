import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { IDLE_PROMPT_MS } from "@/src/components/drawing/hooks/useDrawingIdle";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";

interface FakeSurface {
  ink: boolean;
  options: { onInkChange?: (hasInk: boolean) => void; onPose?: (pose: string, nowMs: number) => void };
}
const fake = vi.hoisted(() => ({ surfaces: [] as FakeSurface[] }));

vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    ink = false;
    constructor(_canvas: unknown, _video: unknown, readonly options: FakeSurface["options"]) {
      fake.surfaces.push(this as unknown as FakeSurface);
    }
    store = {
      hasActiveStroke: () => false,
      lastActivePoint: () => null,
      endStroke: () => {},
      eraseAt: () => false,
      isErasing: () => false,
      endErase: () => {},
    };
    setInkEnabled() {}
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve({ kind: "idle" }); }
    setErasing() {}
    undo() {}
    redo() {}
    toDrawingInput() { return { strokes: [], hasInk: this.ink, aspectRatio: 1 }; }
  },
}));

type Props = ComponentProps<typeof DrawingScreen>;
const PROMPT_POINTER = "Sudah selesai gambarnya? Kalau sudah, tekan ikon jempol di kanan bawah, ya.";
const PROMPT_CAMERA = "Sudah selesai gambarnya? Kalau sudah, acungkan jempol, ya.";

/**
 * Moves the fake clock in 20 ms slices. Momo's lines run a chain of timers (each stage schedules the next one after
 * React has re-rendered), so one long jump would stop after the first stage.
 */
function runFor(ms: number) {
  for (let t = 0; t < ms; t += 20) {
    act(() => {
      vi.advanceTimersByTime(20);
    });
  }
}

/** Draws the student's first stroke: the surface reports ink, and the screen shows the finish ring. */
function putInk(surface: FakeSurface) {
  surface.ink = true;
  act(() => surface.options.onInkChange?.(true));
}

function renderDrawing(extra: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  render(
    <DrawingScreen
      level={LEVELS[0]!}
      initialMode="pointer"
      feedback={null}
      surfaceOut={{ current: null }}
      onSubmit={onSubmit}
      onExit={vi.fn()}
      phase="drawing"
      showCanvasFocus={false}
      {...extra}
    />,
  );
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
const canvas = () => screen.getByTestId("draw-canvas");
const bubbleText = () => document.querySelector(".momo-bubble")?.textContent ?? "";

describe("drawing idle prompt (REVISI §14, BIGPROMPT §6.6.3): 10 s without brush or eraser", () => {
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

  it("IDLE_PROMPT_MS is ten seconds", () => {
    expect(IDLE_PROMPT_MS).toBe(10000);
  });

  it("no prompt before the student has put any ink on the canvas", () => {
    renderDrawing();
    runFor(IDLE_PROMPT_MS + 5000);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
  });

  it("after 10 s without activity the indicator lights and Momo asks, without predicting", () => {
    forceInputMode("fallback");
    const { onSubmit, surface } = renderDrawing();
    putInk(surface);
    runFor(200);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
    runFor(IDLE_PROMPT_MS);
    expect(section().getAttribute("data-idle-prompt")).toBe("on");
    runUntil(() => bubbleText().includes(PROMPT_POINTER));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("holding the pen (pointer press on the canvas) is activity: no prompt while it is down", () => {
    const { surface } = renderDrawing();
    putInk(surface);
    fireEvent.pointerDown(canvas());
    runFor(IDLE_PROMPT_MS + 4000);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
    fireEvent.pointerUp(window);
    runFor(IDLE_PROMPT_MS - 100);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
    runFor(200);
    expect(section().getAttribute("data-idle-prompt")).toBe("on");
  });

  it("a new press after the prompt puts the indicator back to faded and restarts the 10 s", () => {
    const { surface } = renderDrawing();
    putInk(surface);
    runFor(IDLE_PROMPT_MS + 100);
    expect(section().getAttribute("data-idle-prompt")).toBe("on");
    fireEvent.pointerDown(canvas());
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
    fireEvent.pointerUp(window);
    runFor(IDLE_PROMPT_MS - 100);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
  });

  it("a pinch or fist held in camera mode counts as activity; releasing restarts the count", () => {
    forceInputMode("camera");
    const { surface } = renderDrawing();
    putInk(surface);
    act(() => surface.options.onPose?.("pinch", 0));
    runFor(IDLE_PROMPT_MS + 2000);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
    act(() => surface.options.onPose?.("fist", 0));
    act(() => surface.options.onPose?.("ready", 0));
    runFor(IDLE_PROMPT_MS - 100);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
    runFor(200);
    expect(section().getAttribute("data-idle-prompt")).toBe("on");
    runUntil(() => bubbleText().includes(PROMPT_CAMERA));
  });

  it("the camera copy asks for the thumb; the mouse copy points at the ring", () => {
    forceInputMode("camera");
    const { surface } = renderDrawing();
    putInk(surface);
    runFor(IDLE_PROMPT_MS);
    runUntil(() => bubbleText().includes(PROMPT_CAMERA));
  });

  it("the finish indicator is faded while drawing and has a one-off 3 s wiggle when it lights (CSS contract)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/drawing/drawing-finish.css"), "utf8");
    expect(css).toMatch(/#screen-drawing\[data-idle-prompt="off"\] \.drawing-finish\s*\{[^}]*opacity:\s*0\.[0-4]/);
    expect(css).toMatch(/#screen-drawing\[data-idle-prompt="on"\] \.drawing-finish\s*\{[^}]*animation:[^;]*3s[^;]*1/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*data-idle-prompt="on"\][^}]*animation:\s*none/);
  });

  it("no idle timer runs while the focus phase or the mission hint covers the screen", () => {
    const { surface } = renderDrawing({ showCanvasFocus: true });
    putInk(surface);
    runFor(IDLE_PROMPT_MS + 5000);
    expect(section().getAttribute("data-idle-prompt")).toBe("off");
  });
});
