"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrawingFlowScreenProps } from "@/src/app/screens/DrawingFlowScreen";
import { audio } from "@/src/audio";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";
import {
  MomoStage,
  R83Bubble,
  ScreenFrame,
  type AnchorName,
  type MomoStageHandle,
  type R83BubbleHandle,
} from "@/src/features/shared";
import { R83SkipBar } from "@/src/features/shared/R83SkipBar";
import { CanvasCursor, HandLegend } from "@/src/nui/react";
import { GuessPanel, type GuessSubMode } from "./GuessPanel";
import { GuessRing } from "./GuessRing";
import { MissionBulb } from "./MissionBulb";
import { ObjectRecommendationChips } from "./ObjectRecommendationChips";
import { StickerStage } from "./StickerStage";
import { Toolbar } from "./Toolbar";
import { resolveCanvasMomoVisual, useCanvasBridge } from "./useCanvasBridge";
import "./canvas.css";

/** Level yang sudah pernah menampilkan rekomendasi awal di kanvas pada sesi ini (tidak diulang di gambar ke-2+). */
const seenRecommendationLevels = new Set<string>();

/** Khusus pengujian: reset daftar level yang sudah melihat rekomendasi awal kanvas. */
export function resetCanvasRecommendationsForTest(): void {
  seenRecommendationLevels.clear();
}

const GUESS_HINT =
  "Dekatkan tangan ke pilihan (yang dekat menyala) · cubit dan tahan = pilih · tombol 1 2 3 = pilih langsung";
const STICKER_HINT =
  "Cubit lalu sentil ke atas = Lempar · atau dekatkan tangan ke pilihan, cubit dan tahan · G = Gambar lagi";

function ignoreRefused(action: () => void): void {
  try {
    action();
  } catch {
    // Refused by FlowController phase guard or DecisionError.
  }
}

/** A decision (accept / correct / override) sounds identically and only when the controller really accepted it. */
function decideWithSound(action: () => void): void {
  try {
    action();
  } catch {
    // Refused by FlowController phase guard or DecisionError: no sound, no decision.
    return;
  }
  audio.emit("hitl.decide");
}

/**
 * Layar kanvas r8.3 (drop-in untuk `DrawingFlowScreenProps`).
 * Menggantikan `DrawingScreen` saat `NEXT_PUBLIC_UI_R83=1`: 5 alat, hapus segmen O-7,
 * idle 1000 ms (O-14), nol gumam/prediksi sementara (O-13), Top-3 HITL & stiker sentil.
 */
