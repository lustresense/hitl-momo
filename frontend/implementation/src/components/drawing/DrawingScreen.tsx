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
import { momoGuessMumble, momoMood } from "@/src/domain/momo-script";
import { Icon } from "../ui/Icon";
import { MomoGuessChat } from "../prediction/MomoGuessChat";
import { useMomoGuessStream } from "../prediction/useMomoGuessStream";
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
  /** R11 streaming: provisional guess for the current strokes while drawing (shown as Momo's mumble only). */
  provisionalGuess?: ((surface: DrawingSurface) => Promise<PredictionResult | null>) | null;
  /** R11: submit by itself once the hand rests (GUESS_IDLE_MS). On by default. */
  autoAsk?: boolean;
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
  provisionalGuess = null,
  autoAsk = true,
}: DrawingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // R13: camera mode always draws by hand (no picker); pointer only in fallback mode.
  const appInputMode = useInputMode();
  const [startMode] = useState<InputModeId>(() => drawModeFor(appInputMode, initialMode));
  const { inputMode, hasInk, switchMode } = useDrawingSurface({ canvasRef, surfaceOut, initialMode: startMode, active });
  useEffect(() => {
    if (!active) return;
    const wanted = drawModeFor(appInputMode, initialMode);
    if (wanted !== inputMode) void switchMode(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appInputMode, active]);

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
  const stream = useMomoGuessStream({
    surfaceOut,
    active: active && phase === "drawing" && !missionOpen,
    provisionalGuess,
    onAsk: autoAsk ? () => onSubmit(null) : undefined,
  });
  // While drawing, Momo hums her provisional guess (not a decision, no number).
  const mumbling = visualPhase === "drawing" && !feedback && stream.drawing;
  const momoLines = mumbling ? momoGuessMumble(level.stage, stream.provisional) : momoCue.message ?? momoLineFor(momoCue.moment);
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
      />

      <div className="drawing-corner">
        {missionConfig && (
          <button
            type="button"
            className="nb-iconbtn nb-iconbtn--accent mission-hint-btn"
            data-testid="btn-mission-hint"
            aria-label="Petunjuk Misi"
            title="Petunjuk misi"
            onClick={onOpenMission}
          >
            <Icon name="bulb" size={26} stroke={2.2} />
          </button>
        )}
        <button type="button" className="nb-iconbtn drawing-exit" aria-label="Keluar Level" title="Keluar level" onClick={onExit}>
          <Icon name="exit" size={24} stroke={2.2} />
        </button>
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
          mood={mumbling ? "Penasaran" : momoCue.mood ?? momoMood(momoCue.moment)}
          fog={momoCue.fog}
          avatarHeight={showGuess ? 136 : 170}
          typing={!mumbling}
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
