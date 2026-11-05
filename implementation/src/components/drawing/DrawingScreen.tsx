"use client";
/**
 * Drawing screen: the canvas, the tool/mission/exit chrome, Momo the companion and the Top-3
 * prediction popup. Surface lifecycle and Momo's layout live in hooks; this file only composes.
 */
import { useRef } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import type { MissionConfig } from "@/src/domain/mission-config";
import { MissionBriefing } from "../mission/MissionBriefing";
import type { DrawingSurface } from "@/src/input";
import type { InputModeId } from "@/src/input/types";
import { MomoBubble } from "../momo/MomoBubble";
import { Top3PredictionPopup } from "../prediction/Top3PredictionPopup";
import { DrawingActions } from "./DrawingActions";
import { DrawingToolbar } from "./DrawingToolbar";
import { useDrawingSurface } from "./hooks/useDrawingSurface";
import { useMomoCompanionLayout } from "./hooks/useMomoCompanionLayout";
import { resolveMomoCue } from "./momo-cue";

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
  const { inputMode, hasInk, switchMode } = useDrawingSurface({ canvasRef, surfaceOut, initialMode, active });

  const isProbe = phase !== "drawing";
  const isDrawingFlow = active || isProbe;
  const { companionRef, geometryRef, momoLayout, waitingForArrival, handleTransitionEnd } =
    useMomoCompanionLayout(isProbe);

  // Hold the retained result back until Momo has arrived beside the popup.
  const visualPhase = waitingForArrival && phase === "evaluating" ? "predicting" : phase;
  const momoCue = resolveMomoCue(feedback, visualPhase);

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
        visible={phase === "drawing"}
        onClear={() => surfaceOut.current?.clear()}
        onUndo={() => surfaceOut.current?.undo()}
        onRedo={() => surfaceOut.current?.redo()}
      />

      {missionConfig && (
        <>
          <button
            type="button"
            className="btn btn-small mission-hint-btn"
            data-testid="btn-mission-hint"
            aria-label="Petunjuk Misi"
            onClick={onOpenMission}
          >
            Petunjuk misi
          </button>
          <MissionBriefing isOpen={missionOpen} config={missionConfig} onStartDrawing={onCloseMission} onClose={onCloseMission} />
        </>
      )}
      <button type="button" className="btn btn-small btn-exit drawing-exit" onClick={onExit}>
        Keluar Level
      </button>
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
          pointerEvents: "none",
          width: `min(340px, ${momoLayout.available}px)`,
        }}
      >
        <MomoBubble moment={momoCue.moment} message={momoCue.message} avatarHeight={150} />
        {isProbe && (
          <span className="momo-prediction-source" data-testid="momo-prediction-source">
            {predictionMode === "mock" ? "Demo: tebakan simulasi" : "Model partner"}
          </span>
        )}
      </div>
      {/* Empty, inaccessible measuring box shares the actual result CSS geometry. */}
      <div ref={geometryRef} className="prediction-hitl-geometry" data-geometry-probe="true" aria-hidden="true" />
      <div style={{ display: "contents" }}>
        {isProbe && !waitingForArrival && (
          <Top3PredictionPopup
            phase={phase}
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
        )}
      </div>
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
