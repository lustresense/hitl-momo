"use client";
import type { PredictionResult } from "@/src/domain/types";
import { actionFor, MODE_TOP3_PANEL } from "@/src/input/gesture-mode";
import { useHandGesture, useInputMode } from "../../hooks/useHandGesture";
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import { Icon } from "../ui/Icon";

export interface Top3PanelProps {
  result: PredictionResult;
  /**
   * Decision mode: every candidate is one big ring that picks its rank (1 finger = accept, 2 and 3 fingers = correct).
   * Without it the panel only shows the candidates.
   */
  onPick?: (rank: 1 | 2 | 3) => void;
  /** Locks the rings (grey, padlocked) once a decision is taken, or while another choice is open. */
  disabled?: boolean;
}

/** Holding a finger count this long fills the ring. Not shortened: the tests advance fake time. */
export const TOP3_HOLD_MS = 1500;

/** The router action that picks each rank: the pose is read through MODE_TOP3_PANEL, never the raw finger count. */
export const RANK_ACTION = { 1: "choose-1", 2: "choose-2", 3: "choose-3" } as const;

/**
 * Top-3 + confidence presentation.
 * Exactly 3 items when valid; confidence shown as a comparable value, never framed as correctness.
 * Rank 1 is marked with a star, not with the word "Utama". No cursor: a candidate is picked by its finger pose (one, two or three fingers, via the gesture router).
 */
export function Top3Panel({ result, onPick, disabled = false }: Top3PanelProps) {
  const camera = useInputMode() === "camera";
  const gesture = useHandGesture(Boolean(onPick) && camera && !disabled);

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
            <GestureRing
              className={`top3-item top3-item--pick ${i === 0 ? "top3-item-rank1" : ""}`}
              testId={rank === 1 ? "btn-accept" : `btn-correct-${rank}`}
              label={`${verb} ${c.label}, peringkat ${rank}, keyakinan ${percent} persen`}
              active={camera && actionFor(MODE_TOP3_PANEL, gesture.pose) === RANK_ACTION[rank]}
              holdMs={TOP3_HOLD_MS}
              locked={disabled}
              icon={<FingerGlyph count={rank} size={28} />}
              onConfirm={() => onPick(rank)}
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
            </GestureRing>
          </li>
        );
      })}
    </ol>
  );
}
