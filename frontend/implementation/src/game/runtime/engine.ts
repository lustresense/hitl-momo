/**
 * Process-wide KAPLAY engine bookkeeping: only one engine may be alive, and every engine needs
 * its own CSS font key.
 */
import type { KAPLAYCtx } from "kaplay";

let active: KAPLAYCtx | null = null;
let fontGeneration = 0;

/** Quit the previous engine (if any) before a new one is created. */
export function quitActiveEngine(): void {
  active?.quit();
}

export function setActiveEngine(k: KAPLAYCtx): void {
  active = k;
}

/** Quit an engine and forget it if it is the active one. */
export function releaseEngine(k: KAPLAYCtx): void {
  k.quit();
  if (active === k) active = null;
}

/** KAPLAY decodes its built-in "burp" right after creating its context; let that finish before closing. */
export const KAPLAY_AUDIO_CLOSE_DELAY_MS = 1500;

/**
 * The app has exactly ONE audio system (src/audio). Every `kaplay()` call builds its own AudioContext
 * (the game never calls play/loadSound/volume/burp), so release it: browsers cap live contexts and an
 * idle one still holds a render thread. Closing is deferred so KAPLAY's own startup decode finishes
 * cleanly (no "Failed to load burp" console error), and it is idempotent and never throws.
 * Callers also pass `backgroundAudio: true` so KAPLAY's hide/show handlers never try to
 * suspend()/resume() the closed context.
 */
export function silenceKaplayAudio(
  k: Pick<KAPLAYCtx, "audioCtx"> | { audioCtx?: unknown },
  delayMs: number = KAPLAY_AUDIO_CLOSE_DELAY_MS,
): void {
  const close = () => {
    try {
      const ctx = k.audioCtx as Partial<AudioContext> | undefined;
      if (!ctx || typeof ctx.close !== "function" || ctx.state === "closed") return;
      void Promise.resolve(ctx.close()).catch(() => undefined);
    } catch {
      /* the engine may already be quit; nothing to release */
    }
  };
  if (delayMs <= 0 || typeof setTimeout !== "function") {
    close();
    return;
  }
  setTimeout(close, delayMs);
}

/**
 * KAPLAY 3001 caches CSS font atlases globally, even after quit destroys their textures.
 * A per-engine CSS key retains the default face without reusing a dead GL texture.
 */
export function nextLabelFont(): string {
  return `"sketchbook-runtime-${++fontGeneration}", sans-serif`;
}
