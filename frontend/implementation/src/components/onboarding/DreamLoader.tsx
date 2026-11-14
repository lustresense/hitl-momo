"use client";

import { useEffect, useState } from "react";
import {
  getHandLandmarkerStatus,
  subscribeHandLandmarkerStatus,
  warmHandLandmarker,
  type HandLandmarkerStatus,
} from "../../camera/landmarker-warmup";
import "./DreamLoader.css";

export interface DreamLoaderProps {
  modelUrl: string;
  wasmRoot?: string;
  onReady?: () => void;
  minDurationMs?: number;
}

export function DreamLoader({
  modelUrl,
  wasmRoot = "/mediapipe/wasm",
  onReady,
  minDurationMs = 1200,
}: DreamLoaderProps) {
  const [status, setStatus] = useState<HandLandmarkerStatus>(getHandLandmarkerStatus());
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(25);

  useEffect(() => {
    // Warmup NUI model in background immediately without asking for camera permission
    void warmHandLandmarker({ wasmRoot, modelUrl });

    const unsub = subscribeHandLandmarkerStatus((s) => {
      setStatus(s);
      if (s.kind === "loading") setProgress(45);
      if (s.kind === "warming") setProgress(75);
      if (s.kind === "ready" || s.kind === "failed") setProgress(100);
    });

    return unsub;
  }, [modelUrl, wasmRoot]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const isDone = status.kind === "ready" || status.kind === "failed";
    if (isDone) {
      timer = setTimeout(() => {
        setLeaving(true);
        setTimeout(() => {
          onReady?.();
        }, 500);
      }, minDurationMs);
    }
    return () => clearTimeout(timer);
  }, [status.kind, onReady, minDurationMs]);

  const handleSkip = () => {
    setLeaving(true);
    setTimeout(() => {
      onReady?.();
    }, 300);
  };

  const statusLabel =
    status.kind === "loading"
      ? "Memuat kecerdasan visual…"
      : status.kind === "warming"
        ? `Menyiapkan pengenal tangan (${status.delegate})…`
        : status.kind === "ready"
          ? "Siap bermimpi!"
          : status.kind === "failed"
            ? "Melanjutkan ke sampul…"
            : "Membuka alam imajinasi…";

  return (
    <div
      className={`dream-loader ${leaving ? "is-leaving" : ""}`}
      data-testid="dream-loader"
      role="progressbar"
      aria-label="Memuat dunia"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="dream-loader__stars" aria-hidden="true" />
      <div className="dream-loader__content">
        <div className="dream-loader__orb" aria-hidden="true" />
        <h2 className="dream-loader__title">Sketchbook Universe</h2>
        <p className="dream-loader__status" data-testid="dream-loader-status">{statusLabel}</p>
        <div className="dream-loader__bar" aria-hidden="true">
          <div className="dream-loader__progress" style={{ width: `${progress}%` }} />
        </div>
        <button
          type="button"
          className="dream-loader__skip"
          onClick={handleSkip}
          data-testid="dream-loader-skip"
        >
          Lewati
        </button>
      </div>
    </div>
  );
}
