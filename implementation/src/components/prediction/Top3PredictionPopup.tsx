"use client";
import { useEffect, useState } from "react";
import type { Top3PredictionPopupProps } from "./top3-popup-types";
import { Top3Panel } from "./Top3Panel";
import { DecisionPanel, type DecisionSelection } from "../decision/DecisionPanel";
import { Icon } from "../shared/Icon";

/**
 * Top-3 HITL panel. Sits at the right edge so the student's drawing stays visible next to it.
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
  const [selection, setSelection] = useState<DecisionSelection>(null);

  // Accessibility: Esc cancels the panel and safely returns to drawing without committing
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
      <div
        className="prediction-hitl-popup is-error"
        role="alert"
        aria-label="Tebakan gagal"
        data-testid="popup-error"
      >
        <div className="popup-header">
          <h3 className="popup-title">Tebakan gagal</h3>
        </div>
        <p className="popup-lead">Gambarmu aman. Coba lagi atau gambar ulang.</p>
        <p className="popup-desc">{errorDetail || "Layanan prediksi tidak merespons."}</p>
        <div className="popup-actions-error">
          <button type="button" className="btn btn-primary" onClick={onRetry} data-testid="btn-retry-prediction">
            <Icon name="retry" size={20} />
            Coba lagi
          </button>
          <button type="button" className="btn" onClick={onRedraw} data-testid="btn-redraw-error">
            <Icon name="brush" size={20} />
            Gambar ulang
          </button>
        </div>
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
      aria-label="Tebakan Momo dan keputusanmu"
      data-testid="popup-evaluating"
    >
      <div className="popup-header">
        <h3 className="popup-title">Tebakan Momo</h3>
        <span className="demo-chip" data-testid="prediction-source">
          {predictionMode === "mock" ? "Demo / simulasi" : "Uji model mitra"}
        </span>
      </div>
      <p className="popup-lead">Tebakan, bukan jawaban pasti.</p>

      <Top3Panel result={prediction} chosenRank={selection?.rank ?? null} />

      <DecisionPanel
        prediction={prediction}
        level={level}
        onAccept={onAccept}
        onCorrect={onCorrect}
        onOverride={onOverride}
        onRedraw={onRedraw}
        onSelectionChange={setSelection}
      />
    </div>
  );
}
