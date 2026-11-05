/**
 * In-world success pop-up: Momo celebrates (one extra wing flap after 1.1 s) next to the summary card.
 */
import { useEffect, useState } from "react";
import { MomoAvatar } from "../momo/MomoAvatar";
import type { GameSummary } from "./game-stage-types";

const SECOND_FLAP_DELAY_MS = 1100;

export interface SuccessPopupProps {
  summary?: GameSummary;
  onNextLevel?: () => void;
  onBackToLevels?: () => void;
  onOutcomeReported: (outcome: "success") => void;
}

export function SuccessPopup({ summary, onNextLevel, onBackToLevels, onOutcomeReported }: SuccessPopupProps) {
  const [flapKey, setFlapKey] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setFlapKey(1), SECOND_FLAP_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="world-win" data-testid="outcome-overlay">
      <div className="world-win-momo" aria-hidden="true">
        <MomoAvatar expression="Semangat" height={300} trackMotion flapKey={flapKey} label="Momo merayakan" />
      </div>
      <div className="overlay world-win-card" role="status">
        <h3 className="overlay-title" data-testid="outcome-title">
          Selamat, berhasil!
        </h3>
        {summary && (
          <>
            <p>{summary.gameplay}</p>
            <p className="summary-literacy-line">{summary.decision}</p>
            <p className="summary-literacy-line">{summary.literacy}</p>
          </>
        )}
        <div className="overlay-actions">
          {onNextLevel && (
            <button
              className="btn btn-primary"
              data-testid="btn-next-level"
              onClick={() => {
                onOutcomeReported("success");
                onNextLevel();
              }}
            >
              Lanjut ke level berikutnya
            </button>
          )}
          <button
            className="btn"
            data-testid="btn-back-to-levels"
            onClick={() => {
              onOutcomeReported("success");
              onBackToLevels?.();
            }}
          >
            Pilih level
          </button>
        </div>
      </div>
    </div>
  );
}
