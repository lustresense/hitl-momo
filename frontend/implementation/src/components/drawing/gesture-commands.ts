/**
 * R12: drawing commands from hand poses (pinch = Coret, kepal = Hapus, dua jari = Mundur, telapak = Maju).
 * The palm is open or split (both redo, see drawingCommandFor).
 * Edge-triggered with a short hold so a pose fires once: the pose must be held HOLD ms, then a different pose must
 * be seen before it can fire again. "draw" is handled by the pinch pipeline itself and never fires here.
 * Kepal is the Hapus tool: it is a held state (erasing while the fist is shown), not a one-shot command.
 * Poses come from the gesture router (MODE_CANVAS_DRAWING); the tutorial card 3 reads the same undo, redo and erase.
 */
import { MODE_CANVAS_DRAWING, actionFor } from "@/src/input/gesture-mode";
import type { HandPose } from "@/src/input/hand-gesture";

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
      const cmd = actionFor(MODE_CANVAS_DRAWING, pose);
      if (cmd !== "undo" && cmd !== "redo") return null;
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
