"use client";
import { useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import type { HumanDecision, ObjectBehavior } from "@/src/domain/types";
import type { MomoMoment } from "@/src/domain/momo-script";
import { MomoBubble } from "../momo/MomoBubble";

/**
 * TASK 04/13 — KAPLAY consequence stage (client-only) + outcome overlay.
 * - Single controlled KAPLAY instance; destroyed on unmount/phase change.
 * - Init failure surfaces a retryable error instead of crashing the app.
 */
export interface GameStageProps {
  level: LevelDefinition;
  behavior: ObjectBehavior;
  decision: HumanDecision;
  onOutcomeReported(outcome: "success" | "fail"): void;
  onRedraw(): void;
  /** Called when student confirms object placement (PLACING phase). */
  onCommitPlacement?(): void;
  /** Current phase from FlowController. */
  phase: "placing" | "gameplay" | "complete";
}

export function GameStage({ level, behavior, decision, onOutcomeReported, onRedraw }: GameStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [outcome, setOutcome] = useState<"success" | "fail" | null>(null);
  const [initError, setInitError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || outcome) return;
    let cancelled = false;
    let controller: import("@/src/game/game-controller").GameController | null = null;
    setInitError(false);
    mountedRef.current = true;

    (async () => {
      try {
        if (cancelled || !mountedRef.current) return;
        const { GameController } = await import("@/src/game/game-controller");
        const c = new GameController();
        await c.mount(canvas, level, behavior, decision.finalLabel, (o) => {
          if (!cancelled) setOutcome(o);
        });
        if (cancelled || !mountedRef.current) {
          c.unmount();
          return;
        }
        controller = c;
      } catch {
        if (!cancelled) setInitError(true);
      }
    })();

    return () => {
      cancelled = true;
      controller?.unmount();
      controller = null;
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.levelId, behavior, retryKey]);

  const momoMoment: MomoMoment =
    outcome === "fail"
      ? "danger-consequence"
      : behavior === "solid"
        ? "solid-consequence"
        : "fallback-consequence";

  return (
    <section id="screen-gameplay" className="screen" aria-label="Konsekuensi gameplay">
      <div className="screen-head">
        <h2>Konsekuensi di Dalam Buku</h2>
        <p className="decision-chip">
          Keputusanmu: {decision.type.toUpperCase()} · “{decision.finalLabel}”
          {decision.type === "accept" ? " (#1)" : decision.type === "correct" ? ` (#${decision.sourceRank})` : ""}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={380}
        className="game-canvas"
        aria-label="Simulasi 2D"
        data-testid="game-canvas"
      />

      {initError && (
        <div className="error-box" role="alert">
          <p>Runtime permainan gagal dimulai.</p>
          <button type="button" className="btn btn-primary" onClick={() => setRetryKey((k) => k + 1)}>
            Coba Lagi
          </button>
          <button type="button" className="btn" onClick={onRedraw}>
            Gambar Ulang
          </button>
        </div>
      )}

      {!initError && (
        <>
          {outcome === null && (
            <div className="overlay overlay-passive" role="status">
              <p className="overlay-text">Karakter berjalan menuju ciptaanmu…</p>
            </div>
          )}
          {outcome !== null && (
            <div className="overlay" data-testid="outcome-overlay">
              <p className="overlay-title">{outcome === "success" ? "Berhasil menyeberang!" : "Gagal!"}</p>
              <MomoBubble moment={momoMoment} />
              <div className="overlay-actions">
                {outcome === "success" && (
                  <button type="button" className="btn btn-success" data-testid="btn-next" onClick={() => onOutcomeReported("success")}>
                    Lanjut
                  </button>
                )}
                {outcome === "fail" && (
                  <>
                    <button type="button" className="btn btn-primary" data-testid="btn-retry-cycle" onClick={() => onOutcomeReported("fail")}>
                      Ulangi Siklus
                    </button>
                    <button type="button" className="btn" data-testid="btn-redraw-gameplay" onClick={onRedraw}>
                      Gambar Ulang
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Keyboard/NUI input handler for player-controlled movement
function GameplayCanvas({ canvasRef, controller, onOutcome }: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  controller: import("@/src/game/game-controller").GameController | null;
  onOutcome: (outcome: "success" | "fail") => void;
}) {
  const inputRef = useRef({ left: false, right: false, jump: false });
  const frameRef = useRef<number>();

  useEffect(() => {
    if (!controller) return;
    
    // Send input to game loop
    const sendInput = () => {
      controller.setInput(inputRef.current);
      frameRef.current = requestAnimationFrame(sendInput);
    };
    frameRef.current = requestAnimationFrame(sendInput);
    
    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          inputRef.current.left = true;
          break;
        case "ArrowRight":
        case "KeyD":
          inputRef.current.right = true;
          break;
        case "ArrowUp":
        case "Space":
        case "KeyW":
          e.preventDefault();
          inputRef.current.jump = true;
          break;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          inputRef.current.left = false;
          break;
        case "ArrowRight":
        case "KeyD":
          inputRef.current.right = false;
          break;
        case "ArrowUp":
        case "Space":
        case "KeyW":
          inputRef.current.jump = false;
          break;
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    // Touch fallback for mobile testing
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = touch.clientX - rect.left;
      if (x < rect.width / 3) inputRef.current.left = true;
      else if (x > rect.width * 2 / 3) inputRef.current.right = true;
      else inputRef.current.jump = true;
    };
    const handleTouchEnd = () => {
      inputRef.current.left = false;
      inputRef.current.right = false;
      inputRef.current.jump = false;
    };
    
    canvasRef.current?.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvasRef.current?.addEventListener("touchend", handleTouchEnd);
    canvasRef.current?.addEventListener("touchcancel", handleTouchEnd);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvasRef.current?.removeEventListener("touchstart", handleTouchStart);
      canvasRef.current?.removeEventListener("touchend", handleTouchEnd);
      canvasRef.current?.removeEventListener("touchcancel", handleTouchEnd);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      // Reset input on unmount
      controller?.setInput({ left: false, right: false, jump: false });
    };
  }, [controller, canvasRef]);

  return null; // Canvas is rendered by parent, this just handles input
}

