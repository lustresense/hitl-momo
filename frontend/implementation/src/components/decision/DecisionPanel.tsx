"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelContext, PredictionResult } from "@/src/domain/types";
import { Top3Panel } from "../prediction/Top3Panel";
import { DwellButton } from "../ui/DwellButton";
import { Icon } from "../ui/Icon";
import "./DecisionPanel.css";

export interface DecisionPanelProps {
  prediction: PredictionResult;
  level: LevelContext;
  onAccept(): void;
  onCorrect(rank: 2 | 3): void;
  onOverride(label: string): void;
  onRedraw(): void;
}

/**
 * The three HITL decisions, chosen with the fingertip (dwell) or with a mouse, touch or keyboard.
 * - Candidate 1 (Terima) accepts. Candidates 2 and 3 (Pakai) correct to that rank.
 * - "Bukan ini, pilih lainnya" opens the other vocabulary labels. Picking one selects it; Pakai commits it.
 * - "Gambar ulang" is the recovery route, outside the three decisions.
 * The first committed decision locks the others until the next prediction.
 */
export function DecisionPanel({ prediction, level, onAccept, onCorrect, onOverride, onRedraw }: DecisionPanelProps) {
  const committed = useRef(false);
  const [locked, setLocked] = useState(false);
  const [picker, setPicker] = useState<"none" | "override">("none");
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);

  useEffect(() => {
    committed.current = false;
    setLocked(false);
    setPicker("none");
    setPickedLabel(null);
  }, [prediction]);

  const overrideOptions = useMemo(() => {
    const top3 = new Set(prediction.candidates.map((c) => c.label));
    return level.vocabulary.filter((v) => !top3.has(v));
  }, [level.vocabulary, prediction]);

  const commit = (run: () => void) => {
    if (committed.current) return;
    committed.current = true;
    setLocked(true);
    run();
  };

  const pickCandidate = (rank: 1 | 2 | 3) => {
    if (rank === 1) commit(onAccept);
    else commit(() => onCorrect(rank));
  };

  const pickOverride = () => {
    if (pickedLabel === null) return;
    const label = pickedLabel;
    commit(() => onOverride(label));
  };

  return (
    <aside className="nui-decision">
      <Top3Panel result={prediction} onPick={pickCandidate} disabled={locked} />

      <DwellButton
        testId="btn-override"
        className="nui-decision__open"
        label="Bukan ini, pilih lainnya"
        expanded={picker === "override"}
        disabled={locked}
        icon={<Icon name="swap" size={20} stroke={2.6} />}
        onActivate={() => setPicker((p) => (p === "override" ? "none" : "override"))}
      >
        Bukan ini, pilih lainnya
      </DwellButton>

      {picker === "override" && (
        <div className="nui-choices" role="group" aria-label="Benda lain di level ini" data-testid="override-picker">
          {overrideOptions.length > 0 ? (
            <div className="nui-choices__grid">
              {overrideOptions.map((v) => (
                <DwellButton
                  key={v}
                  testId={`override-option-${v}`}
                  className="nui-choice"
                  label={`Pilih ${v}`}
                  pressed={pickedLabel === v}
                  disabled={locked}
                  onActivate={() => setPickedLabel(v)}
                >
                  {v}
                </DwellButton>
              ))}
            </div>
          ) : (
            <p className="nui-choices__empty">Tidak ada benda lain di level ini.</p>
          )}
          {pickedLabel !== null && (
            <DwellButton
              testId="override-confirm"
              className="nui-decision__confirm dwell-btn--primary"
              label={`Pakai ${pickedLabel}`}
              disabled={locked}
              icon={<Icon name="check" size={20} stroke={3} />}
              onActivate={pickOverride}
            >
              Pakai {pickedLabel}
            </DwellButton>
          )}
        </div>
      )}

      {/* Redraw = recovery route, deliberately outside the three decisions. */}
      <DwellButton
        testId="btn-redraw"
        className="dwell-btn--ghost nui-decision__redraw"
        label="Gambar ulang"
        icon={<Icon name="pencil" size={20} />}
        onActivate={onRedraw}
      >
        Gambar ulang
      </DwellButton>
    </aside>
  );
}
