"use client";
import type { PredictionResult } from "@/src/domain/types";

/**
 * Top-3 + confidence presentation: three big paper slips. The machine's confidence is drawn in
 * pencil hatching; the slip the student picked gets ink + highlighter (`chosenRank`).
 * Exactly 3 items when valid; confidence is a comparable value, never framed as correctness.
 */
export function Top3Panel({ result, chosenRank = null }: { result: PredictionResult; chosenRank?: number | null }) {
  return (
    <ol className="top3" aria-label="Tiga tebakan teratas">
      {result.candidates.map((c, i) => {
        const rank = i + 1;
        const pct = Math.round(c.confidence * 100);
        return (
          <li
            key={`${c.label}-${i}`}
            className={`top3-item${i === 0 ? " top3-item-rank1 is-rank1" : ""}${chosenRank === rank ? " is-chosen" : ""}`}
            tabIndex={0}
            aria-label={`Peringkat ${rank}: ${c.label}, keyakinan ${pct} persen${chosenRank === rank ? ", dipilih" : ""}`}
            data-rank={rank}
            data-testid={`top3-item-${rank}`}
          >
            <span className="rank">#{rank}</span>
            <span className="label" data-testid="top3-label">{c.label}</span>
            <span className="conf-num">{pct}%</span>
            <span className="conf-bar" role="img" aria-label={`Bar keyakinan ${pct} persen`}>
              <span className="conf-fill" style={{ width: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
