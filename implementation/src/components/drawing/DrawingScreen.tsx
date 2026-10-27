"use client";
import { useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { MomoMoment } from "@/src/domain/momo-script";
import { DrawingSurface } from "@/src/input";
import type { InputModeId } from "@/src/input/types";
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
  onSubmit(chosenPrediction: string | null): void;
  onExit(): void;
  active?: boolean;
}

export function DrawingScreen({ level, initialMode, feedback, surfaceOut, onSubmit, onExit, active = true }: DrawingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inputMode, setInputMode] = useState<InputModeId>(initialMode);
  const [hasInk, setHasInk] = useState(false);
  // Use catalog for allowed objects; show all catalog items as drawable hints
  const catalogItems = level.catalog ?? level.vocabulary.map(v => ({ labelId: v, displayName: v }));

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
      if (active && (next === "pointer" || next === "hand")) { setInputMode(next); void surfaceOut.current?.setMode(next); }
    };
    window.addEventListener("drawing-input-mode", onMode);
    return () => window.removeEventListener("drawing-input-mode", onMode);
  }, [surfaceOut, active]);


  useEffect(() => {
    // Hidden canvas retains its strokes; only DRAW owns the tracking driver.
    if (!active) void surfaceOut.current?.setMode("pointer");
  }, [active, surfaceOut]);

  const momoMoment: MomoMoment = feedback === "empty-drawing" ? "drawing-empty" : "drawing-cue";

  return (
    <section hidden={!active} style={{ display: active ? undefined : "none" }} id="screen-drawing" className="screen drawing-screen-svg" aria-label="Menggambar">
      <header className="drawing-top-bar">
        <div className="predict-choosable-box" aria-label="Katalog objek">
          <strong className="predict-choosable-title">Katalog DEMO · placeholder</strong>
          <p>Contoh objek untuk digambar, bukan hasil prediksi. Manifest model partner belum tersedia.</p>
          <div className="predict-choosable-candidates" role="list" aria-label="Objek yang boleh digambar">
            {catalogItems.map(({ labelId, displayName, icon }) => <span role="listitem" key={labelId}>{icon} {displayName} · </span>)}
          </div>
        </div>
      </header>

      <aside className="drawing-tools-left" role="toolbar" aria-label="Alat menggambar">
        <button
          type="button"
          className="tool-btn tool-btn-action active"
          aria-label="Gambar (Gesture Pinch)"
          title="Gambar (Gesture Pinch)"
        >
          <svg className="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 13v-2.5a1.5 1.5 0 0 1 3 0v1" />
            <path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5" />
            <path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5" />
            <path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
            <circle cx="9.5" cy="7.5" r="2.5" />
          </svg>
          <span className="tool-label">Gambar</span>
        </button>

        <button
          type="button"
          className="tool-btn tool-btn-action"
          aria-label="Hapus (Gesture Genggam)"
          title="Hapus (Gesture Genggam)"
          onClick={() => surfaceOut.current?.clear()}
        >
          <svg className="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 11v-3.5a1.5 1.5 0 0 1 3 0v2.5" />
            <path d="M11 9.5v-3a1.5 1.5 0 0 1 3 0v3.5" />
            <path d="M14 7.5a1.5 1.5 0 0 1 3 0v2.5" />
            <path d="M17 9.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
          </svg>
          <span className="tool-label">Hapus</span>
        </button>

        <button
          type="button"
          className="tool-btn tool-btn-action undo-tool"
          aria-label="Undo Goresan"
          title="Mundur (Gesture 2 Jari)"
          onClick={() => surfaceOut.current?.undo()}
        >
          <svg className="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5" />
            <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
            <path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5" />
            <path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
          </svg>
          <span className="tool-label">Mundur</span>
        </button>

        <button
          type="button"
          className="tool-btn tool-btn-action redo-tool"
          aria-label="Maju (Gesture 3 Jari)"
          title="Maju (Gesture 3 Jari)"
          onClick={() => surfaceOut.current?.redo()}
        >
          <svg className="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5" />
            <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
            <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
            <path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
          </svg>
          <span className="tool-label">Maju</span>
        </button>
      </aside>

      <button type="button" className="btn btn-small btn-exit drawing-exit" onClick={onExit}>Keluar Level</button>
      <div className="drawing-momo-top-right"><MomoBubble moment={momoMoment} /></div>
      <div className="drawing-feedback">
        <p id="drawing-feedback" className="feedback" role="alert">
          {feedback === "empty-drawing" ? "Gambar masih kosong — gambar sesuatu dulu." : ""}
        </p>
      </div>

      <div className="drawing-submit-controls" style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",zIndex:20,display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" className="btn" onClick={() => void switchMode(inputMode === "hand" ? "pointer" : "hand")}>
          {inputMode === "hand" ? "Kamera DRAW · coba pointer" : "FALLBACK pointer · coba kamera"}
        </button>
        <button type="button" className="btn btn-primary" data-testid="btn-submit-drawing" disabled={!hasInk || !active} onClick={() => onSubmit(null)}>Tebak Gambarku</button>
      </div>
      <style jsx>{`
        @media(max-width:600px){
          .drawing-top-bar{left:12px!important;right:12px!important;top:8px!important;width:auto!important;max-width:none!important;}
          .predict-choosable-box{padding:8px!important;font-size:12px!important;}
          .predict-choosable-box p{margin:4px 0!important;}
          .drawing-momo-top-right{display:none!important;}
          .drawing-submit-controls{left:16px!important;right:16px!important;bottom:100px!important;transform:none!important;width:auto!important;justify-content:center!important;}
          .drawing-submit-controls button{font-size:12px!important;padding:10px!important;}
        }
      `}</style>
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="draw-canvas"
        aria-label="Kanvas menggambar Jembatan Pertama"
        data-testid="draw-canvas"
      />
    </section>
  );
}

function surfaceRefSet(out: { current: DrawingSurface | null }, value: DrawingSurface | null): void {
  out.current = value;
}
