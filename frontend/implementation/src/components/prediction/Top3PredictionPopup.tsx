"use client";
import { useEffect } from "react";
import type { Top3PredictionPopupProps } from "./top3-popup-types";
import { DecisionPanel } from "../decision/DecisionPanel";
import { Icon } from "../ui/Icon";
import { PredictionErrorActions } from "./PredictionErrorActions";

/**
 * Top-3 HITL Prediction Floating Popup.
 * Floats in the top-left area over the active drawing canvas.
 * Does NOT open a new page, route, or fullscreen modal.
 */
export function Top3PredictionPopup({
  phase,
  prediction,
  errorDetail,
  predictionMode,
  level,
  onAccept,
  onCorrect,
  onOverride,
  onRedraw,
  onRetry,
}: Top3PredictionPopupProps) {
  // Accessibility: Esc key cancels popup and safely returns to drawing without committing
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onRedraw();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRedraw]);

  if (phase === "predicting") return null;

  if (phase === "prediction-error") {
    return (
      <div className="prediction-hitl-popup is-error" role="alert" aria-label="Kendala prediksi AI" data-testid="popup-error">
        <div className="popup-badge error-badge">
          <Icon name="close" size={14} stroke={3.2} />
          Kendala
        </div>
        <h3 className="popup-title">Momo belum bisa menebak</h3>
        <p className="popup-desc">{errorDetail || "Terjadi kesalahan pada layanan prediksi."}</p>
        <PredictionErrorActions className="popup-actions-error" onRetry={onRetry} onRedraw={onRedraw} />
      </div>
    );
  }

  if (phase !== "evaluating" || !prediction) {
    return null;
  }

  return (
    <div
      className="prediction-hitl-popup is-evaluating"
      role="dialog"
      aria-modal="false"
      aria-label="Tiga tebakan Momo dan keputusanmu"
      data-testid="popup-evaluating"
    >
      <div className="popup-header">
        <h3 className="popup-title">Tebakan Momo</h3>
        {/* Provenance stays machine-readable; the visible notice is the single demo tape of the shell. */}
        <span className="visually-hidden" data-testid="prediction-source">
          {predictionMode === "mock" ? "Demo: tebakan simulasi" : "Model partner"}
        </span>
      </div>

      <div className="popup-decision">
        <DecisionPanel
          prediction={prediction}
          level={level}
          onAccept={onAccept}
          onCorrect={onCorrect}
          onOverride={onOverride}
          onRedraw={onRedraw}
        />
      </div>
    </div>
  );
}
