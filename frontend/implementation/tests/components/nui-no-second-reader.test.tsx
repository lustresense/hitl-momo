import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, retireHand } from "@/src/camera/hand-cursor-store";
import { acquireThumbTracker } from "@/src/camera/thumb-tracker";
import { DrawingActions } from "@/src/components/drawing/DrawingActions";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { StageHeader } from "@/src/components/game/StageHeader";
import { MissionBriefing } from "@/src/components/mission/MissionBriefing";
import { LEVELS } from "@/src/domain/levels";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

// The drawing surface and the stage already run one hand reader each. A dwell button on such a screen must use
// that reader's fingertip and must not start the shared thumb tracker as a second reader (a second MediaPipe model
// on the same camera). Without a reader on the screen, the dwell does start the one shared tracker.
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});
vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve({ kind: "idle" }); }
    setErasing() {}
    clear() {}
    undo() {}
    redo() {}
    setEraserRadius(px: number) { return px; }
    toDrawingInput() { return { strokes: [], hasInk: false, aspectRatio: 1 }; }
  },
}));

const config = getMissionConfigForLevel(LEVELS[0]!, "Custom Thinman");

beforeEach(() => {
  resetInputModeForTest();
  forceInputMode("camera");
  resetHandCursorForTest();
  // The drawing surface's driver is the reader on these screens (it publishes from the moment it starts).
  publishHand({ cursor: null, source: "drawing" });
  vi.mocked(acquireThumbTracker).mockClear();
});
afterEach(() => {
  cleanup();
  resetInputModeForTest();
  resetHandCursorForTest();
  vi.useRealTimers();
});

describe("camera mode on the stage and drawing screens starts no second hand tracker", () => {
  it("the stage header", () => {
    render(
      <StageHeader
        characterName="Thinman"
        decision={{ type: "accept", finalLabel: "papan", sourceRank: 1 }}
        onDrawAgain={vi.fn()}
      />,
    );
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });

  it("the mission hint", () => {
    render(<MissionBriefing isOpen config={config} onStartDrawing={vi.fn()} onClose={vi.fn()} />);
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });

  it("the drawing screen with its corner buttons", () => {
    render(
      <DrawingScreen
        level={LEVELS[0]!}
        initialMode="pointer"
        feedback={null}
        surfaceOut={{ current: null }}
        onSubmit={vi.fn()}
        onExit={vi.fn()}
        missionConfig={config}
        onOpenMission={vi.fn()}
      />,
    );
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });

  it("the Tebak button with ink (its finish ring takes the surface's thumb, not a tracker)", () => {
    render(
      <DrawingActions
        phase="drawing"
        active
        inputMode="hand"
        hasInk
        onSwitchMode={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });
});

describe("without a page reader the dwell buttons share one tracker", () => {
  it("the drawing screen starts the tracker after the short start-up wait", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    act(() => retireHand("drawing"));
    render(
      <DrawingScreen
        level={LEVELS[0]!}
        initialMode="pointer"
        feedback={null}
        surfaceOut={{ current: null }}
        onSubmit={vi.fn()}
        onExit={vi.fn()}
        missionConfig={config}
        onOpenMission={vi.fn()}
      />,
    );
    expect(acquireThumbTracker).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(acquireThumbTracker).toHaveBeenCalled();
  });
});
