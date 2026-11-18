"use client";
/**
 * TASK 03/13 — Predicting (loading) and prediction-error states.
 * Every failure offers explicit recovery: retry keeps the drawing,
 * redraw returns to the canvas. Nothing is fabricated on failure.
 *
 * S1: the recovery choices have no cursor. "Coba Lagi" = one finger, "Gambar lagi" = open palm, each held to a full
 * GestureRing; a mouse or touch hold fills the same rings for the fallback mode. The poses come through the one
 * gesture router, never a raw finger count.
 */
import { useHandGesture } from "@/src/hooks/useHandGesture";
import { MODE_CANVAS_STAMP_READY, MODE_FAIL, actionFor } from "@/src/input/gesture-mode";
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import "./predicting-recovery.css";

/** A held pose (or press) for the recovery choices: long enough to read, short enough not to stall the student. */
export const RECOVERY_HOLD_MS = 1500;

export interface PredictingScreenProps {
  error: boolean;
  detail: string | null;
  onRetry(): void;
  onRedraw(): void;
}

export function PredictingScreen({ error, detail, onRetry, onRedraw }: PredictingScreenProps) {
  // The hand is read only while the recovery choices are on screen (the loading state needs no tracker).
  const hand = useHandGesture(error);
  const retryActive = actionFor(MODE_FAIL, hand.pose) === "retry";
  // The same open palm that means "Gambar lagi" on the sticker and the canvas.
  const redrawActive = actionFor(MODE_CANVAS_STAMP_READY, hand.pose) === "redraw";

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
            {detail ? ` (${detail})` : ""}. Tidak ada hasil yang dikarang — coba lagi atau gambar lagi.
          </p>
          <div className="predicting-recovery">
            <GestureRing
              testId="btn-retry-prediction"
              label="Coba Lagi"
              active={retryActive}
              holdMs={RECOVERY_HOLD_MS}
              onConfirm={onRetry}
              icon={<FingerGlyph count={1} size={28} />}
            >
              Coba Lagi
            </GestureRing>
            <GestureRing
              testId="btn-redraw-from-error"
              label="Gambar lagi"
              active={redrawActive}
              holdMs={RECOVERY_HOLD_MS}
              onConfirm={onRedraw}
              icon={<FingerGlyph count={5} size={28} />}
            >
              Gambar lagi
            </GestureRing>
          </div>
        </div>
      )}
    </section>
  );
}
