import type { ComponentProps } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { HAND_LOST_REVEAL_MS } from "@/src/components/drawing/DrawingActions";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";

interface FakeSurface {
  options: { onPose?: (pose: string, nowMs: number) => void };
}
const fake = vi.hoisted(() => ({ surfaces: [] as FakeSurface[] }));

vi.mock("@/src/input", () => ({
  DrawingSurface: class {
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
    toDrawingInput() { return { strokes: [], hasInk: false, aspectRatio: 1 }; }
  },
}));

type Props = ComponentProps<typeof DrawingScreen>;
const FALLBACK_SWITCH = "btn-input-pointer";

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

/** The hand tracker reports a status, the way the drawing surface publishes it on the window. */
function hand(kind: "ready" | "drawing" | "tracking-lost") {
  act(() => {
    window.dispatchEvent(new CustomEvent("hand-input-status", { detail: { kind } }));
  });
}

function renderCamera(extra: Partial<Props> = {}) {
  const props: Props = {
    level: LEVELS[0]!,
    initialMode: "hand",
    feedback: null,
    surfaceOut: { current: null },
    onSubmit: vi.fn(),
    onExit: vi.fn(),
    phase: "drawing",
    showCanvasFocus: false,
    ...extra,
  };
  render(<DrawingScreen {...props} />);
  return fake.surfaces[fake.surfaces.length - 1]!;
}

describe("hand missing reveals the fallback controls only after 15 s (REVISI: jangan pakai handPose none)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    fake.surfaces.length = 0;
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetInputModeForTest();
  });

  it("the threshold is 15 s", () => {
    expect(HAND_LOST_REVEAL_MS).toBe(15000);
  });

  it("no hand for 15 s shows the Mouse/Kamera switch and Tebak; a hand back before that hides nothing", () => {
    renderCamera();
    expect(screen.queryByTestId(FALLBACK_SWITCH)).toBeNull();
    hand("tracking-lost");
    runFor(HAND_LOST_REVEAL_MS - 500);
    expect(screen.queryByTestId(FALLBACK_SWITCH)).toBeNull();
    runFor(1000);
    expect(screen.queryByTestId(FALLBACK_SWITCH)).not.toBeNull();
    expect(screen.queryByTestId("btn-submit-drawing")).not.toBeNull();
    hand("ready");
    runFor(100);
    expect(screen.queryByTestId(FALLBACK_SWITCH)).toBeNull();
  });

  it("a pose of none alone (no tracking-lost status) is not a missing hand", () => {
    const surface = renderCamera();
    act(() => surface.options.onPose?.("none", 0));
    runFor(HAND_LOST_REVEAL_MS + 5000);
    expect(screen.queryByTestId(FALLBACK_SWITCH)).toBeNull();
  });

  it("a hand that is in view keeps the count from starting", () => {
    renderCamera();
    hand("drawing");
    runFor(HAND_LOST_REVEAL_MS + 5000);
    expect(screen.queryByTestId(FALLBACK_SWITCH)).toBeNull();
  });

  it("no count runs while the focus phase or a result covers the drawing", () => {
    renderCamera({ showCanvasFocus: true });
    hand("tracking-lost");
    runFor(HAND_LOST_REVEAL_MS + 5000);
    expect(screen.queryByTestId(FALLBACK_SWITCH)).toBeNull();
  });
});
