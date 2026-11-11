"use client";
/**
 * The "aku mengerti" thumb of one tutorial card (R4). Locked until the card is eligible: the ring stays visible,
 * greyed out with a lock, and fills slowly while the student reads (the read timer). Unlocked, it is the shared
 * ThumbConfirm, which keeps its own latch so a thumb carried over from the card before cannot confirm this one.
 *
 * The locked and unlocked faces share one test id, so the E2E harness finds the same control in both states.
 */
import { useEffect, useState } from "react";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import { Icon } from "../ui/Icon";
import { CARD_READ_MS } from "./tutorial-card-gate";
import "./TutorialThumb.css";

export interface TutorialThumbProps {
  testId: string;
  holdMs: 1000 | 2000;
  /** Caption under the thumb when it is unlocked, e.g. "Lanjut". */
  label: string;
  locked: boolean;
  /** Caption while locked, e.g. "Baca dulu, ya". */
  lockedLabel: string;
  /** When the read time started (Date.now()), or null before it starts. Drives the locked ring. */
  readStartedAt: number | null;
  /** The drawing surface's thumbs-up, so this ring does not start a second tracker. */
  externalThumbUp?: boolean;
  onConfirm(): void;
}

const R = 30;
const CIRC = 2 * Math.PI * R;

export function TutorialThumb({ testId, holdMs, label, locked, lockedLabel, readStartedAt, externalThumbUp, onConfirm }: TutorialThumbProps) {
  const progress = useReadProgress(locked ? readStartedAt : null);
  if (!locked) {
    return (
      <div className="tut-thumb-slot" data-locked="false">
        <ThumbConfirm holdMs={holdMs} label={label} testId={testId} externalThumbUp={externalThumbUp} onConfirm={onConfirm} className="tut-thumb" />
      </div>
    );
  }
  const pct = Math.round(progress * 100);
  return (
    <div className="tut-thumb-slot" data-locked="true">
      <div
        className="thumb-confirm tut-thumb tut-thumb--locked"
        data-testid={testId}
        data-locked="true"
        data-hold-ms={holdMs}
        data-progress={pct}
        role="progressbar"
        aria-label={lockedLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span className="thumb-confirm__face">
          <svg className="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true">
            <circle className="thumb-confirm__track" cx="36" cy="36" r={R} />
            <circle className="thumb-confirm__fill" cx="36" cy="36" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} transform="rotate(-90 36 36)" />
          </svg>
          <span className="thumb-confirm__thumb">
            <Icon name="lock" size={28} />
          </span>
        </span>
        <span className="thumb-confirm__label">{lockedLabel}</span>
      </div>
    </div>
  );
}

/** 0..1 of the read time that has passed since `startedAt`; 0 when it has not started. */
function useReadProgress(startedAt: number | null): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (startedAt === null) {
      setProgress(0);
      return;
    }
    let frame = 0;
    const tick = () => {
      const next = Math.min(1, Math.max(0, (Date.now() - startedAt) / CARD_READ_MS));
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);
  return progress;
}
