"use client";

import { useEffect, useMemo, useState, type MutableRefObject, type RefObject } from "react";
import type { DrawingStamp } from "@/src/components/drawing/DrawingScreen";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import type { LevelDefinition } from "@/src/domain/levels";
import { momoLevelTone } from "@/src/domain/momo-script";
import type { PredictionResult } from "@/src/domain/types";
import type { DrawingSurface } from "@/src/input";
import { useOptionalNui } from "@/src/nui/react";
import { CanvasController, type CanvasControllerState } from "./canvas-controller";
import { buildGuessModel, formatObjectLabel } from "./guess-model";
import type { GuessSubMode } from "./GuessPanel";
import type { CanvasToolId } from "./tools";

const NON_PAPER_SELECTOR =
  ".nui-target, button, .nb-toolbar, .draw-tools, .tut-tools, .drawing-corner, .mission-pop, .r83-bubble, .r83-guess-ring-host, #cam-pip, #skipbar";

function isPaperPoint(x: number, y: number, paper: HTMLElement | null): boolean {
  if (typeof document === "undefined") return true;
  if (typeof document.elementFromPoint === "function") {
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    if (el.closest(NON_PAPER_SELECTOR)) return false;
    return paper ? paper.contains(el) : true;
  }
  const blockers = document.querySelectorAll<HTMLElement>(NON_PAPER_SELECTOR);
  for (const b of blockers) {
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return false;
    }
  }
  return true;
}

export interface UseCanvasBridgeOptions {
  readonly levelId: string;
  readonly cyclesCompleted: number;
  readonly drawingRevision: number;
  readonly isDrawingLive: boolean;
  readonly isCanvasMode?: boolean;
  readonly paperRef: RefObject<HTMLDivElement | null>;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly surfaceRef: MutableRefObject<DrawingSurface | null>;
}

/** Menghubungkan CanvasController, DOM canvas, NuiController, keyboard Z/X, dan surfaceRef. */
export function useCanvasBridge({
  levelId,
  cyclesCompleted,
  drawingRevision,
  isDrawingLive,
  isCanvasMode = isDrawingLive,
  paperRef,
  canvasRef,
  surfaceRef,
}: UseCanvasBridgeOptions) {
  const nui = useOptionalNui();
  const [ctrlState, setCtrlState] = useState<CanvasControllerState>({
    activeTool: "pencil",
    hasInk: false,
    idleReady: false,
    usedTools: new Set<CanvasToolId>(),
    strokeCount: 0,
    inkEnabled: true,
  });

  const canvasCtrl = useMemo(
    () =>
      new CanvasController({
        isPointOnPaper: (x, y) => isPaperPoint(x, y, paperRef.current),
        getNibBridge: () => nui?.getHandSource() ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [levelId, cyclesCompleted, drawingRevision, nui, paperRef],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    surfaceRef.current = canvasCtrl.toSurfaceAdapter();
    setCtrlState(canvasCtrl.getState());
    const unsubState = canvasCtrl.subscribe(setCtrlState);
    const detachCanvas = canvas ? canvasCtrl.attachCanvas(canvas) : () => undefined;
    const detachFallback = canvas
      ? canvasCtrl.attachPointerFallback(canvas, () => {
          if (!nui) return true;
          const st = nui.getStatus();
          return !st.simOn && !st.handAttached && st.activeSource !== "hand";
        })
      : () => undefined;
    const unsubSample = nui ? nui.subscribeSample((s, chrome) => canvasCtrl.feedSample(s, chrome)) : () => undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "z" || e.key === "Z") canvasCtrl.selectTool("undo");
      else if (e.key === "x" || e.key === "X") canvasCtrl.selectTool("redo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubSample();
      detachFallback();
      detachCanvas();
      unsubState();
      canvasCtrl.dispose();
      surfaceRef.current = null;
    };
  }, [canvasCtrl, canvasRef, nui, surfaceRef]);

  useEffect(() => {
    canvasCtrl.setInkEnabled(isDrawingLive);
  }, [canvasCtrl, isDrawingLive]);

  useEffect(() => {
    if (!nui) return;
    nui.setCanvasMode(isCanvasMode);
    return () => nui.setCanvasMode(false);
  }, [nui, isCanvasMode]);

  return { nui, canvasCtrl, ctrlState };
}

export interface CanvasMomoVisual {
  readonly expression: MomoExpression;
  readonly fog: number;
  readonly text: string;
}

export function resolveCanvasMomoVisual(params: {
  stamp: DrawingStamp | null;
  phase: "drawing" | "predicting" | "prediction-error" | "evaluating";
  level: LevelDefinition;
  prediction: PredictionResult | null;
  providerMode: "mock" | "partner";
  feedback: string | null;
  ctrlState: CanvasControllerState;
  guessSubMode: GuessSubMode;
  returnedToTop3: boolean;
  showFirstRecommendation?: boolean;
}): CanvasMomoVisual {
  const {
    stamp, phase, level, prediction, providerMode, feedback,
    ctrlState, guessSubMode, returnedToTop3, showFirstRecommendation = false,
  } = params;
  const tone = momoLevelTone(level.stage);
  if (stamp) {
    return { expression: "Bangga", fog: 0, text: CANVAS_COPY.sticker.line(formatObjectLabel(stamp.label)) };
  }
  if (phase === "predicting") {
    return { expression: tone.guessMood, fog: tone.fog, text: CANVAS_COPY.momo.predicting };
  }
  if (phase === "prediction-error") {
    return { expression: "Khawatir", fog: 0, text: CANVAS_COPY.guess.errorMomoLine };
  }
  if (phase === "evaluating" && prediction) {
    const model = buildGuessModel(prediction, level, providerMode);
    const text =
      guessSubMode === "other"
        ? CANVAS_COPY.guess.otherPrompt
        : returnedToTop3
          ? CANVAS_COPY.guess.backPrompt
          : `${model.momoLines[0] ?? ""} ${model.momoLines[1] ?? ""}`.trim();
    return { expression: model.momoMood, fog: model.momoFog, text };
  }
  if (feedback === "empty-drawing") {
    return { expression: "Bingung", fog: 0, text: CANVAS_COPY.momo.empty };
  }
  if (ctrlState.idleReady && ctrlState.hasInk) {
    return { expression: "Senang", fog: 0, text: CANVAS_COPY.momo.askIdle };
  }
  if (showFirstRecommendation) {
    return { expression: "Senang", fog: 0, text: CANVAS_COPY.momo.recommend(level.stage) };
  }
  return { expression: "Tenang", fog: 0, text: CANVAS_COPY.momo.cue };
}
