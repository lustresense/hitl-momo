/**
 * Camera-mode actions of an object that is already placed and played: "Geser objek" (pinch, held for its ring)
 * picks the object up; "Putar" (palm, held for its ring) starts the turn: then the palm's twist turns the object a
 * quarter turn per 45 degrees, until the thumbs-up or the palm is gone. Shown only in camera mode; the mouse and
 * keyboard affordances stay in the control bar.
 */
import { GestureRing } from "../ui/GestureRing";
import { Icon } from "../ui/Icon";
import type { GestureAction } from "@/src/input/gesture-mode";
import { GRAB_HOLD_MS, ROTATE_HOLD_MS } from "./placement-gesture";
import { useObjectTurn } from "./hooks/usePlacementGesture";
import "./placement-gestures.css";
import "./exploration-turn.css";

export interface ExplorationRingsProps {
  /** What the current pose asks for in the exploration mode (from the gesture router), or null. */
  gesture: GestureAction | null;
  onMove: () => void;
  /** One quarter turn of the object: +1 clockwise, -1 counter-clockwise. */
  onRotate: (direction: 1 | -1) => void;
}

export function ExplorationRings({ gesture, onMove, onRotate }: ExplorationRingsProps) {
  const turn = useObjectTurn(onRotate);
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
        disabled={turn.turning}
        holdMs={ROTATE_HOLD_MS}
        onConfirm={turn.begin}
        label="Putar"
        icon={<Icon name="hand-redo" size={24} />}
      />
      {turn.turning && <TurnIndicator />}
    </div>
  );
}

/** Shown while the turn is on: a turning arrow and the one line the student needs. Decorative arrow, plain text. */
function TurnIndicator() {
  return (
    <div className="object-turn" data-testid="object-turn" role="status">
      <svg className="object-turn__arrow" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path className="object-turn__arc" d="M 14.7 42 A 20 20 0 1 1 42 49.3" />
        <path className="object-turn__head" d="M 35.9 52.8 L 45 54.5 L 39 44.1 Z" />
      </svg>
      <p className="object-turn__text">Putar tanganmu. Jempol untuk selesai.</p>
    </div>
  );
}
