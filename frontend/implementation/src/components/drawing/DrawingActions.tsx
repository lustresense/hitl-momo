/** R8.3 drawing confirmation: point at the ring, then pinch for two seconds.
 * Mouse controls are available only after actual camera/tracker failure. */
import type { InputModeId } from "@/src/input/types";
import { Icon } from "../ui/Icon";
import { DwellButton } from "../ui/DwellButton";
import { useInputMode } from "@/src/hooks/useHandGesture";
import "../ui/nui-actions.css";
import "./drawing-finish.css";
import "./drawing-actions.css";
export const HAND_LOST_REVEAL_MS = 15000; // retained for compatibility; absence of a hand is not a camera failure.
export interface DrawingActionsProps {
  phase: string;
  active: boolean;
  inputMode: InputModeId;
  hasInk: boolean;
  externalThumbUp?: boolean;
  finishPaused?: boolean;
  handMissing?: boolean;
  onSwitchMode: (mode: InputModeId) => void;
  onSubmit: () => void;
}
export function DrawingActions({phase,active,inputMode,hasInk,finishPaused=false,onSwitchMode,onSubmit}: DrawingActionsProps) {
  const cameraMode=useInputMode()==="camera";
  const drawing=phase==="drawing";
  return (
    <div className={`drawing-submit-controls${drawing?"":" is-idle"}`}>
      {!cameraMode && <div className="input-switch" role="group" aria-label="Cara menggambar">
        <button type="button" data-testid="btn-input-pointer" aria-pressed={inputMode!=="hand"} onClick={()=>onSwitchMode("pointer")}><Icon name="pointer" size={19}/>Mouse</button>
        <button type="button" data-testid="btn-input-hand" aria-pressed={inputMode==="hand"} onClick={()=>onSwitchMode("hand")}><Icon name="camera" size={19}/>Kamera</button>
      </div>}
      <DwellButton tone="accent" targetMode="point" dwellMs={2000}
        className="nb-btn nb-btn--primary btn-submit-momo nui-submit" testId="btn-submit-drawing"
        disabled={!hasInk||!active||!drawing||finishPaused} onActivate={onSubmit}
        icon={<Icon name="gesture-pinch" size={24}/>}>Tebak Gambarku</DwellButton>
    </div>
  );
}
