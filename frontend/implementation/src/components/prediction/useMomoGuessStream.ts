"use client";
/**
 * R11 streaming: while the student draws, ask the provider for a provisional guess every ~500 ms (a call is
 * dropped, not queued, while one is running). When the hand rests GUESS_IDLE_MS after the last change, `onAsk`
 * fires once for that drawing (the app submits it and Momo asks). Works for mouse and hand input alike, since it
 * watches the strokes, not the pointer.
 */
import { useEffect, useRef, useState } from "react";
import type { DrawingSurface } from "@/src/input";
import type { PredictionResult } from "@/src/domain/types";
import { initialGuessStream, stepGuessStream, strokeSignature } from "./guess-stream";

const POLL_MS = 100;

export interface UseMomoGuessStreamOptions {
  surfaceOut: { current: DrawingSurface | null };
  active: boolean;
  /** Provisional guess for the current strokes; null = no streaming (Momo only hums). */
  provisionalGuess?: ((surface: DrawingSurface) => Promise<PredictionResult | null>) | null;
  onAsk?: () => void;
}

export function useMomoGuessStream({ surfaceOut, active, provisionalGuess, onAsk }: UseMomoGuessStreamOptions) {
  const [provisional, setProvisional] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const guessRef = useRef(provisionalGuess);
  guessRef.current = provisionalGuess;
  const askRef = useRef(onAsk);
  askRef.current = onAsk;

  useEffect(() => {
    if (!active) return;
    let state = initialGuessStream(Date.now());
    let alive = true;
    let inFlight = false;
    const id = setInterval(() => {
      const surface = surfaceOut.current;
      if (!surface) return;
      let input;
      try {
        input = surface.toDrawingInput();
      } catch {
        return;
      }
      const now = Date.now();
      const step = stepGuessStream({ ...state, inFlight }, strokeSignature(input.strokes), input.hasInk, now);
      state = step.state;
      setDrawing(input.hasInk && now - state.changedAt < 1000);
      if (!input.hasInk) setProvisional(null);
      const guess = guessRef.current;
      if (step.callProvisional && guess) {
        inFlight = true;
        guess(surface)
          .then((r) => { if (alive && r?.candidates[0]) setProvisional(r.candidates[0].label); })
          .catch(() => void 0)
          .finally(() => { inFlight = false; });
      }
      if (step.ask) askRef.current?.();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active, surfaceOut]);

  return { provisional, drawing };
}
