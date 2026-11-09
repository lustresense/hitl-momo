"use client";
/**
 * R11: Momo's guess lives in her chat, under her bubble (replaces the separate Top3PredictionPopup).
 * Top-3 with the provider's real percents, then Terima (thumb ring 2 s), Pilih lain and Bukan semua.
 * Display + decision UI only: Momo herself never decides.
 */
import { useEffect } from "react";
import type { PredictionResult } from "@/src/domain/types";
import type { LevelDefinition } from "@/src/domain/levels";
import { confidencePercent } from "@/src/domain/momo-script";
import { DecisionPanel } from "../decision/DecisionPanel";
import { Icon } from "../ui/Icon";

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
        <div className="momo-guess__row">
          <button type="button" className="nb-btn nb-btn--primary btn-small" onClick={onRetry} data-testid="btn-retry-prediction">
            <Icon name="again" size={17} />
            Coba lagi
          </button>
          <button type="button" className="nb-btn btn-small" onClick={onRedraw} data-testid="btn-redraw-error">
            <Icon name="pencil" size={17} />
            Revisi gambar
          </button>
        </div>
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
      <ol className="momo-guess__top3" aria-label="Tiga tebakan teratas">
        {prediction.candidates.map((c, i) => {
          const pct = confidencePercent(c.confidence);
          return (
            <li key={`${c.label}-${i}`} className={`momo-guess__item${i === 0 ? " is-rank1" : ""}`} data-rank={i + 1} aria-label={`Peringkat ${i + 1}: ${c.label}, keyakinan ${pct} persen`}>
              <span className="momo-guess__rank" aria-hidden="true">{i + 1}</span>
              <span className="momo-guess__label">{c.label}</span>
              <span className="momo-guess__pct">{pct}%</span>
            </li>
          );
        })}
      </ol>
      <DecisionPanel prediction={prediction} level={level} onAccept={onAccept} onCorrect={onCorrect} onOverride={onOverride} onRedraw={onRedraw} confirm="thumb" />
    </div>
  );
}
