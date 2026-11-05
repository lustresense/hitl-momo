"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { getLevel, type LevelDefinition } from "@/src/domain/levels";
import type { DrawingSurface } from "@/src/input";
import { useFlowSnapshot } from "@/src/hooks/use-flow";
import { env } from "@/src/config/env";
import { MomoBubble } from "@/src/components/momo/MomoBubble";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { StudentRulerSelector } from "@/src/components/onboarding/StudentRulerSelector";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { DEFAULT_CHARACTER_NAME, resolveCharacterDisplayName } from "@/src/config/character-tokens";
import { isLevelUnlocked } from "./level-progress";
import { useEntryHold } from "./hooks/useEntryHold";
import { useLevelCompletion } from "./hooks/useLevelCompletion";
import { useLevelSession } from "./hooks/useLevelSession";
import { useRouteState } from "./hooks/useRouteState";
import { useRouteSync } from "./hooks/useRouteSync";
import { AppShell } from "./screens/AppShell";
import { DrawingFlowScreen } from "./screens/DrawingFlowScreen";
import { GameplayScreen } from "./screens/GameplayScreen";
import { LevelEntryScreen } from "./screens/LevelEntryScreen";

/**
 * TASK 01/03 & UI OVERHAUL — Application shell (client-only).
 * Owns the FlowController instance (single source of truth) and maps phases
 * to screens. Persistent global camera widget stays mounted across all routes.
 */
export function SketchbookApp() {
  const characterDisplayName = resolveCharacterDisplayName(
    process.env.NEXT_PUBLIC_CHARACTER_DISPLAY_NAME ?? DEFAULT_CHARACTER_NAME,
  );
  const route = useRouteState();
  const session = useLevelSession(route);
  const { entryHold, startEntryHold } = useEntryHold();
  const { onboarding, routeNotice } = route;
  const { controller, creationsRef } = session;
  const surfaceRef = useRef<DrawingSurface | null>(null);
  const snapshot = useFlowSnapshot(controller);
  const [drawingRevision, setDrawingRevision] = useState(0);
  const { navigateTo } = useRouteSync(route, session);

  const level = useMemo(
    () => (snapshot?.levelId ? getLevel(snapshot.levelId) ?? null : null),
    [snapshot?.levelId],
  );
  useLevelCompletion(snapshot);

  const { enterLevel } = session;
  const selectLevel = useCallback(
    (selected: LevelDefinition) => {
      startEntryHold();
      enterLevel(selected);
    },
    [startEntryHold, enterLevel],
  );

  async function handleSubmitDrawing() {
    if (!controller || !surfaceRef.current || controller.getSnapshot().phase !== "drawing") return;
    await controller.submitDrawing(surfaceRef.current.toDrawingInput());
  }

  const isCameraCover = onboarding === "camera";
  const isNumberSelection = onboarding === "number";
  const isOnboarding = onboarding === "tutorial" || isNumberSelection;
  const isDrawing = onboarding === "levels" && snapshot?.phase === "drawing";

  const phase = snapshot?.phase ?? "level-entry";
  const isDrawingFlow =
    onboarding === "levels" &&
    (phase === "drawing" || phase === "predicting" || phase === "prediction-error" || phase === "evaluating");
  const isLevelEntry = onboarding === "levels" && (!snapshot || phase === "level-entry" || entryHold);
  const isGameplay =
    onboarding === "levels" && (phase === "falling" || phase === "placing" || phase === "gameplay");

  return (
    <AppShell mode={session.providerMode} onboarding={isCameraCover || isOnboarding || isLevelEntry}>
      {!isCameraCover && (
        <>
          {onboarding === "number" && (
            <StudentRulerSelector
              onConfirm={(selectedNumber) => {
                try {
                  window.localStorage.setItem("sketchbook.studentNumber", String(selectedNumber));
                } catch {
                  /* Continue if storage is unavailable. */
                }
                navigateTo("/onboarding/card");
              }}
            />
          )}

          {onboarding === "tutorial" && (
            <TutorialBrochure
              characterDisplayName={characterDisplayName}
              onStart={() => navigateTo("/levels")}
              onSkip={() => navigateTo("/levels")}
            />
          )}

          {isLevelEntry && (
            <LevelEntryScreen entryHold={entryHold} onSelectLevel={selectLevel} isLevelUnlocked={isLevelUnlocked} />
          )}

          {/* Hosts the drawing canvas and the floating Top-3 HITL popup. */}
          {snapshot && isDrawingFlow && level && (
            <DrawingFlowScreen
              level={level}
              snapshot={snapshot}
              phase={phase}
              controller={controller}
              providerMode={session.providerMode}
              surfaceRef={surfaceRef}
              drawingRevision={drawingRevision}
              // Wait for the level ribbons to leave before the briefing opens (they used to overlap for ~0.8 s).
              missionOpen={session.missionOpen && !entryHold}
              onOpenMission={() => session.setMissionOpen(true)}
              onCloseMission={() => session.setMissionOpen(false)}
              onSubmit={() => void handleSubmitDrawing()}
              onExit={session.exitToLevels}
            />
          )}

          {isGameplay && level && snapshot?.behavior && snapshot?.decision && controller && (
            <GameplayScreen
              level={level}
              snapshot={snapshot}
              phase={phase}
              controller={controller}
              characterDisplayName={characterDisplayName}
              creations={creationsRef.current}
              onCreationsChange={session.handleCreationsChange}
              onBumpDrawingRevision={() => setDrawingRevision((n) => n + 1)}
              onBackToLevels={session.exitToLevels}
            />
          )}
        </>
      )}

      {routeNotice && (
        <div role="alert" data-testid="route-guard-notice">
          <MomoBubble moment="level-entry" message={routeNotice} />
        </div>
      )}

      {/*
        SINGLE PERSISTENT GLOBAL CAMERA — mounted exactly once at the shell root
        and never unmounted across Cover -> Tutorial -> Levels -> Canvas, so the
        webcam MediaStream stays alive (no second permission prompt). GSAP morphs
        this one camera card node from the centered cover card into a bottom-left
        mini PIP on levels, then the same bottom-left camera placement on the canvas.
      */}
      <GlobalCamera
        mode={isCameraCover ? "cover" : "floating"}
        modelUrl={env.mediapipeModelUrl}
        recessed={isDrawing}
        onWave={() => navigateTo("/onboarding/number")}
        onSkip={() => navigateTo("/onboarding/number")}
      />
    </AppShell>
  );
}
