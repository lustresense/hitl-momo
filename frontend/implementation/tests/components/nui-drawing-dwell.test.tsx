import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, startHandHeartbeat, type HandCursorPoint } from "@/src/camera/hand-cursor-store";
import { DrawingActions } from "@/src/components/drawing/DrawingActions";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { MissionBriefing } from "@/src/components/mission/MissionBriefing";
import { LEVELS } from "@/src/domain/levels";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, type Box } from "./gesture-stub";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve({ kind: "idle" }); }
    setErasing() {}
    // useDrawingSurface wraps the store's stroke/erase methods, so the fake needs a store too.
    store = { endStroke() {}, eraseAt: () => false, hasActiveStroke: () => false, lastActivePoint: () => null };
    clear() {}
    undo() {}
    redo() {}
    setEraserRadius(px: number) { return px; }
    toDrawingInput() { return { strokes: [], hasInk: false, aspectRatio: 1 }; }
  },
}));

const config = getMissionConfigForLevel(LEVELS[0]!, "Custom Thinman");
const BOX: Box = { left: 100, top: 100, width: 240, height: 60 };
const INSIDE = cursorAtPx(200, 130);
const OUTSIDE = cursorAtPx(20, 20);

// The drawing surface's driver is the one reader: a heartbeat stands in for its frames, and feed() sets the fingertip.
let stopDriver: () => void = () => undefined;
let fingertip: HandCursorPoint | null = null;
function feed(cursor: HandCursorPoint | null) {
  fingertip = cursor;
  act(() => publishHand({ cursor, source: "drawing" }));
}
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      if (fingertip !== undefined) publishHand({ cursor: fingertip, source: "drawing" });
      vi.advanceTimersByTime(16);
    });
  }
}
/** Arms a button (fingertip outside first), then rests the fingertip on it. */
function restOn(el: HTMLElement) {
  placeBox(el, BOX);
  feed(OUTSIDE);
  advance(50);
  feed(INSIDE);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetHandCursorForTest();
  forceInputMode("camera");
  fingertip = null;
  publishHand({ cursor: null, source: "drawing" });
  stopDriver = startHandHeartbeat("drawing");
});
afterEach(() => {
  stopDriver();
  cleanup();
  resetInputModeForTest();
  resetHandCursorForTest();
  vi.useRealTimers();
});

function drawingScreen(extra: Partial<Parameters<typeof DrawingScreen>[0]> = {}) {
  const props = {
    level: LEVELS[0]!,
    initialMode: "pointer" as const,
    feedback: null,
    surfaceOut: { current: null },
    onSubmit: vi.fn(),
    onExit: vi.fn(),
    missionConfig: config,
    onOpenMission: vi.fn(),
    // The focus phase has its own tests; these start from a drawing already under way.
    showCanvasFocus: false,
    ...extra,
  };
  render(<DrawingScreen {...props} />);
  return props;
}

describe("drawing screen corners pick by dwell, and still by click", () => {
  it("the exit button fires once after its 1.8 s dwell", () => {
    const { onExit } = drawingScreen();
    restOn(screen.getByLabelText("Keluar Level"));
    advance(1700);
    expect(onExit).not.toHaveBeenCalled();
    advance(200);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("the mission hint fires once after the default dwell", () => {
    const { onOpenMission } = drawingScreen();
    restOn(screen.getByLabelText("Petunjuk Misi"));
    advance(1300);
    expect(onOpenMission).toHaveBeenCalledTimes(1);
  });

  it("a click on the exit button exits at once", () => {
    const { onExit } = drawingScreen();
    fireEvent.click(screen.getByLabelText("Keluar Level"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("both corners are off while the mission hint is open, so a resting fingertip cannot reach them", () => {
    drawingScreen({ missionOpen: true });
    expect((screen.getByLabelText("Keluar Level") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Petunjuk Misi") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Tebak Gambarku picks by dwell (2 s) and by click", () => {
  function actions(onSubmit = vi.fn()) {
    render(
      <DrawingActions phase="drawing" active inputMode="hand" hasInk onSwitchMode={vi.fn()} onSubmit={onSubmit} />,
    );
    return onSubmit;
  }

  it("fires once after 2 s with the fingertip resting on it", () => {
    const onSubmit = actions();
    // Camera mode keeps Tebak behind "Bantuan": open it first, as a student would.
    fireEvent.click(screen.getByTestId("btn-drawing-help"));
    restOn(screen.getByTestId("btn-submit-drawing"));
    advance(1900);
    expect(onSubmit).not.toHaveBeenCalled();
    advance(200);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("a click submits at once", () => {
    const onSubmit = actions();
    fireEvent.click(screen.getByTestId("btn-drawing-help"));
    fireEvent.click(screen.getByTestId("btn-submit-drawing"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("mission hint buttons pick by dwell", () => {
  function hint(onClose = vi.fn(), onStartDrawing = vi.fn()) {
    render(<MissionBriefing isOpen config={config} onStartDrawing={onStartDrawing} onClose={onClose} />);
    return { onClose, onStartDrawing };
  }

  it("the close button fires once after its dwell", () => {
    const { onClose } = hint();
    restOn(screen.getByLabelText("Tutup Petunjuk Misi"));
    advance(1300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the go button fires once after its dwell", () => {
    const { onStartDrawing } = hint();
    restOn(screen.getByText(config.primaryCtaLabel).closest("button")!);
    advance(1300);
    expect(onStartDrawing).toHaveBeenCalledTimes(1);
  });

  it("clicks still close and start", () => {
    const { onClose, onStartDrawing } = hint();
    fireEvent.click(screen.getByLabelText("Tutup Petunjuk Misi"));
    fireEvent.click(screen.getByText(config.primaryCtaLabel).closest("button")!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStartDrawing).toHaveBeenCalledTimes(1);
  });
});

describe("Hapus sizes S / M / L on the drawing screen", () => {
  it("are hidden until Hapus is on, then show and set the eraser radius", () => {
    const surfaceOut = { current: null as unknown as { setEraserRadius(px: number): number } | null };
    drawingScreen({ missionConfig: undefined, surfaceOut: surfaceOut as never });
    expect(screen.queryByRole("group", { name: "Ukuran penghapus" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    const group = screen.getByRole("group", { name: "Ukuran penghapus" });
    expect(group).toBeTruthy();
    const large = screen.getByRole("button", { name: "Hapus ukuran besar" });
    fireEvent.click(large);
    expect(large.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hapus ukuran sedang" }).getAttribute("aria-pressed")).toBe("false");
  });
});
