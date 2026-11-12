"use client";
/**
 * R11: Momo's guess lives in her chat, under her bubble (replaces the separate Top3PredictionPopup).
 * Top-3 with the provider's real percents, then the decisions (Terima, Pakai, Bukan ini, Gambar lagi), all chosen
 * with a finger count, the thumb or a pinch (no cursor), or a held click in fallback. Display + decision UI only:
 * Momo herself never decides.
 */
import { useEffect } from "react";
import type { PredictionResult } from "@/src/domain/types";
import type { LevelDefinition } from "@/src/domain/levels";
import { DecisionPanel } from "../decision/DecisionPanel";
import { PredictionErrorActions } from "./PredictionErrorActions";

export interface MomoGuessChatProps {
  phase: "predicting" | "evaluating" | "prediction-error";
  prediction: PredictionResult | null;
  errorDetail?: string | null;
  predictionMode: "mock" | "partner";
  level: LevelDefinition;
  onAccept: () => void;
  onCorrect: (rank: 2 | 3) => void;
  onOverride: (label: string) => void;
  onRedraw: () => void;
  onRetry: () => void;
}

export function MomoGuessChat({ phase, prediction, errorDetail, predictionMode, level, onAccept, onCorrect, onOverride, onRedraw, onRetry }: MomoGuessChatProps) {
  // Esc returns to drawing without committing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRedraw();
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
    <div className="momo-guess" role="group" aria-label="Tiga tebakan Momo dan keputusanmu" data-testid="popup-evaluating">
      <h3 className="momo-guess__title">Tebakan Momo</h3>
      <span className="visually-hidden" data-testid="prediction-source">
        {predictionMode === "mock" ? "Demo: tebakan simulasi" : "Model partner"}
      </span>
      <DecisionPanel prediction={prediction} level={level} onAccept={onAccept} onCorrect={onCorrect} onOverride={onOverride} onRedraw={onRedraw} />
    </div>
  );
}
