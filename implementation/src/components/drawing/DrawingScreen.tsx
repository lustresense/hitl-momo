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
  surfaceOut: { current: DrawingSurface | null };
  onSubmit(): void;
  onExit(): void;
}

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

    if (process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__skbTestHooks as Record<string, unknown> | undefined) ?? {};
      w.__skbTestHooks = { ...existing, surface };
    }

    const ro = new ResizeObserver(() => surface.resizeForDpr());
    ro.observe(canvas);
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
    <section id="screen-drawing" className="screen drawing-screen-svg" aria-label="Menggambar">
      {/* Top Left: Momo Avatar & Speech Bubble + Level Tag */}
      <div className="drawing-top-bar">
        <MomoBubble moment={momoMoment} />
        <div className="drawing-level-tag">
          <h2 className="level-title-badge">{level.title}</h2>
          <span className="level-task-text">{level.task}</span>
        </div>
      </div>

      {/* Full-bleed drawing canvas */}
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="draw-canvas"
        aria-label="Kanvas menggambar"
        data-testid="draw-canvas"
      />

      {/* Bottom edge docked trio */}
      <div className="drawing-dock" role="region" aria-label="Kontrol Menggambar">
        {/* Module 1 (Left): Actions Panel */}
        <div className="dock-module dock-actions">
          <div className="dock-module-title">Aksi Gambar</div>
          <div className="actions action-bar">
            <button type="button" className="btn btn-primary btn-submit-momo" onClick={onSubmit}>
              Kirim ke Momo
            </button>
            <button type="button" className="btn" onClick={() => surfaceOut.current?.clear()}>
              Hapus Gambar
            </button>
            <button type="button" className="btn" onClick={() => surfaceOut.current?.undo()}>
              Undo Goresan
            </button>
            <button type="button" className="btn btn-ghost btn-exit" onClick={onExit}>
              Keluar Level
            </button>
          </div>
          <p id="drawing-feedback" className="feedback" role="alert">
            {feedback === "empty-drawing" ? "Gambar masih kosong — gambar sesuatu dulu." : ""}
          </p>
        </div>

        {/* Module 2 (Center): Camera / Hand Card */}
        <div className="dock-module dock-camera">
          <div className="camera-header-row">
            <span className="camera-title-label">Nyalakan Kamera</span>
            <div className="mode-switch" role="group" aria-label="Mode input gambar">
              <button
                type="button"
                className={`btn btn-small mode-btn ${mode === "pointer" ? "active btn-primary" : ""}`}
                aria-pressed={mode === "pointer"}
                onClick={() => void switchMode("pointer")}
              >
                Pointer
              </button>
              <button
                type="button"
                className={`btn btn-small mode-btn ${mode === "hand" ? "active btn-primary" : ""}`}
                aria-pressed={mode === "hand"}
                onClick={() => void switchMode("hand")}
              >
                Tangan
              </button>
            </div>
          </div>

          <div className="camera-viewport-box" data-active={mode === "hand"}>
            <video ref={videoRef} className="cam-preview" playsInline muted aria-label="Pratinjau kamera" />
            {mode !== "hand" && (
              <div className="camera-off-placeholder">
                <span>Mode Pointer Aktif</span>
              </div>
            )}
          </div>

          <div className="camera-chip-status">
            <span className={`chip ${handStatus.kind === "error" ? "chip-warn" : ""}`} role="status">
              {cameraChip}
            </span>
          </div>
        </div>

        {/* Module 3 (Right): Tool Palette (HUD / Gesture Legend) */}
        <div className="dock-module dock-tools" aria-label="Panduan Gestur dan Alat">
          <div className="dock-module-title">Panduan Alat (HUD)</div>
          <div className="tool-grid" role="status" aria-label="Indikator Alat">
            <div className="tool-btn active" title="Pena: Aktif (Cubit untuk menggambar)">✏️</div>
            <div className="tool-btn disabled-hud" title="Penghapus: Hapus lewat tombol aksi di kiri">🧹</div>
            <div className="tool-btn disabled-hud" title="Undo: Batalkan lewat tombol aksi di kiri">↩️</div>
            <div className="tool-btn disabled-hud" title="Redo: Belum tersedia">↪️</div>
            <div className="tool-btn swatch" style={{ background: "#23211d" }} title="Tinta Hitam (Default)" />
            <div className="tool-btn swatch disabled-hud" style={{ background: "#ef7a37", opacity: 0.4 }} title="Warna Oranye (Provisional)" />
            <div className="tool-btn swatch disabled-hud" style={{ background: "#4a8c1f", opacity: 0.4 }} title="Warna Hijau (Provisional)" />
            <div className="tool-btn swatch disabled-hud" style={{ background: "#a8c8d8", opacity: 0.4 }} title="Warna Biru (Provisional)" />
          </div>
        </div>
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

function surfaceRefSet(out: { current: DrawingSurface | null }, value: DrawingSurface | null): void {
  out.current = value;
}
