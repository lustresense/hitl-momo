"use client";
import type { PredictionResult } from "@/src/domain/types";
import { DwellButton } from "../ui/DwellButton";
import { Icon } from "../ui/Icon";

export interface Top3PanelProps {
  result: PredictionResult;
  /**
   * Decision mode: every candidate is one big button that picks its rank (1 = accept, 2 or 3 = correct).
   * Without it the panel only shows the candidates.
   */
  onPick?: (rank: 1 | 2 | 3) => void;
  disabled?: boolean;
}

/**
 * Top-3 + confidence presentation.
 * Exactly 3 items when valid; confidence shown as a comparable value, never framed as correctness.
 * Rank 1 is marked with a star, not with the word "Utama".
 */
export function Top3Panel({ result, onPick, disabled = false }: Top3PanelProps) {
  return (
    <ol className="top3" aria-label="Tiga tebakan teratas">
      {result.candidates.map((c, i) => {
        const percent = Math.round(c.confidence * 100);
        const star = i === 0 ? (
          <span className="rank1-badge" role="img" aria-label="Pilihan Utama">
            <Icon name="star" size={14} stroke={2.6} fill="currentColor" />
          </span>
        ) : null;
        const bar = (
          <span className="conf-bar" role="img" aria-label={`Bar keyakinan ${percent} persen`}>
            <span className="conf-fill" style={{ width: `${percent}%` }} />
          </span>
        );

        if (!onPick) {
          return (
            <li
              key={`${c.label}-${i}`}
              className={`top3-item ${i === 0 ? "top3-item-rank1" : ""}`}
              tabIndex={0}
              aria-label={`Peringkat ${i + 1}: ${c.label}, keyakinan ${percent} persen`}
              data-rank={i + 1}
            >
              <span className="rank" aria-hidden="true">{i + 1}</span>
              <span className="label">{c.label}</span>
              {star}
              {bar}
              <span className="conf-num">{percent}%</span>
            </li>
          );
        }

        const rank = (i + 1) as 1 | 2 | 3;
        const verb = rank === 1 ? "Terima" : "Pakai";
        return (
          <li key={`${c.label}-${i}`} className="top3-slot" data-rank={rank} aria-label={`Peringkat ${rank}: ${c.label}, keyakinan ${percent} persen`}>
            <DwellButton
              className={`top3-item top3-item--pick ${i === 0 ? "top3-item-rank1" : ""}`}
              testId={rank === 1 ? "btn-accept" : `btn-correct-${rank}`}
              label={`${verb} ${c.label}, peringkat ${rank}, keyakinan ${percent} persen`}
              icon={<span className="top3-item__rank">{rank}</span>}
              disabled={disabled}
              onActivate={() => onPick(rank)}
            >
              <span className="top3-item__body">
                <span className="top3-item__verb">
                  {verb}
                  {star}
                </span>
                <span className="label">{c.label}</span>
                <span className="conf-num">{percent}%</span>
                {bar}
              </span>
            </DwellButton>
          </li>
        );
      })}
    </ol>
  );
}
