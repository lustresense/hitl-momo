"use client";

/**
 * R22B B2.5 & §7: Guided Capture Mode Panel (`?capture=1`, default OFF).
 *
 * Guides the Owner through the exact §7 protocol (12 classes × 6 variations + 7 transition drills +
 * short left-hand round, or P2 short protocol) while tagging every recorded benchmark frame with
 * `labelSource = "DATASET_GT"`, `labelProvenance = "guided-capture-v1"`, `captureStep`, `variation`,
 * `lighting`, `subjectCode` (non-PII `P1` | `P2`), and automatic edge masking (`truthMasked = true`
 * for the first 700 ms and last 300 ms of each prompt step).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildGuidedCaptureSteps,
  GUIDED_CAPTURE_PROVENANCE,
  GUIDED_MASK_END_MS,
  GUIDED_MASK_START_MS,
  isGuidedCaptureFrameMasked,
  type ActiveCaptureFrameTag,
  type CaptureLightingCondition,
  type CaptureProtocolId,
  type CaptureSubjectCode,
} from "./guided-capture-protocol";

export interface GuidedCaptureMetaSnapshot {
  enabled: boolean;
  protocolId: CaptureProtocolId;
  subjectCode: CaptureSubjectCode;
  lighting: CaptureLightingCondition;
  provenance: typeof GUIDED_CAPTURE_PROVENANCE;
}

export function GuidedCapturePanel({
  cameraRunning,
  onTagProviderChange,
  onStepEvent,
  onMetaChange,
}: {
  cameraRunning: boolean;
  onTagProviderChange: (provider: ((nowMs: number) => ActiveCaptureFrameTag | null) | null) => void;
  onStepEvent: (
    kind: "CAPTURE_STEP_START" | "CAPTURE_STEP_END",
    detail: Record<string, string | number | boolean | null>,
  ) => void;
  onMetaChange: (meta: GuidedCaptureMetaSnapshot | null) => void;
}) {
  const [protocol, setProtocol] = useState<CaptureProtocolId>("p1-full");
  const [subjectCode, setSubjectCode] = useState<CaptureSubjectCode>("P1");
  const [lighting, setLighting] = useState<CaptureLightingCondition>("B-lampu-depan-nyala");
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  const steps = useMemo(() => buildGuidedCaptureSteps(protocol), [protocol]);
  const currentStep = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))] ?? null;

  const stepStartPerfRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;
  const subjectRef = useRef(subjectCode);
  subjectRef.current = subjectCode;
  const lightingRef = useRef(lighting);
  lightingRef.current = lighting;

  useEffect(() => {
    onMetaChange({
      enabled: true,
      protocolId: protocol,
      subjectCode,
      lighting,
      provenance: GUIDED_CAPTURE_PROVENANCE,
    });
    return () => onMetaChange(null);
  }, [protocol, subjectCode, lighting, onMetaChange]);

  const emitStepStart = useCallback(
    (idx: number) => {
      const st = steps[idx];
      if (!st) return;
      onStepEvent("CAPTURE_STEP_START", {
        stepIndex: idx,
        totalSteps: steps.length,
        captureStep: st.id,
        truthLabel: st.truthLabel,
        variation: st.variation,
        durationMs: st.durationMs,
        lighting: lightingRef.current,
        subjectCode: subjectRef.current,
        labelProvenance: GUIDED_CAPTURE_PROVENANCE,
      });
    },
    [steps, onStepEvent],
  );

  const emitStepEnd = useCallback(
    (idx: number, outcome: "completed" | "paused" | "redone" | "skipped" | "stopped") => {
      const st = steps[idx];
      if (!st) return;
      onStepEvent("CAPTURE_STEP_END", {
        stepIndex: idx,
        captureStep: st.id,
        truthLabel: st.truthLabel,
        variation: st.variation,
        outcome,
        lighting: lightingRef.current,
        subjectCode: subjectRef.current,
      });
    },
    [steps, onStepEvent],
  );

  // Expose live millisecond-exact frame tag provider to NuiLabPage without per-frame React re-renders.
  useEffect(() => {
    if (!active) {
      onTagProviderChange(null);
      return;
    }
    const provider = (nowMs: number): ActiveCaptureFrameTag | null => {
      const st = stepRef.current;
      const t0 = stepStartPerfRef.current;
      if (!activeRef.current || !st || t0 === null) return null;
      const elapsed = Math.max(0, nowMs - t0);
      return {
        truth: st.truthLabel,
        truthMasked: isGuidedCaptureFrameMasked(elapsed, st.durationMs),
        labelProvenance: GUIDED_CAPTURE_PROVENANCE,
        captureStep: st.id,
        variation: st.variation,
        lighting: lightingRef.current,
        subjectCode: subjectRef.current,
      };
    };
    onTagProviderChange(provider);
    return () => onTagProviderChange(null);
  }, [active, onTagProviderChange]);

  // Step timer & auto-advance.
  useEffect(() => {
    if (!active || !currentStep) return;
    if (stepStartPerfRef.current === null) {
      stepStartPerfRef.current = performance.now();
    }
    const id = setInterval(() => {
      const t0 = stepStartPerfRef.current;
      if (t0 === null || !stepRef.current) return;
      const el = Math.max(0, performance.now() - t0);
      if (el >= stepRef.current.durationMs) {
        emitStepEnd(stepIndex, "completed");
        setCompletedCount((c) => c + 1);
        if (stepIndex + 1 < steps.length) {
          const nextIdx = stepIndex + 1;
          stepStartPerfRef.current = performance.now();
          setStepIndex(nextIdx);
          setElapsedMs(0);
          emitStepStart(nextIdx);
        } else {
          stepStartPerfRef.current = null;
          setActive(false);
          setElapsedMs(stepRef.current.durationMs);
        }
      } else {
        setElapsedMs(el);
      }
    }, 100);
    return () => clearInterval(id);
  }, [active, currentStep, stepIndex, steps.length, emitStepEnd, emitStepStart]);

  // Pause automatically if camera turns off.
  useEffect(() => {
    if (!cameraRunning && active) {
      emitStepEnd(stepIndex, "stopped");
      stepStartPerfRef.current = null;
      setActive(false);
      setElapsedMs(0);
    }
  }, [cameraRunning, active, stepIndex, emitStepEnd]);

  const handleStartOrPause = () => {
    if (!currentStep) return;
    if (active) {
      emitStepEnd(stepIndex, "paused");
      stepStartPerfRef.current = null;
      setActive(false);
      return;
    }
    stepStartPerfRef.current = performance.now();
    setElapsedMs(0);
    setActive(true);
    emitStepStart(stepIndex);
  };

  const handleRedoStep = () => {
    if (!currentStep) return;
    if (active) emitStepEnd(stepIndex, "redone");
    stepStartPerfRef.current = performance.now();
    setElapsedMs(0);
    setActive(true);
    emitStepStart(stepIndex);
  };

  const handleJump = (delta: number) => {
    const nextIdx = Math.max(0, Math.min(steps.length - 1, stepIndex + delta));
    if (nextIdx === stepIndex) return;
    if (active) emitStepEnd(stepIndex, "skipped");
    setStepIndex(nextIdx);
    setElapsedMs(0);
    if (active) {
      stepStartPerfRef.current = performance.now();
      emitStepStart(nextIdx);
    } else {
      stepStartPerfRef.current = null;
    }
  };

  const handleProtocolSwitch = (nextProto: CaptureProtocolId) => {
    if (active) {
      emitStepEnd(stepIndex, "stopped");
      setActive(false);
      stepStartPerfRef.current = null;
    }
    setProtocol(nextProto);
    setStepIndex(0);
    setElapsedMs(0);
    setCompletedCount(0);
  };

  const remainingSec = currentStep ? Math.max(0, (currentStep.durationMs - elapsedMs) / 1000) : 0;
  const maskedNow = currentStep ? isGuidedCaptureFrameMasked(elapsedMs, currentStep.durationMs) : true;
  const pct = currentStep ? Math.min(100, Math.round((elapsedMs / Math.max(1, currentStep.durationMs)) * 100)) : 0;

  return (
    <section
      className="nui-lab__panel nui-lab__dev-panel nui-lab__capture-panel"
      data-testid="guided-capture-panel"
      aria-label="Mode Pengambilan Data Terpandu (Guided Capture)"
    >
      <div className="nui-lab__info-head">
        <h3>Guided Capture Dataset GT (?capture=1)</h3>
        <span className={`nui-lab__pill ${active ? (maskedNow ? "nui-lab__pill--warn" : "nui-lab__pill--ok") : ""}`}>
          {active
            ? maskedNow
              ? `MASKED (awal ${GUIDED_MASK_START_MS}ms / akhir ${GUIDED_MASK_END_MS}ms)`
              : "REKAM DATASET_GT AKTIF"
            : "SIAP / JEDA"}
        </span>
      </div>

      <div className="nui-lab__capture-meta-bar">
        <div className="nui-lab__row">
          <span className="nui-lab__muted">Subjek (non-PII):</span>
          {(["P1", "P2"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className="nui-lab__button nui-lab__button--compact"
              aria-pressed={subjectCode === code}
              disabled={active}
              onClick={() => setSubjectCode(code)}
            >
              {code}
            </button>
          ))}
        </div>

        <div className="nui-lab__row">
          <span className="nui-lab__muted">Pencahayaan:</span>
          {(
            [
              { id: "A-lampu-depan-mati", label: "A: Lampu depan mati" },
              { id: "B-lampu-depan-nyala", label: "B: Lampu depan nyala" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="nui-lab__button nui-lab__button--compact"
              aria-pressed={lighting === opt.id}
              disabled={active}
              onClick={() => setLighting(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="nui-lab__row">
          <span className="nui-lab__muted">Protokol:</span>
          <button
            type="button"
            className="nui-lab__button nui-lab__button--compact"
            aria-pressed={protocol === "p1-full"}
            disabled={active}
            onClick={() => handleProtocolSwitch("p1-full")}
          >
            P1 Penuh (12×6 + 7 drill + kiri)
          </button>
          <button
            type="button"
            className="nui-lab__button nui-lab__button--compact"
            aria-pressed={protocol === "p2-short"}
            disabled={active}
            onClick={() => handleProtocolSwitch("p2-short")}
          >
            P2 Ringkas (12×3 + 7 drill)
          </button>
          <button
            type="button"
            className="nui-lab__button nui-lab__button--compact"
            aria-pressed={protocol === "p2-mini"}
            disabled={active}
            onClick={() => handleProtocolSwitch("p2-mini")}
          >
            P2 Mini (±4 menit, 19 langkah)
          </button>
        </div>
      </div>

      {currentStep && (
        <div className="nui-lab__capture-prompt" data-testid="guided-capture-prompt" data-masked={maskedNow ? "true" : "false"}>
          <div className="nui-lab__info-head">
            <span className="nui-lab__eyebrow">
              LANGKAH {stepIndex + 1} / {steps.length} · {currentStep.phase.toUpperCase()} · LABEL{" "}
              <code>{currentStep.truthLabel}</code>
            </span>
            <strong className="nui-lab__capture-countdown" data-testid="guided-capture-countdown">
              {remainingSec.toFixed(1)} dtk
            </strong>
          </div>
          <div className="nui-lab__capture-title">{currentStep.title}</div>
          <div className="nui-lab__capture-variation">Variasi: {currentStep.variationLabel}</div>
          <p className="nui-lab__status">{currentStep.instruction}</p>
          <div
            className="nui-lab__progress"
            role="progressbar"
            aria-label="Progres langkah pengambilan data"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="nui-lab__progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="nui-lab__row">
        <button
          type="button"
          className="nui-lab__button nui-lab__button--primary nui-lab__button--compact"
          data-testid="guided-capture-start-btn"
          disabled={!cameraRunning || !currentStep}
          onClick={handleStartOrPause}
        >
          {active ? "Jeda langkah" : "Mulai rekam langkah"}
        </button>
        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
          data-testid="guided-capture-redo-btn"
          disabled={!cameraRunning || !currentStep}
          onClick={handleRedoStep}
        >
          Ulangi langkah
        </button>
        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
          disabled={stepIndex <= 0}
          onClick={() => handleJump(-1)}
        >
          ← Sebelumnya
        </button>
        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
          disabled={stepIndex >= steps.length - 1}
          onClick={() => handleJump(1)}
        >
          Berikutnya →
        </button>
      </div>

      <p className="nui-lab__muted">
        Selesai: {completedCount} langkah · Provenance: <code>{GUIDED_CAPTURE_PROVENANCE}</code> ·{" "}
        {cameraRunning
          ? "Semua frame saat aktif ditandai DATASET_GT (awal 700 ms & akhir 300 ms otomatis masked)."
          : "Nyalakan kamera terlebih dahulu untuk mulai merekam."}
      </p>
    </section>
  );
}
