"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { devTools, env } from "@/src/config/env";
import { LEVELS } from "@/src/domain/levels";
import { CoverScreen } from "@/src/features/cover";
import { TutorialScreen } from "@/src/features/tutorial";
import { LevelSelectScreen } from "@/src/features/level-select";
import { CanvasScreen } from "@/src/features/canvas";
import { WorldIntroOverlay, WorldScreen } from "@/src/features/world";
import { EndingScreen } from "@/src/features/ending";
import { PaperOverlay } from "@/src/features/shared";
import { R83SkipBar, SkipButtonVisibilityContext } from "@/src/features/shared/R83SkipBar";
import { useSkipButtonVisible } from "@/src/config/skip-button";
import { DreamLoader } from "@/src/components/onboarding/DreamLoader";
import { NuiProvider } from "@/src/nui/react";
import { HandReacquireNudge } from "./HandReacquireNudge";
import { isLevelUnlocked } from "./level-progress";
import { subscribeMonuiWarmupStatus, warmMonuiWorker, type MonuiWarmupStatus } from "./monui-worker-warmup";
import { R83CameraDock, type MonuiDetectorState } from "./R83CameraDock";
import { readSavedCameraIntent } from "./hooks/useR83Camera";
import { useR83AppState } from "./hooks/useR83AppState";

const ROUTE_NOTICE_STYLE: CSSProperties = { position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 55 };
const COVER_HIDDEN_STYLE: CSSProperties = { pointerEvents: "none" };

