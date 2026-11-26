"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import type { LevelDefinition } from "@/src/domain/levels";
import type { DrawingInput, PredictionResult } from "@/src/domain/types";
import { HOLD_MS_DECISION, HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import { buildGuessModel, resolveGuessProvenance } from "./guess-model";
import { GuessChoiceButton } from "./GuessChoiceButton";
import { GuessErrorView, GuessPredictingView, ProvenanceBadge } from "./GuessPanelStates";
import { StrokePreview } from "./StrokePreview";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type GuessSubMode = "top3" | "other";

export interface GuessPanelProps {
  readonly phase: "predicting" | "evaluating" | "prediction-error";
  readonly prediction: PredictionResult | null;
  readonly errorDetail?: string | null;
  readonly providerMode: "mock" | "partner";
  readonly level: LevelDefinition;
  readonly drawingInput: DrawingInput | null;
  readonly subMode?: GuessSubMode;
  readonly onSubModeChange?: (mode: GuessSubMode) => void;
  readonly onAccept: () => void;
  readonly onCorrect: (rank: 2 | 3) => void;
  readonly onOverride: (label: string) => void;
  readonly onRedraw: () => void;
  readonly onRetry: () => void;
}

/**
 * Panel Top-3 & error recovery r8.3 di dalam bubble Momo (`guess.js`).
 * Baris B (Terima 1 / Pakai 2-3 = 2000 ms), katalog Override minus Top-3 (2000 ms),
 * Kembali / Gambar lagi / Coba lagi (1000 ms), serta shortcut keyboard 1–3 & Escape.
 */
export function GuessPanel({
  phase,
  prediction,
  errorDetail,
  providerMode,
  level,
  drawingInput,
  subMode: controlledSubMode,
  onSubModeChange,
  onAccept,
  onCorrect,
  onOverride,
  onRedraw,
  onRetry,
}: GuessPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const committedRef = useRef(false);
  const [internalSubMode, setInternalSubMode] = useState<GuessSubMode>("top3");
  const subMode = controlledSubMode ?? internalSubMode;

  const setSubMode = (next: GuessSubMode) => {
    setInternalSubMode(next);
    onSubModeChange?.(next);
  };

  useEffect(() => {
    committedRef.current = false;
    setInternalSubMode("top3");
  }, [prediction, phase]);

  const model = useMemo(
    () => (prediction ? buildGuessModel(prediction, level, providerMode) : null),
    [prediction, level, providerMode],
  );
  const provenance = model?.provenance ?? resolveGuessProvenance(providerMode, prediction);

  const commit = useCallback((fn: () => void) => {
    if (committedRef.current) return;
    committedRef.current = true;
    fn();
  }, []);

  useEffect(() => {
    if (phase !== "evaluating" && phase !== "prediction-error") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "Escape") {
        commit(onRedraw);
        return;
      }
      if (phase !== "evaluating" || subMode !== "top3" || !model) return;
      const idx = "123".indexOf(e.key);
      if (idx === 0 && model.rows[0]) commit(onAccept);
      else if (idx === 1 && model.rows[1]) commit(() => onCorrect(2));
      else if (idx === 2 && model.rows[2]) commit(() => onCorrect(3));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, subMode, model, onAccept, onCorrect, onRedraw, commit]);

  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === "undefined") return;

    const ctx = gsap.context(() => {
      if (phase === "predicting") {
        const skRows = el.querySelectorAll(".sk");
        if (skRows.length > 0) {
          gsap.to(skRows, { opacity: 0.45, duration: 0.45, yoyo: true, repeat: -1, stagger: 0.12 });
        }
      } else if (phase === "evaluating") {
        const rows = el.querySelectorAll(".t3-row");
        const actions = el.querySelectorAll(".g-actions .nb-btn");
        if (rows.length > 0) gsap.from(rows, { opacity: 0, x: -24, duration: 0.45, ease: "power3.out", stagger: 0.1 });
        if (actions.length > 0) gsap.from(actions, { opacity: 0, y: 12, duration: 0.35, stagger: 0.07, delay: 0.3 });
      }
    }, el);
    return () => ctx.revert();
  }, [phase, prediction]);

  if (phase === "predicting") {
    return <GuessPredictingView ref={rootRef} provenance={provenance} drawingInput={drawingInput} />;
  }

  if (phase === "prediction-error") {
    return (
      <GuessErrorView
        ref={rootRef}
        provenance={provenance}
        errorDetail={errorDetail}
        onRetry={onRetry}
        onRedraw={() => commit(onRedraw)}
      />
    );
  }

  if (!model) return null;

  const modeBtn =
    subMode === "top3"
      ? {
          id: "r83-guess-other",
          label: CANVAS_COPY.guess.otherCta,
          testId: "r83-guess-other",
          attr: "other",
          onActivate: () => setSubMode("other"),
        }
      : {
          id: "r83-guess-back",
          label: CANVAS_COPY.guess.backCta,
          testId: "r83-guess-back",
          attr: "back",
          onActivate: () => setSubMode("top3"),
        };

  return (
    <div
      ref={rootRef}
      className="momo-guess"
      role="group"
      aria-label={CANVAS_COPY.guess.groupAriaLabel}
      data-testid="r83-guess-panel"
    >
      <div className="g-head">
        <b>{CANVAS_COPY.guess.title}</b>
        <ProvenanceBadge provenance={provenance} />
      </div>
      <div className="g-body">
        <div className="g-thumb fc">
          <StrokePreview drawingInput={drawingInput} />
        </div>
        <div className="t3" role="list" aria-label={CANVAS_COPY.guess.listAriaLabel}>
          {model.rows.map((row) => (
            <GuessChoiceButton
              key={`${row.rank}-${row.label}`}
              id={`r83-guess-row-${row.rank}`}
              label={`${row.actionVerb} ${row.displayLabel} ${row.percent}%`}
              holdMs={HOLD_MS_DECISION}
              className="t3-row pick"
              disabled={subMode === "other"}
              testId={row.rank === 1 ? "r83-guess-accept" : `r83-guess-correct-${row.rank}`}
              dataAttrs={{ "data-k": row.rank - 1, "data-rank": row.rank }}
              onActivate={() => commit(() => (row.rank === 1 ? onAccept() : onCorrect(row.rank)))}
            >
              <span className="t3-rank">{row.rank}</span>
              <span className="t3-name">
                {row.displayLabel} <span className="t3-verb">{row.actionVerb}</span>
              </span>
              <span className="t3-pct">{row.percent}%</span>
              <span className="t3-bar">
                <i style={{ width: `${row.percent}%` }} />
              </span>
            </GuessChoiceButton>
          ))}
        </div>
      </div>

      {subMode === "other" && (
        <div className="g-other" data-testid="r83-override-picker">
          <p>{CANVAS_COPY.guess.otherHeading}</p>
          <div className="g-other-grid">
            {model.overrideOptions.length > 0 ? (
              model.overrideOptions.map((item) => (
                <GuessChoiceButton
                  key={item.labelId}
                  id={`r83-override-${item.labelId}`}
                  label={item.displayName}
                  holdMs={HOLD_MS_DECISION}
                  className="nb-btn"
                  testId={`r83-override-${item.labelId}`}
                  dataAttrs={{ "data-o": item.labelId }}
                  onActivate={() => commit(() => onOverride(item.labelId))}
                >
                  {item.displayName}
                </GuessChoiceButton>
              ))
            ) : (
              <span className="k-chip" data-testid="r83-override-empty">
                {CANVAS_COPY.guess.otherEmpty}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="g-actions">
        <GuessChoiceButton
          id={modeBtn.id}
          label={modeBtn.label}
          holdMs={HOLD_MS_DEFAULT}
          className="nb-btn"
          testId={modeBtn.testId}
          dataAttrs={{ "data-a": modeBtn.attr }}
          onActivate={modeBtn.onActivate}
        >
          {modeBtn.label}
        </GuessChoiceButton>
        <GuessChoiceButton
          id="r83-guess-redraw"
          label={CANVAS_COPY.guess.redrawCta}
          holdMs={HOLD_MS_DEFAULT}
          className="nb-btn ghost"
          testId="r83-guess-redraw"
          dataAttrs={{ "data-a": "redraw" }}
          onActivate={() => commit(onRedraw)}
        >
          {CANVAS_COPY.guess.redrawCta}
        </GuessChoiceButton>
      </div>
    </div>
  );
}
