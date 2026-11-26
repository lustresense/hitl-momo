// @vitest-environment jsdom
import { useEffect, useRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEVELS, type LevelDefinition } from "@/src/domain/levels";

const lifecycleEvents: string[] = [];
let currentLevel: LevelDefinition = LEVELS[0]!;

vi.mock("@/src/app/hooks/useR83AppState", () => ({
  useR83AppState: () => ({
    route: { kind: "level", level: currentLevel },
    characterDisplayName: "Momo",
    classroom: { joinToken: null, joinInfo: null, isJoined: false },
    joinStatus: "none",
    rulerConfirmed: false,
    camera: { cameraActive: false, cameraState: { status: "idle" }, onCameraToggle: vi.fn(), onCameraDeviceChange: vi.fn() },
    studentName: "",
    fromName: false,
    completedStages: new Set<number>(),
    freshUnlockStage: null,
    hasFinishedAll: false,
    routeNotice: null,
    introPlaying: false,
    activeLevel: currentLevel,
    controller: { phase: "falling" },
    snapshot: { phase: "falling", levelId: currentLevel.levelId, behavior: "solid", decision: { type: "accept", finalLabel: "tangga", sourceRank: 1 } },
    providerMode: "mock",
    surfaceRef: { current: null },
    drawingRevision: 0,
    canvasPhase: "drawing",
    worldPhase: "falling",
    stamp: null,
    missionOpen: false,
    setMissionOpen: vi.fn(),
    creations: { snapshot: () => [] },
    recaps: [],
    handleRulerConfirm: vi.fn(),
    handleCoverComplete: vi.fn(),
    handleTutorialStart: vi.fn(),
    handleSelectLevel: vi.fn(),
    handleIntroFinish: vi.fn(),
    handleSubmitDrawing: vi.fn(),
    handleExitCanvas: vi.fn(),
    handleBumpDrawingRevision: vi.fn(),
    handleBackFromWorld: vi.fn(),
    handleWon: vi.fn(),
    handleEndingChoose: vi.fn(),
    handleCreationsChange: vi.fn(),
  }),
}));

vi.mock("@/src/features/world", () => ({
  WorldIntroOverlay: () => null,
  WorldScreen: ({ level }: { level: LevelDefinition }) => {
    const mountedLevel = useRef(level.levelId).current;
    useEffect(() => {
      lifecycleEvents.push(`mount:${mountedLevel}`);
      return () => {
        lifecycleEvents.push(`unmount:${mountedLevel}`);
      };
    }, [mountedLevel]);
    return <div data-testid="mock-world" data-level={mountedLevel} />;
  },
}));

import { R83SketchbookShell } from "@/src/app/R83SketchbookShell";

describe("R83SketchbookShell <WorldScreen> key remount", () => {
  afterEach(() => {
    cleanup();
    lifecycleEvents.length = 0;
    currentLevel = LEVELS[0]!;
  });

  it("unmounts and remounts WorldScreen cleanly when activeLevel.levelId changes", () => {
    currentLevel = LEVELS[0]!;
    const { rerender } = render(<R83SketchbookShell />);
    expect(screen.getByTestId("mock-world").getAttribute("data-level")).toBe("stage-1-foundation");
    expect(lifecycleEvents).toEqual(["mount:stage-1-foundation"]);

    currentLevel = LEVELS[1]!;
    rerender(<R83SketchbookShell />);
    expect(screen.getByTestId("mock-world").getAttribute("data-level")).toBe("stage-2-ambiguity");
    expect(lifecycleEvents).toEqual([
      "mount:stage-1-foundation",
      "unmount:stage-1-foundation",
      "mount:stage-2-ambiguity",
    ]);
  });
});
