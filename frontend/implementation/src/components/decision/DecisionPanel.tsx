"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelContext, PredictionResult } from "@/src/domain/types";
import { Icon } from "../ui/Icon";
import { ThumbConfirm } from "../ui/ThumbConfirm";

export interface DecisionPanelProps {
  prediction: PredictionResult;
  level: LevelContext;
  onAccept(): void;
  onCorrect(rank: 2 | 3): void;
  onOverride(label: string): void;
  onRedraw(): void;
  /**
   * "tap" (default): a tap commits. "thumb" (R4/R11, Momo chat): Terima is a 2 s thumb ring; Pilih lain and
   * Bukan semua stay tap buttons that open their picker, and the picked option is committed with a 2 s ring.
   * Only one ring is live at a time (one thumbs-up fills every mounted ring).
   */
  confirm?: "tap" | "thumb";
}

/**
 * The three HITL decisions. Choosing is committing: Accept commits on tap, Correct commits when a rank
 * (2 or 3) is tapped, Override commits when a label is confirmed. The object is created from that decision;
 * entering it into the world is a separate, explicit offer shown afterwards (GameStage).
 * Redraw is a recovery link outside the decision group, never a fourth decision.
 */
export function DecisionPanel({ prediction, level, onAccept, onCorrect, onOverride, onRedraw, confirm = "tap" }: DecisionPanelProps) {
  const committed = useRef(false);
  const [locked, setLocked] = useState(false);
  const [picker, setPicker] = useState<"none" | "correct" | "override">("none");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pickedRank, setPickedRank] = useState<2 | 3 | null>(null);
  const [pickedLabel, setPickedLabel] = useState("");
  const thumb = confirm === "thumb";

  useEffect(() => {
    committed.current = false;
    setLocked(false);
    setChosen(null);
    setPickedRank(null);
    setPickedLabel("");
  }, [prediction]);

  const overrideOptions = useMemo(() => {
    const top3 = new Set(prediction.candidates.map((c) => c.label));
    return level.vocabulary.filter((v) => !top3.has(v));
  }, [level.vocabulary, prediction]);

  const r1 = prediction.candidates[0];
  const r2 = prediction.candidates[1];
  const r3 = prediction.candidates[2];

  const commit = (kind: string, run: () => void) => {
    if (committed.current) return;
    committed.current = true;
    setLocked(true);
    setChosen(kind);
    run();
  };

  return (
    <aside className="side-panel">
      <div className="decision-row">
        {thumb ? (
          <ThumbConfirm
            holdMs={2000}
            className={`btn-accept${chosen === "accept" ? " is-selected" : ""}`}
            testId="btn-accept"
            label={`Terima ${r1?.label ?? ""}`.trim()}
            disabled={locked || picker !== "none"}
            onConfirm={() => commit("accept", onAccept)}
          />
        ) : (
          <button
            type="button"
            className={`nb-btn btn-accept${chosen === "accept" ? " is-selected" : ""}`}
            data-testid="btn-accept"
            aria-label={`Accept: terima peringkat 1, ${r1?.label ?? ""}`}
            disabled={locked}
            onClick={() => commit("accept", onAccept)}
          >
            <Icon name="check" size={19} stroke={3} />
            Terima
          </button>
        )}
        <button
          type="button"
          className={`nb-btn btn-correct${chosen === "correct" ? " is-selected" : ""}`}
          data-testid="btn-correct"
          aria-label="Correct: pilih peringkat lain"
          aria-expanded={picker === "correct"}
          disabled={locked}
          onClick={() => setPicker((p) => (p === "correct" ? "none" : "correct"))}
        >
          <Icon name="swap" size={19} stroke={2.6} />
          Pilih lain
        </button>
        <button
          type="button"
          className={`nb-btn btn-override${chosen === "override" ? " is-selected" : ""}`}
          data-testid="btn-override"
          aria-label="Override: tolak semua tebakan"
          aria-expanded={picker === "override"}
          disabled={locked}
          onClick={() => setPicker((p) => (p === "override" ? "none" : "override"))}
        >
          <Icon name="close" size={19} stroke={3} />
          Bukan semua
        </button>
      </div>

      {picker === "correct" && (
        <div className="subpanel subpanel-row" data-testid="correct-picker">
          {[2, 3].map((rank) => {
            const cand = rank === 2 ? r2 : r3;
            if (!cand) return null;
            return (
              <button
                key={rank}
                type="button"
                className="nb-btn correct-option"
                data-rank={rank}
                disabled={locked}
                aria-pressed={thumb ? pickedRank === rank : undefined}
                onClick={() => (thumb ? setPickedRank(rank as 2 | 3) : commit("correct", () => onCorrect(rank as 2 | 3)))}
              >
                <span className="correct-option__rank" aria-hidden="true">{rank}</span>
                <span className="correct-option__label">{cand.label}</span>
                <span className="correct-option__pct">{Math.round(cand.confidence * 100)}%</span>
              </button>
            );
          })}
          {thumb && pickedRank !== null && (
            <ThumbConfirm
              holdMs={2000}
              testId="correct-confirm"
              label={`Pakai ${(pickedRank === 2 ? r2 : r3)?.label ?? ""}`.trim()}
              disabled={locked}
              onConfirm={() => commit("correct", () => onCorrect(pickedRank))}
            />
          )}
        </div>
      )}

      {picker === "override" && (
        <div className="subpanel subpanel-row" data-testid="override-picker">
          <label htmlFor="override-select" className="sr-only">Label yang dimaksud</label>
          <select id="override-select" defaultValue="" disabled={locked} onChange={(e) => { setOverrideError(null); setPickedLabel(e.target.value); }}>
            <option value="" disabled>
              Pilih benda
            </option>
            {overrideOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {thumb ? (
            overrideOptions.includes(pickedLabel) && (
              <ThumbConfirm
                holdMs={2000}
                testId="override-confirm"
                label={`Pakai ${pickedLabel}`}
                disabled={locked}
                onConfirm={() => commit("override", () => onOverride(pickedLabel))}
              />
            )
          ) : (
            <button
              type="button"
              className="nb-btn nb-btn--primary btn-small"
              data-testid="override-confirm"
              disabled={locked}
              onClick={() => {
                const el = document.getElementById("override-select") as HTMLSelectElement | null;
                const value = el?.value ?? "";
                if (!value || !overrideOptions.includes(value)) {
                  setOverrideError("Pilih label dulu.");
                  return;
                }
                setOverrideError(null);
                commit("override", () => onOverride(value));
              }}
            >
              Pakai
            </button>
          )}
          <p className="feedback" role="alert">
            {overrideError}
          </p>
        </div>
      )}

      {/* Redraw = recovery route, deliberately outside the three decisions. */}
      <button type="button" className="nb-btn nb-btn--ghost btn-small redraw-link" data-testid="btn-redraw" onClick={onRedraw}>
        <Icon name="pencil" size={17} />
        Gambar ulang
      </button>
    </aside>
  );
}
