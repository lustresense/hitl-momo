"use client";
/**
 * TASK 03/13 — Predicting (loading) and prediction-error states.
 * Every failure offers explicit recovery: retry keeps the drawing,
 * redraw returns to the canvas. Nothing is fabricated on failure.
 */
import { DwellButton } from "../ui/DwellButton";
import { HandCursor } from "../ui/HandCursor";
import { Icon } from "../ui/Icon";

export interface PredictingScreenProps {
  error: boolean;
  detail: string | null;
  onRetry(): void;
  onRedraw(): void;
}

export function PredictingScreen({ error, detail, onRetry, onRedraw }: PredictingScreenProps) {
  return (
    <section id="screen-predicting" className="screen" aria-label="Memproses prediksi">
      <h2>{error ? "Prediksi gagal" : "Momo sedang membaca pola…"}</h2>
      {!error && (
        <>
          <p className="lead">Memproses gambar menuju prediksi.</p>
          <div className="loading-bar" aria-hidden="true">
            <div className="loading-fill" />
          </div>
        </>
      )}
      {error && (
        <div className="error-box" role="alert" data-testid="prediction-error">
          <p>
            Penyedia prediksi tidak dapat menyelesaikan permintaan
            {detail ? ` (${detail})` : ""}. Tidak ada hasil yang dikarang — coba lagi atau gambar ulang.
          </p>
          <DwellButton
            testId="btn-retry-prediction"
            className="dwell-btn--primary"
            label="Coba Lagi"
            icon={<Icon name="again" size={20} />}
            onActivate={onRetry}
          >
            Coba Lagi
          </DwellButton>
          <DwellButton
            testId="btn-redraw-from-error"
            label="Gambar Ulang"
            icon={<Icon name="pencil" size={20} />}
            onActivate={onRedraw}
          >
            Gambar Ulang
          </DwellButton>
          <HandCursor />
        </div>
      )}
    </section>
  );
}
