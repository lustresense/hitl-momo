"use client";
import { useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { MomoMoment } from "@/src/domain/momo-script";
import { DrawingSurface } from "@/src/input";
import type { HandInputStatus, InputModeId } from "@/src/input/types";
import { MomoBubble } from "../momo/MomoBubble";

const REASONS: Record<string, string> = {
  "permission-denied": "Izin kamera ditolak — kembali ke mode pointer.",
  "camera-unavailable": "Kamera tidak tersedia — kembali ke mode pointer.",
  "model-error": "Aset model MediaPipe gagal dimuat — kembali ke mode pointer.",
  "tracker-error": "Pelacak tangan bermasalah — kembali ke mode pointer.",
};

export interface DrawingScreenProps {
  level: LevelDefinition;
  initialMode: InputModeId;
  feedback: string | null;
  /** Parent-owned ref so the app can extract normalized input on submit. */
  surfaceOut: { current: DrawingSurface | null };
  onSubmit(): void;
  onExit(): void;
}

/**
 * TASK 05/06 — Drawing workspace: pointer/touch default, MediaPipe hand input
 * (provisional pinch gesture), unified stroke store, clear/undo/submit,
 * input-mode indicator + camera state chip. Camera stops when leaving.
 */
export function DrawingScreen({ level, initialMode, feedback, surfaceOut, onSubmit, onExit }: DrawingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<InputModeId>(initialMode);
  const [handStatus, setHandStatus] = useState<HandInputStatus>({ kind: "idle" });

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const surface = new DrawingSurface(canvas, video, {
      initialMode,
      onStatusChange: (s) => setHandStatus(s),
    });
    surfaceRefSet(surfaceOut, surface);

    // Expose hooks for automated E2E only (never in production builds).
    if (process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__skbTestHooks as Record<string, unknown> | undefined) ?? {};
      w.__skbTestHooks = { ...existing, surface };
    }

    const ro = new ResizeObserver(() => surface.resizeForDpr());
    ro.observe(canvas);
    // Initial layout may settle after mount.
    requestAnimationFrame(() => surface.resizeForDpr());

    return () => {
      ro.disconnect();
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
    setMode(next);
    await surface.setMode(next);
  }

  const cameraChip = cameraChipText(mode, handStatus);

  let momoMoment: MomoMoment = feedback === "empty-drawing" ? "drawing-empty" : "drawing-cue";
  if (mode === "hand" && handStatus.kind === "error") momoMoment = "provider-error";

  return (
    <section id="screen-drawing" className="screen" aria-label="Menggambar">
      <div className="screen-head">
        <h2>{level.title}</h2>
        <p className="lead">{level.task}</p>
      </div>

      <div className="draw-layout">
        <div className="canvas-wrap">
          <div className="video-wrap" data-active={mode === "hand"}>
            <video ref={videoRef} className="cam-preview" playsInline muted aria-label="Pratinjau kamera" />
          </div>
          <canvas
            ref={canvasRef}
            width={960}
            height={720}
            className="draw-canvas"
            aria-label="Kanvas menggambar"
            data-testid="draw-canvas"
          />
        </div>

        <aside className="side-panel">
          <MomoBubble moment={momoMoment} />

          {/* Input-mode switch (TASK 05 fallback preserved both ways). */}
          <div className="mode-switch" role="group" aria-label="Mode input gambar">
            <button
              type="button"
              className={`btn btn-small ${mode === "pointer" ? "btn-primary" : ""}`}
              aria-pressed={mode === "pointer"}
              onClick={() => void switchMode("pointer")}
            >
              Pointer / Sentuh
            </button>
            <button
              type="button"
              className={`btn btn-small ${mode === "hand" ? "btn-primary" : ""}`}
              aria-pressed={mode === "hand"}
              onClick={() => void switchMode("hand")}
            >
              Tangan (MediaPipe)
            </button>
          </div>
          <span className={`chip ${handStatus.kind === "error" ? "chip-warn" : ""}`} role="status">
            {cameraChip}
          </span>

          <div className="actions">
            <button type="button" className="btn" onClick={() => surfaceOut.current?.clear()}>
              Hapus Gambar
            </button>
            <button type="button" className="btn" onClick={() => surfaceOut.current?.undo()}>
              Undo Goresan
            </button>
            <button type="button" className="btn btn-primary" onClick={onSubmit}>
              Kirim ke Momo
            </button>
            <button type="button" className="btn btn-ghost" onClick={onExit}>
              Keluar Level
            </button>
          </div>
          <p id="drawing-feedback" className="feedback" role="alert">
            {feedback === "empty-drawing" ? "Gambar masih kosong — gambar sesuatu dulu." : ""}
          </p>
        </aside>
      </div>
    </section>
  );
}

function cameraChipText(mode: InputModeId, s: HandInputStatus): string {
  if (mode === "pointer") return "Input: pointer/sentuh aktif";
  switch (s.kind) {
    case "initializing":
      return "Menyiapkan kamera & model…";
    case "ready":
      return "Kamera siap · cubit jempol-telunjuk untuk menggambar (provisional)";
    case "drawing":
      return "Menggambar… (cubit tertutup)";
    case "no-hand":
      return "Tangan tidak terdeteksi";
    case "tracking-lost":
      return "Pelacakan hilang — goresan ditutup otomatis";
    case "error":
      return REASONS[s.reason] ?? "Kamera gagal — kembali ke mode pointer.";
    default:
      return "";
  }
}

/** Small indirection so the ref stays a stable object identity for effects. */
function surfaceRefSet(
  out: { current: DrawingSurface | null },
  value: DrawingSurface | null,
): void {
  out.current = value;
}
