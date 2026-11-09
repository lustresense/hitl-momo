import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawingActions } from "@/src/components/drawing/DrawingActions";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { MissionBriefing } from "@/src/components/mission/MissionBriefing";
import { LEVELS } from "@/src/domain/levels";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve({ kind: "idle" }); }
    setErasing() {}
    clear() {}
    undo() {}
    redo() {}
    toDrawingInput() { return { strokes: [], hasInk: false, aspectRatio: 1 }; }
  },
}));

const config = getMissionConfigForLevel(LEVELS[0]!, "Custom Thinman");

beforeEach(() => {
  resetInputModeForTest();
});
afterEach(() => {
  cleanup();
  resetInputModeForTest();
});

// These controls are plain click targets on purpose: the drawing screen's surface already runs the hand reader
// (see the notes in DrawingScreen.tsx and DrawingActions.tsx). The tests pin the click routes and the gating.

describe("MissionBriefing: start and close are clicks", () => {
  it("Mulai Menggambar starts drawing on a click", () => {
    forceInputMode("fallback");
    const onStartDrawing = vi.fn();
    render(<MissionBriefing isOpen config={config} onStartDrawing={onStartDrawing} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Mulai Menggambar/i }));
    expect(onStartDrawing).toHaveBeenCalledTimes(1);
  });

  it("Tutup Petunjuk Misi closes the hint on a click", () => {
    forceInputMode("camera");
    const onClose = vi.fn();
    render(<MissionBriefing isOpen config={config} onStartDrawing={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Tutup Petunjuk Misi/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DrawingScreen corner: Petunjuk Misi and Keluar Level", () => {
  function renderCorner(extra: { missionOpen?: boolean; onExit?: () => void; onOpenMission?: () => void }) {
    render(
      <DrawingScreen
        level={LEVELS[0]!}
        initialMode="pointer"
        feedback={null}
        surfaceOut={{ current: null }}
        onSubmit={vi.fn()}
        onExit={extra.onExit ?? vi.fn()}
        missionConfig={config}
        missionOpen={extra.missionOpen ?? false}
        onOpenMission={extra.onOpenMission ?? vi.fn()}
        onCloseMission={vi.fn()}
      />,
    );
  }

  it("Keluar Level exits and Petunjuk Misi opens the hint on a click", () => {
    forceInputMode("fallback");
    const onExit = vi.fn();
    const onOpenMission = vi.fn();
    renderCorner({ onExit, onOpenMission });
    fireEvent.click(screen.getByRole("button", { name: "Keluar Level" }));
    fireEvent.click(screen.getByRole("button", { name: "Petunjuk Misi" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onOpenMission).toHaveBeenCalledTimes(1);
  });

  it("the corner buttons keep their names and tooltips", () => {
    forceInputMode("fallback");
    renderCorner({});
    expect(screen.getByRole("button", { name: "Keluar Level" }).getAttribute("title")).toBe("Keluar level");
    expect(screen.getByRole("button", { name: "Petunjuk Misi" }).getAttribute("title")).toBe("Petunjuk misi");
  });

  it("while the mission hint covers the screen, both corner buttons are disabled and cannot be clicked", () => {
    forceInputMode("fallback");
    const onExit = vi.fn();
    renderCorner({ missionOpen: true, onExit });
    const exit = screen.getByRole("button", { name: "Keluar Level" });
    const hint = screen.getByRole("button", { name: "Petunjuk Misi" });
    expect(exit.hasAttribute("disabled")).toBe(true);
    expect(hint.hasAttribute("disabled")).toBe(true);
    fireEvent.click(exit);
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe("DrawingActions: Tebak Gambarku", () => {
  const base = { phase: "drawing", active: true, inputMode: "hand" as const, onSwitchMode: vi.fn() };

  it("with ink, a click submits once", () => {
    forceInputMode("fallback");
    const onSubmit = vi.fn();
    render(<DrawingActions {...base} hasInk onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId("btn-submit-drawing"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("without ink the button is disabled", () => {
    forceInputMode("fallback");
    const onSubmit = vi.fn();
    render(<DrawingActions {...base} hasInk={false} onSubmit={onSubmit} />);
    const submit = screen.getByTestId("btn-submit-drawing");
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("while the mission hint is open it is disabled, so nothing can submit through the hint", () => {
    forceInputMode("fallback");
    const onSubmit = vi.fn();
    render(<DrawingActions {...base} hasInk finishPaused onSubmit={onSubmit} />);
    const submit = screen.getByTestId("btn-submit-drawing");
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
