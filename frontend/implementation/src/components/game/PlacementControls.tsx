/** R8.3 placement: stationary pinch confirms; moving pinch belongs to the stage drag controller. */
import { PinchRing } from "../ui/PinchRing";
import { Icon } from "../ui/Icon";
import type { GestureAction } from "@/src/input/gesture-mode";
import type { InputMode } from "./game-stage-types";
import "./placement-gestures.css";

export interface PlacementControlsProps {
  mode: InputMode;
  gesture?: GestureAction | null;
  holding?: boolean;
  confirmDisabled: boolean;
  placementError: string;
  onConfirm: () => void;
  onGrab?: () => void;
  onRedraw: () => void;
}
export function PlacementControls({mode,confirmDisabled,placementError,onConfirm}:PlacementControlsProps) {
  return <div className="stage-floating-controls placement-controls" data-testid="placement-controls" data-input-mode={mode}>
    {mode==="camera" ? <PinchRing testId="ring-place" holdMs={1500} label="Taruh di sini" disabled={confirmDisabled} onConfirm={onConfirm}/> :
      <button className="nb-btn nb-btn--green" data-testid="btn-confirm-placement" disabled={confirmDisabled} onClick={onConfirm}><Icon name="check" size={22} stroke={3}/>Taruh di sini</button>}
    {placementError && <span className="placement-controls__error">{placementError}</span>}
  </div>;
}
