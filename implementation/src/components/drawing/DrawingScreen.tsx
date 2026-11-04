"use client";
import { useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { MomoMoment } from "@/src/domain/momo-script";
import type { PredictionResult } from "@/src/domain/types";
import type { MissionConfig } from "@/src/domain/mission-config";
import { MissionBriefing } from "../mission/MissionBriefing";
import { DrawingSurface } from "@/src/input";
import type { InputModeId } from "@/src/input/types";
import { MomoBubble } from "../momo/MomoBubble";
import { Top3PredictionPopup } from "../prediction/Top3PredictionPopup";
import { Icon } from "../shared/Icon";

export interface DrawingScreenProps {
  level: LevelDefinition;
  initialMode: InputModeId;
  feedback: string | null;
  surfaceOut: { current: DrawingSurface | null };
  onSubmit(chosenPrediction: string | null): void;
  onExit(): void;
  active?: boolean;
  phase?: "drawing" | "predicting" | "evaluating" | "prediction-error";
  prediction?: PredictionResult | null;
  errorDetail?: string | null;
  predictionMode?: "mock" | "partner";
  onAccept?: () => void;
  onCorrect?: (rank: 2 | 3) => void;
  onOverride?: (label: string) => void;
  onRedraw?: () => void;
  onRetry?: () => void;
  missionConfig?: MissionConfig;
  missionOpen?: boolean;
  onOpenMission?: () => void;
  onCloseMission?: () => void;
}

export function DrawingScreen({
  level,
  initialMode,
  feedback,
  surfaceOut,
  onSubmit,
  onExit,
  active = true,
  phase = "drawing",
  prediction = null,
  errorDetail = null,
  predictionMode = "mock",
  onAccept = () => void 0,
  onCorrect = () => void 0,
  onOverride = () => void 0,
  onRedraw = () => void 0,
  onRetry = () => void 0,
  missionConfig,
  missionOpen = false,
  onOpenMission = () => void 0,
  onCloseMission = () => void 0,
}: DrawingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inputMode, setInputMode] = useState<InputModeId>(initialMode);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const video = document.querySelector<HTMLVideoElement>(".global-camera-host .camera-video");

    const surface = new DrawingSurface(canvas, video, {
      initialMode,
      onInkChange: setHasInk,
    });
    surfaceRefSet(surfaceOut, surface);

    if (process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__skbTestHooks as Record<string, unknown> | undefined) ?? {};
      w.__skbTestHooks = { ...existing, surface };
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => surface.resizeForDpr());
      ro.observe(canvas);
    }
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => surface.resizeForDpr());
    }

    return () => {
      ro?.disconnect();
      if (process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
        const w = window as unknown as Record<string, unknown>;
        delete w.__skbTestHooks;
      }
      surface.dispose();
      surfaceRefSet(surfaceOut, null);
    };
  }, [initialMode, surfaceOut]);

  async function switchMode(next: InputModeId) {
    const surface = surfaceOut.current;
    if (!surface) return;
    setInputMode(next);
    await surface.setMode(next);
  }

  useEffect(() => {
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<InputModeId>).detail;
      if (active && (next === "pointer" || next === "hand")) {
        setInputMode(next);
        void surfaceOut.current?.setMode(next);
      }
    };
    window.addEventListener("drawing-input-mode", onMode);
    return () => window.removeEventListener("drawing-input-mode", onMode);
  }, [surfaceOut, active]);

  useEffect(() => {
    if (!active) void surfaceOut.current?.setMode("pointer");
  }, [active, surfaceOut]);

  const isProbe = phase !== "drawing";
  const isDrawingFlow = active || isProbe;
  const momoMoment: MomoMoment = feedback === "empty-drawing" ? "drawing-empty"
    : phase === "predicting" ? "predicting"
    : phase === "evaluating" ? "top3-compare"
    : phase === "prediction-error" ? "provider-error" : "drawing-cue";

  return (
    <section
      hidden={!isDrawingFlow}
      style={{ display: isDrawingFlow ? undefined : "none" }}
      id="screen-drawing"
      className="screen drawing-screen-svg"
      aria-label="Menggambar"
      data-drawing-active={active ? "true" : "false"}
    >
      <div className="drawing-bar">
        <button type="button" className="btn icon-btn drawing-exit" aria-label="Keluar level" title="Keluar level" onClick={onExit}>
          <Icon name="back" size={22} />
        </button>
        <span className="chip level-chip">Level {level.stage}</span>
        {missionConfig && (
          <button type="button" className="btn btn-small" aria-label="Petunjuk Misi" onClick={onOpenMission}>
            <Icon name="help" size={20} />
            Misi
          </button>
        )}
      </div>
      {missionConfig && (
        <MissionBriefing isOpen={missionOpen} config={missionConfig} onStartDrawing={onCloseMission} onClose={onCloseMission} />
      )}

      <div
        role="toolbar"
        aria-label="Alat menggambar"
        className="drawing-tools-right"
        style={{ display: phase === "drawing" ? undefined : "none" }}
      >
        <button type="button" className="tool-btn" aria-pressed="true" aria-label="Pensil, sedang dipakai" title="Pensil: cubit untuk menggambar">
          <Icon name="pencil" size={24} />
          <span>Pensil</span>
        </button>
        <button type="button" className="tool-btn" aria-label="Hapus semua goresan" title="Hapus semua" onClick={() => surfaceOut.current?.clear()}>
          <Icon name="trash" size={24} />
          <span>Hapus</span>
        </button>
        <button type="button" className="tool-btn undo-tool" aria-label="Mundur satu goresan" title="Mundur" onClick={() => surfaceOut.current?.undo()}>
          <Icon name="undo" size={24} />
          <span>Mundur</span>
        </button>
        <button type="button" className="tool-btn redo-tool" aria-label="Maju satu goresan" title="Maju" onClick={() => surfaceOut.current?.redo()}>
          <Icon name="redo" size={24} />
          <span>Maju</span>
        </button>
      </div>

      <div className="drawing-momo-companion" data-phase={phase}>
        <MomoBubble moment={momoMoment} />
        {phase === "predicting" && <div className="momo-loader" aria-hidden="true" />}
      </div>

      {isProbe && (
        <Top3PredictionPopup
          phase={phase}
          prediction={prediction}
          errorDetail={errorDetail}
          predictionMode={predictionMode}
          level={level}
          onAccept={onAccept}
          onCorrect={onCorrect}
          onOverride={onOverride}
          onRedraw={onRedraw}
          onRetry={onRetry}
        />
      )}

      <div className="drawing-feedback">
        <p id="drawing-feedback" className="feedback" role="alert">
          {feedback === "empty-drawing" ? "Kanvas masih kosong. Gambar dulu." : ""}
        </p>
      </div>

      <div
        className="drawing-submit-controls"
        style={{
          opacity: phase === "drawing" ? 1 : 0.4,
          pointerEvents: phase === "drawing" ? "auto" : "none",
        }}
      >
        <div className="segmented" role="group" aria-label="Cara menggambar">
          <button type="button" aria-pressed={inputMode === "pointer"} onClick={() => void switchMode("pointer")}>
            <Icon name="mouse" size={18} />
            Mouse
          </button>
          <button type="button" aria-pressed={inputMode === "hand"} onClick={() => void switchMode("hand")}>
            <Icon name="camera" size={18} />
            Kamera
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg btn-submit-momo"
          data-testid="btn-submit-drawing"
          disabled={!hasInk || !active || phase !== "drawing"}
          onClick={() => onSubmit(null)}
        >
          Tebak gambarku
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="draw-canvas"
        style={{ pointerEvents: active ? "auto" : "none" }}
        aria-label="Kanvas menggambar"
        data-testid="draw-canvas"
      />
    </section>
  );
}

function surfaceRefSet(out: { current: DrawingSurface | null }, value: DrawingSurface | null): void {
  out.current = value;
}
