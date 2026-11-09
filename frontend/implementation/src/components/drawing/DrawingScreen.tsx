"use client";
/**
 * Drawing screen: the canvas, the tool/mission/exit chrome, Momo the companion and the Top-3
 * prediction popup. Surface lifecycle and Momo's layout live in hooks; this file only composes.
 */
import { useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import type { MissionConfig } from "@/src/domain/mission-config";
import { MissionBriefing } from "../mission/MissionBriefing";
import type { DrawingSurface } from "@/src/input";
import type { InputModeId } from "@/src/input/types";
import { MomoChat } from "../momo/MomoChat";
import { momoMood } from "@/src/domain/momo-script";
import { Icon } from "../ui/Icon";
import { DwellButton } from "../ui/DwellButton";
import "../ui/nui-actions.css";
import { ERASER_RADIUS_PX } from "@/src/input/eraser";
import { MomoGuessChat } from "../prediction/MomoGuessChat";
import { DrawingActions } from "./DrawingActions";
import { DrawingToolbar } from "./DrawingToolbar";
import { useDrawingSurface } from "./hooks/useDrawingSurface";
import { useInputMode } from "@/src/hooks/useHandGesture";
import { drawModeFor } from "./draw-mode";
import { useMomoCompanionLayout } from "./hooks/useMomoCompanionLayout";
import { resolveMomoCue } from "./momo-cue";
import { momoLine as momoLineFor } from "@/src/domain/momo-script";

export interface DrawingScreenProps {
  level: LevelDefinition;
  initialMode: InputModeId;
  feedback: string | null;
  surfaceOut: { current: DrawingSurface | null };
  onSubmit(chosenPrediction: string | null): void;
  onExit(): void;
  active?: boolean;
  phase?: "drawing" | "predicting" | "evaluating" | "prediction-error";
  prediction?: PredictionResult | null;
  errorDetail?: string | null;
  predictionMode?: "mock" | "partner";
  onAccept?: () => void;
  onCorrect?: (rank: 2 | 3) => void;
  onOverride?: (label: string) => void;
  onRedraw?: () => void;
  onRetry?: () => void;
  missionConfig?: MissionConfig;
  missionOpen?: boolean;
  onOpenMission?: () => void;
  onCloseMission?: () => void;
}

/**
 * Drawing screen: the canvas, the tool/mission/exit chrome, Momo the companion and the Top-3 prediction popup.
 * This replaces R11's auto-ask after the hand rests, by the Owner's instruction of 2026-11-09: while the student
 * draws, Momo stays quiet (no mumbled guesses, no provisional model calls) and nothing is submitted by itself.
 * The student says "selesai" with a thumbs-up (ThumbConfirm, 2 s); only then Momo guesses.
 */
export function DrawingScreen({
  level,
  initialMode,
  feedback,
  surfaceOut,
  onSubmit,
  onExit,
  active = true,
  phase = "drawing",
  prediction = null,
  errorDetail = null,
  predictionMode = "mock",
  onAccept = () => void 0,
  onCorrect = () => void 0,
  onOverride = () => void 0,
  onRedraw = () => void 0,
  onRetry = () => void 0,
  missionConfig,
  missionOpen = false,
  onOpenMission = () => void 0,
  onCloseMission = () => void 0,
}: DrawingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // R13: camera mode always draws by hand (no picker); pointer only in fallback mode.
  const appInputMode = useInputMode();
  const [startMode] = useState<InputModeId>(() => drawModeFor(appInputMode, initialMode));
  const { inputMode, hasInk, handPose, switchMode } = useDrawingSurface({ canvasRef, surfaceOut, initialMode: startMode, active });
  useEffect(() => {
    if (!active) return;
    const wanted = drawModeFor(appInputMode, initialMode);
    if (wanted !== inputMode) void switchMode(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appInputMode, active]);

  // Hapus size (CSS px): the S/M/L buttons show it; the surface owns the real radius and clamps it.
  const [eraserSize, setEraserSize] = useState(ERASER_RADIUS_PX);
  const [erasing, setErasingState] = useState(false);
  const setErasing = (on: boolean) => {
    setErasingState(on);
    surfaceOut.current?.setErasing?.(on);
  };
  // Leaving the drawing phase always returns to the pen.
  useEffect(() => {
    if (phase !== "drawing") {
      setErasingState(false);
      surfaceOut.current?.setErasing?.(false);
    }
  }, [phase, surfaceOut]);

  const isProbe = phase !== "drawing";
  const isDrawingFlow = active || isProbe;
  const { companionRef, geometryRef, momoLayout, waitingForArrival, handleTransitionEnd } =
    useMomoCompanionLayout(isProbe);

  // Hold the retained result back until Momo has arrived beside the popup.
  const visualPhase = waitingForArrival && phase === "evaluating" ? "predicting" : phase;
  const momoCue = resolveMomoCue(feedback, visualPhase, { stage: level.stage, prediction });
  // While drawing Momo stays idle: her cue line only, no mumbled guess.
  const momoLines = momoCue.message ?? momoLineFor(momoCue.moment);
  const showGuess = isProbe && !waitingForArrival && (phase === "evaluating" || phase === "prediction-error");

  return (
    <section
      hidden={!isDrawingFlow}
      style={{ display: isDrawingFlow ? undefined : "none" }}
      id="screen-drawing"
      className="screen drawing-screen-svg"
      aria-label="Menggambar"
      data-drawing-active={active ? "true" : "false"}
    >
      <DrawingToolbar
        enabled={phase === "drawing"}
        erasing={erasing}
        onErasingChange={setErasing}
        onUndo={() => surfaceOut.current?.undo()}
        onRedo={() => surfaceOut.current?.redo()}
        eraserSize={eraserSize}
        onEraserSizeChange={(px) => setEraserSize(surfaceOut.current?.setEraserRadius(px) ?? px)}
      />

      {/*
        Corner buttons: 60 px targets, 12 px apart. Both are off while the mission hint covers the screen, so a
        click or a resting fingertip cannot reach them through it. A dwell picks them too; the click stays as the
        fallback. They read the drawing surface's fingertip: no second hand reader is started here.
      */}
      <div className="drawing-corner nui-corner">
        {missionConfig && (
          <DwellButton
            iconOnly
            tone="accent"
            className="nb-iconbtn nui-corner-btn mission-hint-btn"
            testId="btn-mission-hint"
            label="Petunjuk Misi"
            title="Petunjuk misi"
            disabled={missionOpen}
            onActivate={onOpenMission}
            icon={<Icon name="bulb" size={26} stroke={2.2} />}
          >
            Petunjuk misi
          </DwellButton>
        )}
        <DwellButton
          iconOnly
          dwellMs={1800}
          className="nb-iconbtn nui-corner-btn drawing-exit"
          label="Keluar Level"
          title="Keluar level"
          disabled={missionOpen}
          onActivate={onExit}
          icon={<Icon name="exit" size={24} stroke={2.2} />}
        >
          Keluar level
        </DwellButton>
      </div>
      {missionConfig && (
        <MissionBriefing isOpen={missionOpen} config={missionConfig} onStartDrawing={onCloseMission} onClose={onCloseMission} />
      )}
      <div
        ref={companionRef}
        className="drawing-momo-companion"
        data-motion={waitingForArrival ? "moving" : "settled"}
        onTransitionEnd={handleTransitionEnd}
        data-phase={phase}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${momoLayout.x}px, ${momoLayout.y}px)`,

          zIndex: 101,
          // One Momo at a time: the mission hint has her own.
          visibility: missionOpen ? "hidden" : "visible",
          pointerEvents: showGuess ? "auto" : "none",
          width: `min(480px, ${momoLayout.available}px)`,
        }}
      >
        <MomoChat
          lines={momoLines}
          mood={momoCue.mood ?? momoMood(momoCue.moment)}
          fog={momoCue.fog}
          avatarHeight={showGuess ? 136 : 170}
          extrasFrom="always"
          className="momo-guess-chat"
        >
          {showGuess ? (
            <MomoGuessChat
              phase={phase as "evaluating" | "prediction-error"}
              prediction={prediction}
              errorDetail={errorDetail}
              predictionMode={predictionMode}
              level={level}
              onAccept={onAccept}
              onCorrect={onCorrect}
              onOverride={onOverride}
              onRedraw={onRedraw}
              onRetry={onRetry}
            />
          ) : null}
        </MomoChat>
      </div>
      {/* Empty, inaccessible measuring box shares the actual result CSS geometry. */}
      <div ref={geometryRef} className="prediction-hitl-geometry" data-geometry-probe="true" aria-hidden="true" />
      <div className="drawing-feedback">
        <p id="drawing-feedback" className="feedback" role="alert">
          {feedback === "empty-drawing" ? "Gambar dulu sebelum menebak." : ""}
        </p>
      </div>

      <DrawingActions
        phase={phase}
        active={active}
        inputMode={inputMode}
        hasInk={hasInk}
        // The drawing surface runs the one hand tracker; the finish ring reads its thumb (never a second tracker).
        externalThumbUp={inputMode === "hand" && handPose === "thumb-up"}
        finishPaused={missionOpen}
        onSwitchMode={(mode: InputModeId) => void switchMode(mode)}
        onSubmit={() => onSubmit(null)}
      />
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="draw-canvas"
        style={{ pointerEvents: active ? "auto" : "none" }}
        aria-label="Kanvas menggambar"
        data-testid="draw-canvas"
      />
    </section>
  );
}
