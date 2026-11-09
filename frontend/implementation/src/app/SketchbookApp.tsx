"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLevel, type LevelDefinition } from "@/src/domain/levels";
import type { DrawingSurface } from "@/src/input";
import { useFlowSnapshot } from "@/src/hooks/use-flow";
import { env } from "@/src/config/env";
import { MomoBubble } from "@/src/components/momo/MomoBubble";
import { LevelIntro } from "@/src/components/level/LevelIntro";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { StudentRulerSelector } from "@/src/components/onboarding/StudentRulerSelector";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { DEFAULT_CHARACTER_NAME, resolveCharacterDisplayName } from "@/src/config/character-tokens";
import { isLevelUnlocked } from "./level-progress";
import { useEntryHold } from "./hooks/useEntryHold";
import { recapFromFlow, useLevelSession } from "./hooks/useLevelSession";
import { useClassroomSession } from "./hooks/useClassroomSession";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import { BookFlip } from "@/src/components/ui/BookFlip";
import type { EndingChoice } from "@/src/components/ending/ending-types";
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
  const classroom = useClassroomSession();
  // Level callbacks can outlive the render that created them (route effects keep the first one).
  // Read the latest classroom state through a ref so a decision always sees the current join.
  const classroomRef = useRef(classroom);
  classroomRef.current = classroom;
  const session = useLevelSession(route, {
    outbox: classroom.outbox,
    tokenProvider: () => classroomRef.current.session?.student_session_token,
    classContext: () => {
      const c = classroomRef.current;
      return c.joinToken && c.session ? { joinToken: c.joinToken, studentId: c.session.student_id } : null;
    },
  });
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

  const { enterLevel, willPlayIntro, provider, recordRecap } = session;
  const [book, setBook] = useState<{ key: number; direction: "open" | "close" }>({ key: 0, direction: "open" });
  const pendingCloseRef = useRef<(() => void) | null>(null);

  // R9: keep the first decided object of each level (strokes + decision) for the closing overview.
  useEffect(() => {
    if (controller && level && snapshot?.decision) recordRecap(recapFromFlow(level, controller));
  }, [controller, level, snapshot?.decision, recordRecap]);

  /** R9: Level 3 won -> the closing replaces the usual return to the level list. */
  const wonFinalRef = useRef(false);
  const [endingOpen, setEndingOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const leaveLevel = useCallback(() => {
    session.exitToLevels();
    if (wonFinalRef.current) {
      wonFinalRef.current = false;
      setEndingOpen(true);
    }
  }, [session]);
  /** PRD 0.0.16 R8.6: returning to the list closes the book (top to bottom); the list shows once it is shut. */
  const backToLevels = useCallback(() => {
    pendingCloseRef.current = leaveLevel;
    setBook((b) => ({ key: b.key + 1, direction: "close" }));
    // Safety net: never strand the student if the flip cannot finish (hidden tab, animation blocked).
    window.setTimeout(() => {
      if (pendingCloseRef.current === leaveLevel) {
        pendingCloseRef.current = null;
        leaveLevel();
      }
    }, 2000);
  }, [leaveLevel]);
  const onBookDone = useCallback(() => {
    const next = pendingCloseRef.current;
    pendingCloseRef.current = null;
    next?.();
  }, []);
  const chooseEnding = useCallback((choice: EndingChoice) => {
    setEndingOpen(false);
    if (choice === "finish") setFinished(true);
  }, []);
  const levelIdForGuess = snapshot?.levelId;
  /** R11: Momo's provisional guess while drawing uses the level's own provider; failures just mean no guess. */
  const provisionalGuess = useMemo(
    () =>
      provider
        ? (surface: DrawingSurface) => provider.predict(surface.toDrawingInput(), { levelId: levelIdForGuess ?? undefined }).catch(() => null)
        : null,
    [provider, levelIdForGuess],
  );
  const selectLevel = useCallback(
    (selected: LevelDefinition) => {
      // The level list stays under the falling intro page only when an intro plays.
      if (willPlayIntro(selected)) startEntryHold();
      // PRD 0.0.16 R6: the book opens into the world; the page underneath swaps as the leaf lifts.
      setBook((b) => ({ key: b.key + 1, direction: "open" }));
      enterLevel(selected);
    },
    [startEntryHold, enterLevel, willPlayIntro],
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
  const introActive = Boolean(session.introLevel && !session.introRevealed && snapshot?.levelId === session.introLevel.levelId);
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
                if (classroom.joinToken) {
                  void classroom.joinClass(selectedNumber, `Siswa ${selectedNumber}`).catch(() => {
                    /* Non-blocking if join endpoint offline */
                  });
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
            <LevelEntryScreen entryHold={entryHold} onSelectLevel={selectLevel} isLevelUnlocked={isLevelUnlocked} finished={finished} />
          )}

          {/* Hosts the drawing canvas and the floating Top-3 HITL popup. */}
          {snapshot && isDrawingFlow && level && (
            <div className="drawing-flow-host" data-intro={introActive ? "true" : undefined}>
            <DrawingFlowScreen
              level={level}
              snapshot={snapshot}
              phase={phase}
              controller={controller}
              providerMode={session.providerMode}
              surfaceRef={surfaceRef}
              drawingRevision={drawingRevision}
              missionOpen={session.missionOpen}
              onOpenMission={() => session.setMissionOpen(true)}
              onCloseMission={() => session.setMissionOpen(false)}
              onSubmit={() => void handleSubmitDrawing()}
              onExit={backToLevels}
              provisionalGuess={provisionalGuess}
            />
            </div>
          )}

          {session.introLevel && snapshot?.levelId === session.introLevel.levelId && isDrawingFlow && (
            <LevelIntro
              key={session.introLevel.levelId}
              level={session.introLevel}
              characterDisplayName={characterDisplayName}
              onReveal={session.revealDrawing}
              onFinish={session.finishIntro}
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
              onBackToLevels={backToLevels}
              onWon={() => {
                if (level.stage === 3) wonFinalRef.current = true;
              }}
            />
          )}
        </>
      )}

      <BookFlip playKey={book.key} direction={book.direction} onDone={onBookDone} label={book.direction === "open" ? "Buku terbuka" : "Buku tertutup"} />

      {endingOpen && <CenterOfPage recaps={session.getRecaps()} onChoose={chooseEnding} />}

      {routeNotice && (
        <div role="alert" data-testid="route-guard-notice" className="route-notice">
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
