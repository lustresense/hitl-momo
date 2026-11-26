"use client";

import { forwardRef } from "react";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import type { DrawingInput } from "@/src/domain/types";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import type { GuessProvenanceModel } from "./guess-model";
import { GuessChoiceButton } from "./GuessChoiceButton";
import { StrokePreview } from "./StrokePreview";

export function ProvenanceBadge({ provenance }: { readonly provenance: GuessProvenanceModel }) {
  return (
    <span className={`k-chip${provenance.isMock ? " warn" : ""}`} data-testid="r83-prediction-source">
      {provenance.badgeText}
    </span>
  );
}

export const GuessPredictingView = forwardRef<
  HTMLDivElement,
  { readonly provenance: GuessProvenanceModel; readonly drawingInput: DrawingInput | null }
>(function GuessPredictingView({ provenance, drawingInput }, ref) {
  return (
    <div ref={ref} className="momo-guess" data-testid="r83-guess-predicting">
      <div className="g-head">
        <b>{CANVAS_COPY.guess.title}</b>
        <ProvenanceBadge provenance={provenance} />
      </div>
      <div className="g-body">
        <div className="g-thumb fc">
          <StrokePreview drawingInput={drawingInput} />
        </div>
        <div className="t3">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="t3-row sk">
              <span className="t3-rank">·</span>
              <span className="t3-name r83-sk-placeholder">{CANVAS_COPY.guess.predictingPlaceholder}</span>
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export const GuessErrorView = forwardRef<
  HTMLDivElement,
  {
    readonly provenance: GuessProvenanceModel;
    readonly errorDetail?: string | null;
    readonly onRetry: () => void;
    readonly onRedraw: () => void;
  }
>(function GuessErrorView({ provenance, errorDetail, onRetry, onRedraw }, ref) {
  return (
    <div
      ref={ref}
      className="momo-guess r83-guess-error"
      role="alert"
      aria-label={CANVAS_COPY.guess.errorAriaLabel}
      data-testid="r83-guess-error"
    >
      <div className="g-head">
        <b>{CANVAS_COPY.guess.errorTitle}</b>
        <ProvenanceBadge provenance={provenance} />
      </div>
      <p className="k-text r83-guess-error__detail">{errorDetail || CANVAS_COPY.guess.errorFallbackDetail}</p>
      <div className="g-actions">
        <GuessChoiceButton
          id="r83-guess-retry"
          label={CANVAS_COPY.guess.retryCta}
          holdMs={HOLD_MS_DEFAULT}
          className="nb-btn primary"
          testId="r83-guess-retry"
          onActivate={onRetry}
        >
          {CANVAS_COPY.guess.retryCta}
        </GuessChoiceButton>
        <GuessChoiceButton
          id="r83-guess-redraw-error"
          label={CANVAS_COPY.guess.redrawErrorCta}
          holdMs={HOLD_MS_DEFAULT}
          className="nb-btn ghost"
          testId="r83-guess-redraw-error"
          onActivate={onRedraw}
        >
          {CANVAS_COPY.guess.redrawErrorCta}
        </GuessChoiceButton>
      </div>
    </div>
  );
});