export function CanvasScreen({
  level,
  snapshot,
  phase,
  controller,
  providerMode,
  surfaceRef,
  drawingRevision,
  stamp = null,
  missionOpen,
  onOpenMission,
  onCloseMission,
  onSubmit,
  devTools = false,
  demoSampleIndex = 0,
  onDemoAttempt,
}: DrawingFlowScreenProps) {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const momoRef = useRef<MomoStageHandle | null>(null);
  const bubbleRef = useRef<R83BubbleHandle | null>(null);

  const [guessSubMode, setGuessSubMode] = useState<GuessSubMode>("top3");
  const [returnedToTop3, setReturnedToTop3] = useState(false);
  const [stickerThrowing, setStickerThrowing] = useState(false);
  const [introRecDismissed, setIntroRecDismissed] = useState(() =>
    seenRecommendationLevels.has(level.levelId) || snapshot.cyclesCompleted > 0 || drawingRevision > 0,
  );

  const recommendedObjects = useMemo(() => {
    const mission = getMissionConfigForLevel(level);
    return mission.examples.length > 0 ? mission.examples : level.catalog;
  }, [level]);

  const isCanvasPage = phase === "drawing" && !stamp;
  const isDrawingLive = isCanvasPage && !missionOpen;
  const { nui, canvasCtrl, ctrlState } = useCanvasBridge({
    levelId: level.levelId,
    cyclesCompleted: snapshot.cyclesCompleted,
    drawingRevision,
    isDrawingLive,
    isCanvasMode: isCanvasPage,
    paperRef,
    canvasRef,
    surfaceRef,
  });

  useEffect(() => {
    const alreadyDone = seenRecommendationLevels.has(level.levelId) || snapshot.cyclesCompleted > 0 || drawingRevision > 0;
    setIntroRecDismissed(alreadyDone);
  }, [level.levelId, snapshot.cyclesCompleted, drawingRevision]);

  useEffect(() => {
    if (!introRecDismissed && (ctrlState.hasInk || phase !== "drawing" || Boolean(stamp))) {
      seenRecommendationLevels.add(level.levelId);
      setIntroRecDismissed(true);
    }
  }, [introRecDismissed, ctrlState.hasInk, phase, stamp, level.levelId]);

  useEffect(() => {
    setGuessSubMode("top3");
    setReturnedToTop3(false);
  }, [phase, snapshot.attemptId]);

  useEffect(() => {
    setStickerThrowing(false);
  }, [stamp, phase, snapshot.attemptId]);

  /** Phase EDGES (never notify counts): submit, Top-3 reveal, provider hiccup. Sticker "evaluating" is not a reveal. */
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase) return;
    if (prev === "drawing" && phase === "predicting") audio.emit("hitl.submit");
    else if (prev === "predicting" && phase === "evaluating" && !stamp) audio.emit("hitl.reveal");
    else if (prev === "predicting" && phase === "prediction-error") audio.emit("sys.hiccup");
  }, [phase, stamp]);

  const targetAnchor: AnchorName = phase === "drawing" && !stamp ? "corner" : "side";
  useEffect(() => {
    void momoRef.current?.moveTo(targetAnchor, 700);
  }, [targetAnchor]);

  const showFirstRecommendation =
    isCanvasPage && !introRecDismissed && !ctrlState.hasInk && recommendedObjects.length > 0;
  const prediction = controller?.prediction ?? null;
  const momoVisual = resolveCanvasMomoVisual({
    stamp,
    phase,
    level,
    prediction,
    providerMode,
    feedback: controller?.feedback ?? null,
    ctrlState,
    guessSubMode,
    returnedToTop3,
    showFirstRecommendation,
  });

  /** "Lewati" saat Momo masih menebak: keputusan #1 diambil begitu tebakan muncul. */
  const autoAcceptRef = useRef(false);
  useEffect(() => {
    if (!autoAcceptRef.current || phase === "predicting") return;
    autoAcceptRef.current = false;
    if (phase === "evaluating") ignoreRefused(() => controller?.decideAccept());
  }, [phase, controller]);

  /** Percobaan yang disentuh "Lewati" bukan karya/keputusan murid: tandai agar tidak dikirim ke server. */
  const markDemoAttempt = () => {
    const attemptId = controller?.getSnapshot?.().attemptId ?? snapshot.attemptId;
    if (attemptId) onDemoAttempt?.(attemptId);
  };

  const skipLabel = `Level ${level.stage} · ${stamp ? "Stiker" : phase === "drawing" ? "Canvas" : "Tebakan"}`;
  const handleSkip = () => {
    if (stamp) {
      stamp.onThrow();
      return;
    }
    if (phase === "drawing") {
      if (missionOpen) onCloseMission();
      if (!canvasCtrl.getState().hasInk) canvasCtrl.drawDemoSample(demoSampleIndex % 2 === 0 ? "plank" : "block");
      onSubmit();
      markDemoAttempt();
      return;
    }
    if (phase === "predicting") {
      markDemoAttempt();
      autoAcceptRef.current = true;
      return;
    }
    if (phase === "evaluating") {
      markDemoAttempt();
      ignoreRefused(() => controller?.decideAccept());
      return;
    }
    void controller?.retryPrediction();
  };

  const handleRedraw = useCallback(() => {
    try {
      if (phase === "prediction-error") controller?.redrawFromError();
      else controller?.requestRedraw("evaluation");
    } catch {
      // Refused by FlowController phase guard.
      return;
    }
    audio.emit("hitl.redraw");
  }, [controller, phase]);

  /** "Tebak Gambarku": an empty paper is refused by the controller (feedback "empty-drawing"), which is a soft denial. */
  const handleGuessSubmit = () => {
    onSubmit();
    if (controller && controller.phase === "drawing" && controller.feedback === "empty-drawing") audio.emit("ui.denied");
  };

  const showGuessPanel = !stamp && (phase === "predicting" || phase === "evaluating" || phase === "prediction-error");
  const hideForThrow = Boolean(stamp) && stickerThrowing;
  const hintText = stamp ? STICKER_HINT : phase !== "drawing" ? GUESS_HINT : CANVAS_COPY.hint;

  return (
    <ScreenFrame variant="page" testId="r83-canvas-screen" ariaLabel={CANVAS_COPY.screenLabel(level.stage)}>
      {nui && isCanvasPage && <CanvasCursor tool={ctrlState.activeTool} paperRef={paperRef} />}
      {!stamp && (
        <div ref={paperRef} className="sk-wrap" id="skw" data-testid="r83-paper-wrap">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="r83-draw-canvas"
            aria-label={CANVAS_COPY.canvasAriaLabel}
            data-testid="r83-draw-canvas"
          />
        </div>
      )}
      <MissionBulb
        level={level}
        open={missionOpen}
        hidden={Boolean(stamp) || phase !== "drawing"}
        onToggle={() => (missionOpen ? onCloseMission() : onOpenMission())}
      />
      <Toolbar
        activeTool={ctrlState.activeTool}
        disabled={!isDrawingLive}
        hidden={Boolean(stamp) || phase !== "drawing"}
        onSelectTool={(tool) => canvasCtrl.selectTool(tool)}
      />
      <GuessRing
        visible={isDrawingLive && ctrlState.hasInk && ctrlState.idleReady}
        getDrawingRect={() => canvasCtrl.getDrawingViewportRect()}
        bubbleRef={bubbleRef}
        onSubmit={handleGuessSubmit}
      />
      <MomoStage ref={momoRef} at="corner" expression={momoVisual.expression} fog={momoVisual.fog} />
      <R83Bubble ref={bubbleRef} anchor={targetAnchor} momoRef={momoRef} text={momoVisual.text} visible={!hideForThrow}>
        {showGuessPanel ? (
          <GuessPanel
            phase={phase as "predicting" | "evaluating" | "prediction-error"}
            prediction={prediction}
            errorDetail={controller?.errorDetail ?? null}
            providerMode={providerMode}
            level={level}
            drawingInput={controller?.drawingInput ?? null}
            subMode={guessSubMode}
            onSubModeChange={(next) => {
              if (next === "top3" && guessSubMode === "other") setReturnedToTop3(true);
              if (next !== guessSubMode) audio.emit("hitl.more");
              setGuessSubMode(next);
            }}
            onAccept={() => decideWithSound(() => controller?.decideAccept())}
            onCorrect={(rank) => decideWithSound(() => controller?.decideCorrect(rank))}
            onOverride={(label) => decideWithSound(() => controller?.decideOverride(label))}
            onRedraw={handleRedraw}
            onRetry={() => {
              if (controller?.phase === "prediction-error") audio.emit("ui.tap");
              void controller?.retryPrediction();
            }}
          />
        ) : showFirstRecommendation ? (
          <ObjectRecommendationChips items={recommendedObjects} testId="r83-canvas-rec-chips" />
        ) : null}
      </R83Bubble>
      {stamp && (
        <StickerStage
          key={snapshot.attemptId ?? stamp.label}
          stamp={stamp}
          bubbleRef={bubbleRef}
          onThrowStart={() => setStickerThrowing(true)}
        />
      )}
      {!hideForThrow && (
        <div className="r83-hint" role="note" style={{ opacity: 1 }}>
          {hintText}
        </div>
      )}
      {nui && <HandLegend />}
      <R83SkipBar visible={devTools} label={skipLabel} onSkip={handleSkip} />
    </ScreenFrame>
  );
}
