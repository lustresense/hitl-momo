"use client";
import { Icon } from "../shared/Icon";

/**
 * Predicting (loading) and prediction-error states.
 * Every failure offers explicit recovery: retry keeps the drawing,
 * redraw returns to the canvas. Nothing is fabricated on failure.
 */
export interface PredictingScreenProps {
  error: boolean;
  detail: string | null;
  onRetry(): void;
  onRedraw(): void;
}

export function PredictingScreen({ error, detail, onRetry, onRedraw }: PredictingScreenProps) {
  return (
    <section id="screen-predicting" className="screen" aria-label="Memproses prediksi">
      <h2>{error ? "Tebakan gagal" : "Momo sedang membaca"}</h2>
      {!error && (
        <div className="loading-bar" aria-hidden="true">
          <div className="loading-fill" />
        </div>
      )}
      {error && (
        <div className="error-box" role="alert" data-testid="prediction-error">
          <p>
            Gambarmu aman. Coba lagi atau gambar ulang.
            {detail ? ` (${detail})` : ""}
          </p>
          <button type="button" className="btn btn-primary" data-testid="btn-retry-prediction" onClick={onRetry}>
            <Icon name="retry" size={20} />
            Coba lagi
          </button>
          <button type="button" className="btn" data-testid="btn-redraw-from-error" onClick={onRedraw}>
            <Icon name="brush" size={20} />
            Gambar ulang
          </button>
        </div>
      )}
    </section>
  );
}
