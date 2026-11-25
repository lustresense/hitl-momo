"use client";
/**
 * R11: Momo's guess lives in her chat, under her bubble (replaces the separate Top3PredictionPopup).
 * Top-3 with the provider's real percents, then the decisions (Terima, Pakai, Bukan ini, Gambar lagi), all chosen
 * with a finger count, the thumb or a pinch (no cursor), or a held click in fallback. Display + decision UI only:
 * Momo herself never decides.
 */
import { useEffect } from "react";
import { getInputMode } from "@/src/input/input-mode";
import type { DrawingInput, PredictionResult } from "@/src/domain/types";
import type { LevelDefinition } from "@/src/domain/levels";
import { DecisionPanel } from "../decision/DecisionPanel";
import { PredictionErrorActions } from "./PredictionErrorActions";

export interface MomoGuessChatProps {
  phase: "predicting" | "evaluating" | "prediction-error";
  prediction: PredictionResult | null;
  drawingInput?: DrawingInput | null;
  errorDetail?: string | null;
  predictionMode: "mock" | "partner";
  level: LevelDefinition;
  onAccept: () => void;
  onCorrect: (rank: 2 | 3) => void;
  onOverride: (label: string) => void;
  onRedraw: () => void;
  onRetry: () => void;
}

export function MomoGuessChat({ phase, prediction, drawingInput, errorDetail, predictionMode, level, onAccept, onCorrect, onOverride, onRedraw, onRetry }: MomoGuessChatProps) {
  // Esc returns to drawing without committing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (getInputMode() === "fallback" && e.key === "Escape") onRedraw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRedraw]);

  if (phase === "prediction-error") {
    return (
      <div className="momo-guess momo-guess--error" role="alert" aria-label="Kendala prediksi AI" data-testid="popup-error">
        <p className="momo-guess__desc">{errorDetail || "Terjadi kesalahan pada layanan prediksi."}</p>
        <PredictionErrorActions onRetry={onRetry} onRedraw={onRedraw} />
      </div>
    );
  }
  if (phase !== "evaluating" || !prediction) return null;

  return (
    <div className="momo-guess r83-guess" role="group" aria-label="Tiga tebakan Momo dan keputusanmu" data-testid="popup-evaluating">
      <div className="g-head"><b>Tebakan Momo</b><span className="k-chip" data-testid="prediction-source">{predictionMode === "mock" ? "Demo: tebakan simulasi" : "Model AI"}</span></div>
      <DecisionPanel drawingInput={drawingInput} prediction={prediction} level={level} onAccept={onAccept} onCorrect={onCorrect} onOverride={onOverride} onRedraw={onRedraw} />
    </div>
  );
}
