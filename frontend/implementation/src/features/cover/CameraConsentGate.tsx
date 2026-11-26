"use client";

import type { RefObject } from "react";
import { COVER_GATE_COPY } from "@/src/domain/copy/cover";
import type { CoverCameraStatus, GateNudge, GateState } from "./cover-machine";

export interface CameraConsentGateProps {
  readonly gateState: GateState;
  readonly gateNudge: GateNudge;
  readonly cameraStatus: CoverCameraStatus;
  readonly cameraError: string | null;
  readonly visible: boolean;
  readonly gateRef?: RefObject<HTMLDivElement>;
  readonly onToggleCheck: (checked: boolean) => void;
  readonly onConfirmGo: () => void;
  readonly onFallbackContinue: () => void;
}

/**
 * Gerbang izin kamera + mik (`proto-html/r83/index.html:500-506, 824-886`).
 * Chrome murni (`[data-nui-off]`): mouse/sentuh tetap bekerja sebelum NUI aktif,
 * serta menyediakan tombol fallback tanpa dead-end saat kamera ditolak/tidak tersedia.
 */
export function CameraConsentGate({
  gateState,
  gateNudge,
  cameraStatus,
  cameraError,
  visible,
  gateRef,
  onToggleCheck,
  onConfirmGo,
  onFallbackContinue,
}: CameraConsentGateProps) {
  const cameraFailed = cameraStatus === "denied" || cameraStatus === "unavailable";
  const mumbleText = cameraFailed
    ? `${cameraError ? `${cameraError} ` : ""}${COVER_GATE_COPY.cameraDeniedMumble}`
    : gateNudge === "unchecked"
      ? COVER_GATE_COPY.flashUnchecked
      : gateNudge === "need-go"
        ? COVER_GATE_COPY.flashNeedContinue
        : COVER_GATE_COPY.mumbleLines[gateState];

  return (
    <div
      ref={gateRef}
      id="gate"
      className={visible ? "show" : undefined}
      role="group"
      aria-label={COVER_GATE_COPY.gateAriaLabel}
      aria-hidden={!visible || undefined}
      data-state={String(gateState)}
      data-side="right"
      data-nui-off="true"
      data-testid="r83-camera-gate"
    >
      <div className="speaker">{COVER_GATE_COPY.speakerName}</div>
      <div id="gate-mumble" aria-live="polite" data-testid="r83-gate-mumble">
        {mumbleText}
      </div>

      <div className="gate-note-collapse" aria-hidden={gateState >= 2 || undefined}>
        <div className="gate-note-collapse__inner">
          <div className="gate-note">
            <div className="gate-note__title">{COVER_GATE_COPY.noteTitle}</div>
            <p>{COVER_GATE_COPY.noteBody}</p>
          </div>
        </div>
      </div>

      <label className="gate-check" data-nui-off="true">
        <input
          type="checkbox"
          id="gate-ok"
          data-testid="r83-gate-checkbox"
          checked={gateState >= 1}
          disabled={gateState >= 2}
          onChange={(e) => onToggleCheck(e.target.checked)}
        />
        <span className="box" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#111"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span>{COVER_GATE_COPY.checkLabel}</span>
      </label>

      <button
        type="button"
        id="gate-go"
        className="nb-btn gate-go"
        data-nui-off="true"
        data-testid="r83-gate-go"
        disabled={gateState !== 1}
        onClick={onConfirmGo}
      >
        {gateState >= 2 ? COVER_GATE_COPY.doneLabel : COVER_GATE_COPY.goLabel}
      </button>

      {cameraFailed ? (
        <button
          type="button"
          className="nb-btn primary gate-fallback"
          data-nui-off="true"
          data-testid="r83-camera-fallback-btn"
          onClick={onFallbackContinue}
        >
          {COVER_GATE_COPY.cameraFallbackButton}
        </button>
      ) : null}
    </div>
  );
}
