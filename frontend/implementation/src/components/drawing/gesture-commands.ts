/**
 * R12: drawing commands from hand poses (pinch = Coret, kepal = Hapus, dua jari = Mundur, telapak terbelah = Maju).
 * Edge-triggered with a short hold so a pose fires once: the pose must be held HOLD ms, then a different pose must
 * be seen before it can fire again. "draw" is handled by the pinch pipeline itself and never fires here.
 * Kepal is the Hapus tool: it is a held state (erasing while the fist is shown), not a one-shot command.
 */
import { drawingCommandFor, type HandPose } from "@/src/input/hand-gesture";

export type GestureAction = "undo" | "redo";

export const GESTURE_HOLD_MS: Record<GestureAction, number> = { undo: 300, redo: 300 };

export interface GestureCommander {
  /** Feed one frame's pose; returns the action to run now, if any. */
  feed(pose: HandPose, nowMs: number): GestureAction | null;
  /** True while the fist is held (Hapus tool active). */
  isErasing(): boolean;
  reset(): void;
}

export function createGestureCommander(): GestureCommander {
  let current: HandPose = "none";
  let since = 0;
  let fired = false;
  return {
    feed(pose, now) {
      if (pose !== current) {
        current = pose;
        since = now;
        fired = false;
        return null;
      }
      if (fired) return null;
      const cmd = drawingCommandFor(pose);
      if (cmd === null || cmd === "draw" || cmd === "erase") return null;
      if (now - since >= GESTURE_HOLD_MS[cmd]) {
        fired = true;
        return cmd;
      }
      return null;
    },
    isErasing() {
      return current === "fist";
    },
    reset() {
      current = "none";
      since = 0;
      fired = false;
    },
  };
}
