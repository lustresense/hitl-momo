/**
 * Floating placement controls of a new object (fresh sticker, or one picked up again).
 * Camera mode: three finger rings, "Geser objek" (pinch), "Taruh di sini" (thumbs-up) and "Gambar lagi" (open palm).
 * While the object is held the grab ring becomes a hint. Fallback mode: the plain confirm button, as before.
 */
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import { Icon } from "../ui/Icon";
import type { GestureAction } from "@/src/input/gesture-mode";
import type { InputMode } from "./game-stage-types";
import { GRAB_HOLD_MS, PLACE_HOLD_MS, REDRAW_HOLD_MS } from "./placement-gesture";
import "./placement-gestures.css";

export interface PlacementControlsProps {
  /** "camera": rings driven by the pose. "fallback": the plain button. */
  mode: InputMode;
  /** What the current pose asks for in the placement mode (from the gesture router), or null. */
  gesture: GestureAction | null;
  /** The object is held by a pinch: the grab ring is replaced by a hint. */
  holding: boolean;
  confirmDisabled: boolean;
  placementError: string;
  onConfirm: () => void;
  onGrab: () => void;
  onRedraw: () => void;
}

export function PlacementControls({
  mode,
  gesture,
  holding,
  confirmDisabled,
  placementError,
  onConfirm,
  onGrab,
  onRedraw,
}: PlacementControlsProps) {
  return (
    <div className="stage-floating-controls placement-controls" data-testid="placement-controls" data-input-mode={mode}>
      {mode === "camera" ? (
        <div className="placement-controls__rings">
          {holding ? (
            <p className="placement-controls__hint" role="status" data-testid="placement-holding">
              Objek mengikuti tanganmu. Lepas cubitan untuk menaruh.
            </p>
          ) : (
            <GestureRing
              testId="ring-grab"
              active={gesture === "grab"}
              holdMs={GRAB_HOLD_MS}
              onConfirm={onGrab}
              label="Geser objek"
              icon={<Icon name="hand-draw" size={24} />}
            />
          )}
          <GestureRing
            testId="ring-place"
            active={gesture === "place"}
            holdMs={PLACE_HOLD_MS}
            onConfirm={onConfirm}
            label="Taruh di sini"
            disabled={confirmDisabled}
            icon={<Icon name="thumb-up" size={24} />}
          />
          <GestureRing
            testId="ring-redraw"
            active={gesture === "redraw"}
            holdMs={REDRAW_HOLD_MS}
            onConfirm={onRedraw}
            label="Gambar lagi"
            icon={<FingerGlyph count={5} size={26} />}
          />
        </div>
      ) : (
        <button
          className="nb-btn nb-btn--green"
          data-testid="btn-confirm-placement"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          <Icon name="check" size={22} stroke={3} />
          Taruh di sini
        </button>
      )}
      {placementError && <span className="placement-controls__error">{placementError}</span>}
    </div>
  );
}
