"use client";
/**
 * Drawing screen: the canvas, the tool/mission/exit chrome, Momo the companion and the Top-3
 * prediction popup. Surface lifecycle and Momo's layout live in hooks; this file only composes.
 */
import { useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { DrawingInput, ObjectBehavior, PredictionResult } from "@/src/domain/types";
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
import { useCanvasFocus } from "./hooks/useCanvasFocus";
import { useDrawingIdle } from "./hooks/useDrawingIdle";
import { useHandStatusKind } from "./hooks/useHandStatusKind";
import { CanvasFocusExtras } from "./CanvasFocusExtras";
import { StickerStamp, stampMomoLine } from "./StickerStamp";
import { resolveMomoCue } from "./momo-cue";
import {
  FOCUS_CATALOG_LINES_CAMERA,
  FOCUS_CATALOG_LINES_POINTER,
  FOCUS_TOOL_LINES_CAMERA,
  FOCUS_TOOL_LINES_POINTER,
  IDLE_PROMPT_LINE_CAMERA,
  IDLE_PROMPT_LINE_POINTER,
} from "./canvas-focus";
import { momoLine as momoLineFor } from "@/src/domain/momo-script";
import "./canvas-focus.css";

/**
 * The decided drawing as a sticker on this canvas (REVISI §18A). While it is set the canvas takes no ink, the
 * Top-3 and the drawing actions are replaced by the sticker's two rings, and Momo speaks the sticker line.
 */
export interface DrawingStamp {
  label: string;
  behavior: ObjectBehavior;
  drawingInput: DrawingInput | null;
  onThrow(): void;
  onRedraw(): void;
}

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
  /** Opens the focus phase (dark backdrop, tool review, catalog, "Mulai Menggambar") once the intro has lifted. */
  showCanvasFocus?: boolean;
  /** The decided drawing waiting on the canvas as a sticker (Lempar / Gambar lagi). */
  stamp?: DrawingStamp | null;
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
  showCanvasFocus = true,
  stamp = null,
}: DrawingScreenProps) {
  const stamped = stamp !== null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // R13: camera mode always draws by hand (no picker); pointer only in fallback mode.
  const appInputMode = useInputMode();
  const cameraMode = appInputMode === "camera";
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

  // The level intro is mounted over this screen while the host marks it (SketchbookApp: data-intro="true").
  // The focus phase and the idle clock wait until it has lifted, so the student sees them.
  const introCovers = useIntroCovers(sectionRef);

  const isProbe = phase !== "drawing";
  const isDrawingFlow = active || isProbe;
  const { companionRef, momoLayout } = useMomoCompanionLayout();

  const focus = useCanvasFocus(showCanvasFocus && active && phase === "drawing" && !introCovers, level.levelId);
  const inkBlocked = focus.open || introCovers || stamped;
  // The canvas takes no ink while it is covered or a sticker waits on it: no stroke, eraser pass, undo or redo,
  // a hand pinch included. The hand reader keeps running; only the drawing is gated (DrawingSurface.setInkEnabled).
  // The optional call lets a surface double without the method keep the gate open.
  useEffect(() => {
    surfaceOut.current?.setInkEnabled?.(!inkBlocked);
  }, [inkBlocked, inputMode, surfaceOut]);

  // Only a held pinch (brush) or fist (eraser) counts as hand activity; the rest of the time the clock runs.
  const handBusy = inputMode === "hand" && (handPose === "pinch" || handPose === "fist");
  const drawingLive = active && phase === "drawing" && !focus.open && !introCovers && !missionOpen;
  const idlePrompting = useDrawingIdle({ enabled: drawingLive && hasInk, canvasRef, handBusy });

  // No hand in view for 15 s: DrawingActions reveals the fallback controls. A pose of "none" alone does not count.
  const handKind = useHandStatusKind();
  const handMissing =
    cameraMode && drawingLive && (inputMode !== "hand" || handKind === "tracking-lost" || handKind === "error");

  const idleLine = idlePrompting ? (cameraMode ? IDLE_PROMPT_LINE_CAMERA : IDLE_PROMPT_LINE_POINTER) : null;
  const momoCue = resolveMomoCue(feedback, phase, { stage: level.stage, prediction, idleLine });
  const focusLines = focus.open
    ? focus.step === "tools"
      ? cameraMode ? FOCUS_TOOL_LINES_CAMERA : FOCUS_TOOL_LINES_POINTER
      : cameraMode ? FOCUS_CATALOG_LINES_CAMERA : FOCUS_CATALOG_LINES_POINTER
    : null;
  // Outside the focus phase Momo's cue line; while drawing she stays quiet otherwise (no mumbled guess).
  const momoLines = stamp ? stampMomoLine(stamp.label) : focusLines ?? momoCue.message ?? momoLineFor(momoCue.moment);
  const showGuess = isProbe && !stamped && (phase === "evaluating" || phase === "prediction-error");
  const externalThumbUp = inputMode === "hand" && handPose === "thumb-up";

  return (
    <section
      ref={sectionRef}
      hidden={!isDrawingFlow}
      style={{ display: isDrawingFlow ? undefined : "none" }}
      id="screen-drawing"
      className="screen drawing-screen-svg"
      aria-label="Menggambar"
      data-drawing-active={active ? "true" : "false"}
      data-focus={focus.open ? focus.step : "off"}
      data-idle-prompt={idlePrompting ? "on" : "off"}
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
      {focus.open && <div className="drawing-focus-backdrop" data-testid="drawing-focus-backdrop" aria-hidden="true" />}
      <div
        ref={companionRef}
        className="drawing-momo-companion"
        data-phase={phase}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${momoLayout.x}px, ${momoLayout.y}px)`,

          zIndex: 101,
          // One Momo at a time: the mission hint has her own.
          visibility: missionOpen ? "hidden" : "visible",
          pointerEvents: showGuess || focus.open ? "auto" : "none",
          width: `min(480px, ${momoLayout.available}px)`,
        }}
      >
        <MomoChat
          lines={momoLines}
          mood={focus.open || stamped ? "Senang" : momoCue.mood ?? momoMood(momoCue.moment)}
          fog={focus.open || stamped ? 0 : momoCue.fog}
          // Emphasis: a little larger while she guesses and shows the result (170 px -> 190 px).
          avatarHeight={showGuess ? 190 : 170}
          extrasFrom={focus.open ? "last" : "always"}
          onAllShown={focus.open ? focus.advance : undefined}
          className="momo-guess-chat"
        >
          {focus.open ? (
            focus.step === "catalog" ? (
              <CanvasFocusExtras catalog={level.catalog} externalThumbUp={externalThumbUp} onStart={focus.dismiss} />
            ) : null
          ) : showGuess && !stamp ? (
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
      {/* Empty, inaccessible measuring box: the result's CSS sizes the card through this geometry. */}
      <div className="prediction-hitl-geometry" data-geometry-probe="true" aria-hidden="true" />
      <div className="drawing-feedback">
        <p id="drawing-feedback" className="feedback" role="alert">
          {feedback === "empty-drawing" ? "Gambar dulu sebelum menebak." : ""}
        </p>
      </div>

      {!stamped && (
        <DrawingActions
          phase={phase}
          active={active}
          inputMode={inputMode}
          hasInk={hasInk}
          // The drawing surface runs the one hand tracker; the finish ring reads its thumb (never a second tracker).
          externalThumbUp={externalThumbUp}
          finishPaused={missionOpen || focus.open}
          handMissing={handMissing}
          onSwitchMode={(mode: InputModeId) => void switchMode(mode)}
          onSubmit={() => onSubmit(null)}
        />
      )}
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="draw-canvas"
        style={{ pointerEvents: active && !inkBlocked ? "auto" : "none" }}
        aria-label="Kanvas menggambar"
        data-testid="draw-canvas"
      />
      {stamp && (
        <StickerStamp
          label={stamp.label}
          behavior={stamp.behavior}
          drawingInput={stamp.drawingInput}
          // The drawing hand's stable pose; the fallback mode has no hand, so no pose reaches the rings.
          pose={inputMode === "hand" ? handPose : "none"}
          onThrow={stamp.onThrow}
          onRedraw={stamp.onRedraw}
        />
      )}
    </section>
  );
}

/**
 * True while the level intro covers this screen. SketchbookApp marks the drawing host with data-intro="true" for the
 * intro's length; the observer follows that mark, so the focus phase opens the moment the intro lifts.
 */
function useIntroCovers(sectionRef: { current: HTMLElement | null }): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const host = sectionRef.current?.closest(".drawing-flow-host");
    if (!host) return;
    const sync = () => setCovered(host.getAttribute("data-intro") === "true");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(host, { attributes: true, attributeFilter: ["data-intro"] });
    return () => observer.disconnect();
  }, [sectionRef]);
  return covered;
}
