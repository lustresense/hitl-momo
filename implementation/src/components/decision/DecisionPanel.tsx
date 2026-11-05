"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelContext, PredictionResult } from "@/src/domain/types";
import { Icon } from "../shared/Icon";

export interface DecisionPanelProps {
  prediction: PredictionResult;
  level: LevelContext;
  onAccept(): void;
  onCorrect(rank: 2 | 3): void;
  onOverride(label: string): void;
  onRedraw(): void;
  /** Lets the Top-3 slips mirror the student's pending choice (highlighter on the chosen rank). */
  onSelectionChange?(selection: DecisionSelection): void;
}

export type DecisionSelection =
  | { kind: "accept"; rank: 1; label: string }
  | { kind: "correct"; rank: 2 | 3; label: string }
  | { kind: "override"; rank: null; label: string }
  | null;

/**
 * Three decisions only (Accept / Correct rank 2|3 / Override outside Top-3).
 * Redraw is a recovery path and stays visually outside the decision group.
 * Pencil = what the machine said; ink = what the student chose.
 */
export function DecisionPanel({
  prediction,
  level,
  onAccept,
  onCorrect,
  onOverride,
  onRedraw,
  onSelectionChange,
}: DecisionPanelProps) {
  const committed = useRef(false);
  const [locked, setLocked] = useState(false);
  const [picker, setPicker] = useState<"none" | "correct" | "override">("none");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DecisionSelection>(null);

  useEffect(() => {
    committed.current = false;
    setLocked(false);
    setSelected(null);
  }, [prediction]);

  const notify = useRef(onSelectionChange);
  notify.current = onSelectionChange;
  useEffect(() => {
    notify.current?.(selected);
  }, [selected]);

  const overrideOptions = useMemo(() => {
    const top3 = new Set(prediction.candidates.map((c) => c.label));
    return level.vocabulary.filter((v) => !top3.has(v));
  }, [level.vocabulary, prediction]);

  const first = prediction.candidates[0];
  const r2 = prediction.candidates[1];
  const r3 = prediction.candidates[2];

  const handleCommit = () => {
    if (!selected || committed.current) return;
    committed.current = true;
    setLocked(true);
    if (selected.kind === "accept") onAccept();
    else if (selected.kind === "correct") onCorrect(selected.rank);
    else onOverride(selected.label);
  };

  return (
    <div className="decision-panel">
      <div className="decision-actions" role="group" aria-label="Keputusanmu">
        <button
          type="button"
          className={`btn decision-btn btn-accept${selected?.kind === "accept" ? " is-selected" : ""}`}
          data-testid="btn-accept"
          aria-label="Terima tebakan peringkat 1"
          aria-pressed={selected?.kind === "accept"}
          disabled={locked}
          onClick={() => {
            if (first) setSelected({ kind: "accept", rank: 1, label: first.label });
            setPicker("none");
          }}
        >
          <Icon name="check" size={24} />
          Terima
        </button>

        <button
          type="button"
          className={`btn decision-btn btn-correct${selected?.kind === "correct" ? " is-selected" : ""}`}
          data-testid="btn-correct"
          aria-label="Pilih lain: peringkat 2 atau 3"
          aria-expanded={picker === "correct"}
          disabled={locked}
          onClick={() => setPicker((p) => (p === "correct" ? "none" : "correct"))}
        >
          <Icon name="swap" size={24} />
          Pilih lain
        </button>

        <button
          type="button"
          className={`btn decision-btn btn-override${selected?.kind === "override" ? " is-selected" : ""}`}
          data-testid="btn-override"
          aria-label="Bukan ketiganya: tolak semua tebakan"
          aria-expanded={picker === "override"}
          disabled={locked}
          onClick={() => setPicker((p) => (p === "override" ? "none" : "override"))}
        >
          <Icon name="pen" size={24} />
          Bukan ketiganya
        </button>
      </div>

      {picker === "correct" && (
        <div className="subpanel" data-testid="correct-picker" role="group" aria-label="Pilih peringkat 2 atau 3">
          <div className="pick-row">
            {[2, 3].map((rank) => {
              const cand = rank === 2 ? r2 : r3;
              if (!cand) return null;
              const isChosen = selected?.kind === "correct" && selected.rank === rank;
              return (
                <button
                  key={rank}
                  type="button"
                  className={`btn correct-option${isChosen ? " is-selected" : ""}`}
                  data-rank={rank}
                  data-testid={`correct-option-${rank}`}
                  aria-pressed={isChosen}
                  onClick={() => setSelected({ kind: "correct", rank: rank as 2 | 3, label: cand.label })}
                >
                  <span className="pick-rank">#{rank}</span>
                  <span className="pick-label">{cand.label}</span>
                  <span className="visually-hidden">{Math.round(cand.confidence * 100)} persen</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {picker === "override" && (
        <div className="subpanel" data-testid="override-picker">
          <label htmlFor="override-select" className="visually-hidden">
            Benda yang dimaksud
          </label>
          <div className="override-row">
            <select
              id="override-select"
              data-testid="override-select"
              defaultValue=""
              onChange={() => {
                setOverrideError(null);
                if (selected?.kind === "override") setSelected(null);
              }}
            >
              <option value="" disabled>
                Pilih benda
              </option>
              {overrideOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="override-confirm"
              onClick={() => {
                const el = document.getElementById("override-select") as HTMLSelectElement | null;
                const value = el?.value ?? "";
                if (!value || !overrideOptions.includes(value)) {
                  setOverrideError("Pilih salah satu benda dulu.");
                  return;
                }
                setOverrideError(null);
                setSelected({ kind: "override", rank: null, label: value });
              }}
            >
              Pilih
            </button>
          </div>
          <p className="feedback" role="alert">
            {overrideError}
          </p>
          {selected?.kind === "override" && (
            <span className="chosen-note" role="status">
              <Icon name="pen" size={16} />
              {selected.label}
            </span>
          )}
        </div>
      )}

      <div className="decision-commit">
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          data-testid="btn-wujudkan-objek"
          disabled={!selected || locked}
          onClick={handleCommit}
        >
          Wujudkan objek
        </button>
      </div>

      {/* Redraw = recovery route, deliberately outside the three decisions. */}
      <button type="button" className="btn btn-quiet btn-small redraw-link" data-testid="btn-redraw" onClick={onRedraw}>
        <Icon name="brush" size={18} />
        Gambar ulang
      </button>
    </div>
  );
}
