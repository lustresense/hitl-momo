/**
 * Camera-mode actions of an object that is already placed and played: "Geser objek" (pinch, held for its ring)
 * picks the object up, "Putar" (open palm) turns it a quarter turn. Shown only in camera mode; the mouse and keyboard
 * affordances stay in the control bar.
 */
import { GestureRing } from "../ui/GestureRing";
import { Icon } from "../ui/Icon";
import type { GestureAction } from "@/src/input/gesture-mode";
import { GRAB_HOLD_MS, ROTATE_HOLD_MS } from "./placement-gesture";
import "./placement-gestures.css";

export interface ExplorationRingsProps {
  /** What the current pose asks for in the exploration mode (from the gesture router), or null. */
  gesture: GestureAction | null;
  onMove: () => void;
  onRotate: () => void;
}

export function ExplorationRings({ gesture, onMove, onRotate }: ExplorationRingsProps) {
  return (
    <div className="exploration-rings" data-testid="exploration-rings">
      <GestureRing
        testId="ring-move"
        active={gesture === "grab"}
        holdMs={GRAB_HOLD_MS}
        onConfirm={onMove}
        label="Geser objek"
        icon={<Icon name="hand-draw" size={24} />}
      />
      <GestureRing
        testId="ring-rotate"
        active={gesture === "rotate"}
        holdMs={ROTATE_HOLD_MS}
        onConfirm={onRotate}
        label="Putar"
        icon={<Icon name="hand-redo" size={24} />}
      />
    </div>
  );
}