function R83ActiveView() {
  const s = useR83AppState();
  const dev = devTools();
  const { route } = s;
  const isLoadRoute = route.kind === "load";
  const showCover = route.kind === "cover" || isLoadRoute;
  const isPostCover = !showCover;
  const [warmup, setWarmup] = useState<MonuiWarmupStatus>({ kind: "idle" });
  const [detectorState, setDetectorState] = useState<MonuiDetectorState>("idle");
  const detectorStateRef = useRef(detectorState);
  detectorStateRef.current = detectorState;
  const coverWrapRef = useRef<HTMLDivElement>(null);
  const autoReconnectTriedRef = useRef(false);

  useEffect(() => {
    const el = coverWrapRef.current;
    if (el && "inert" in el) {
      (el as HTMLElement & { inert: boolean }).inert = isLoadRoute;
    }
  }, [isLoadRoute, showCover]);

  useEffect(() => {
    const unsub = subscribeMonuiWarmupStatus(setWarmup);
    void warmMonuiWorker({ wasmRoot: "/mediapipe/wasm", modelUrl: env.mediapipeModelUrl, yoloEnabled: process.env.NEXT_PUBLIC_MONUI_YOLO === "1" });
    return unsub;
  }, []);

  const { cameraActive, cameraState, onCameraToggle } = s.camera;

  useEffect(() => {
    if (!isPostCover || autoReconnectTriedRef.current) return;
    if (!cameraActive && cameraState.status === "idle" && readSavedCameraIntent()) {
      autoReconnectTriedRef.current = true;
      void onCameraToggle(true);
    }
  }, [isPostCover, cameraActive, cameraState.status, onCameraToggle]);

  const nuiWarming = s.camera.cameraActive && (detectorState === "idle" || detectorState === "starting");
  const coverCameraState = s.camera.cameraState;
  const warmupBanner = isLoadRoute ? null
    : warmup.kind === "loading" ? "Mengunduh model & WASM NUI…"
    : warmup.kind === "warming" ? "Memanaskan model NUI (coldstart)…" : null;
  const classBadge = s.classroom.joinInfo
    ? s.classroom.joinInfo.school_name
      ? `${s.classroom.joinInfo.school_name} · ${s.classroom.joinInfo.class_name}`
      : s.classroom.joinInfo.class_name
    : null;

  return (
    <>
      <PaperOverlay />
      <R83CameraDock
        active={s.camera.cameraActive}
        showPip={isPostCover}
        onDetectorState={setDetectorState}
        onToggleCamera={s.camera.onCameraToggle}
      />

      {isPostCover && s.camera.cameraActive ? <HandReacquireNudge /> : null}

      {isLoadRoute ? (
        <>
          <DreamLoader
            warmRuntime="monui-worker"
            allowSkip={false}
            askNickname={!s.studentName}
            classBadge={classBadge}
            onSubmitNickname={s.handleDreamNickname}
            modelUrl={env.mediapipeModelUrl}
            onReady={s.handleLoadReady}
          />
          <R83SkipBar visible={dev} label="Memuat" onSkip={s.handleLoadReady} />
        </>
      ) : null}

      {warmupBanner ? (
        <div className="k-chip r83-route-notice" role="status" data-testid="r83-nui-warmup-banner" style={ROUTE_NOTICE_STYLE}>
          {warmupBanner}
        </div>
      ) : null}

      {route.kind === "levels" && s.routeNotice ? (
        <div className="k-chip bad r83-route-notice" role="status" data-testid="r83-route-notice" style={ROUTE_NOTICE_STYLE}>
          {s.routeNotice}
        </div>
      ) : null}

      {showCover ? (
        /* Keep CoverScreen mounted and visually painted underneath DreamLoader so the iris reveals it cleanly. */
        <div ref={coverWrapRef} style={isLoadRoute ? COVER_HIDDEN_STYLE : undefined} aria-hidden={isLoadRoute ? true : undefined}>
          <CoverScreen
            hasJoinToken={Boolean(s.classroom.joinToken)}
            initialStudentName={s.studentName || undefined}
            skipNameStep={Boolean(s.studentName)}
            cameraState={coverCameraState}
            nuiWarming={nuiWarming}
            onCameraToggle={s.camera.onCameraToggle}
            onCameraDeviceChange={s.camera.onCameraDeviceChange}
            devTools={dev && !isLoadRoute}
            hideSkipBar={isLoadRoute}
            onComplete={s.handleCoverComplete}
          />
        </div>
      ) : null}

      {route.kind === "tutorial" ? (
        <TutorialScreen studentName={s.studentName || undefined} fromName={s.fromName} characterDisplayName={s.characterDisplayName} devTools={dev} onStart={s.handleTutorialStart} />
      ) : null}

      {route.kind === "levels" ? (
        <>
          <LevelSelectScreen
            entryHold={false}
            levels={LEVELS}
            completedStages={s.completedStages}
            freshUnlockStage={s.freshUnlockStage}
            studentName={s.studentName || undefined}
            finished={s.hasFinishedAll}
            isLevelUnlocked={isLevelUnlocked}
            onSelectLevel={s.handleSelectLevel}
          />
          <R83SkipBar
            visible={dev}
            label="Pilih level"
            onSkip={() => {
              const next = LEVELS.find((l) => !s.completedStages.has(l.stage)) ?? LEVELS[0];
              if (next) s.handleSelectLevel(next);
            }}
          />
        </>
      ) : null}

      {route.kind === "canvas" && s.activeLevel && s.snapshot ? (
        <CanvasScreen
          level={s.activeLevel}
          snapshot={s.snapshot}
          phase={s.canvasPhase}
          controller={s.controller}
          providerMode={s.providerMode}
          surfaceRef={s.surfaceRef}
          drawingRevision={s.drawingRevision}
          stamp={s.stamp}
          missionOpen={s.missionOpen}
          onOpenMission={() => s.setMissionOpen(true)}
          onCloseMission={() => s.setMissionOpen(false)}
          onSubmit={() => { void s.handleSubmitDrawing(); }}
          onExit={s.handleExitCanvas}
          devTools={dev}
          demoSampleIndex={s.creations.snapshot().length}
          onDemoAttempt={s.markDemoAttempt}
        />
      ) : null}

      {route.kind === "level" && s.activeLevel && s.introPlaying ? (
        <WorldIntroOverlay level={s.activeLevel} characterDisplayName={s.characterDisplayName} devTools={dev} onFinish={s.handleIntroFinish} />
      ) : null}

      {route.kind === "level" && s.activeLevel && !s.introPlaying && s.snapshot && s.controller ? (
        <WorldScreen
          key={s.activeLevel.levelId}
          level={s.activeLevel}
          snapshot={s.snapshot}
          phase={s.worldPhase}
          controller={s.controller}
          characterDisplayName={s.characterDisplayName}
          creations={s.creations}
          onCreationsChange={s.handleCreationsChange}
          onBumpDrawingRevision={s.handleBumpDrawingRevision}
          onBackToLevels={s.handleBackFromWorld}
          onWon={s.handleWon}
          devTools={dev}
          onDemoAttempt={s.markDemoAttempt}
        />
      ) : null}

      {route.kind === "ending" ? (
        <EndingScreen recaps={s.recaps} studentName={s.studentName || undefined} devTools={dev} onChoose={s.handleEndingChoose} />
      ) : null}
    </>
  );
}

/**
 * Root shell mode r8.3 (`NEXT_PUBLIC_UI_R83=1`).
 * Membungkus seluruh alur Sampul -> Tutorial -> Pilih Level -> Kanvas -> Dunia -> Penutup
 * di dalam 1 `NuiProvider` tunggal dan 1 `WebcamHandDetector` tunggal (O-11).
 */
export function R83SketchbookShell() {
  const [hydrated, setHydrated] = useState(false);
  /** Satu-satunya saklar tombol "Lewati" (admin > bawaan build). Lihat docs/SKIP_BUTTON.md. */
  const skipVisible = useSkipButtonVisible();

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      data-ui="r83"
      data-variant={hydrated ? undefined : "page"}
      data-testid="r83-shell-root"
      className={hydrated ? "r83-shell-root" : "r83-shell-root r83-screen-frame r83-screen-frame--paper"}
    >
      {hydrated ? (
        <SkipButtonVisibilityContext.Provider value={skipVisible}>
          <NuiProvider devTools={devTools()} testHooks={env.testHooksEnabled}>
            <R83ActiveView />
          </NuiProvider>
        </SkipButtonVisibilityContext.Provider>
      ) : null}
    </div>
  );
}
