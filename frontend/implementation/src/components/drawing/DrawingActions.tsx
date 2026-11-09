/**
 * Bottom controls of the drawing screen: the Mouse/Kamera input switch and the "Tebak Gambarku" submit button.
 * R13: the Mouse/Kamera switch is a fallback control, shown only when the camera cannot be used.
 */
import type { InputModeId } from "@/src/input/types";
import { Icon } from "../ui/Icon";
import { useInputMode } from "@/src/hooks/useHandGesture";

export interface DrawingActionsProps {
  /** Only the drawing phase accepts input; other phases dim the controls. */
  phase: string;
  active: boolean;
  inputMode: InputModeId;
  hasInk: boolean;
  onSwitchMode: (mode: InputModeId) => void;
  onSubmit: () => void;
}

export function DrawingActions({ phase, active, inputMode, hasInk, onSwitchMode, onSubmit }: DrawingActionsProps) {
  const isDrawingPhase = phase === "drawing";
  const cameraMode = useInputMode() === "camera";
  return (
    <div className={`drawing-submit-controls${isDrawingPhase ? "" : " is-idle"}`}>
      {!cameraMode && (
      <div className="input-switch" role="group" aria-label="Cara menggambar">
        <button
          type="button"
          data-testid="btn-input-pointer"
          aria-pressed={inputMode !== "hand"}
          onClick={() => onSwitchMode("pointer")}
        >
          <Icon name="pointer" size={19} stroke={2.4} />
          Mouse
        </button>
        <button
          type="button"
          data-testid="btn-input-hand"
          aria-pressed={inputMode === "hand"}
          onClick={() => onSwitchMode("hand")}
        >
          <Icon name="camera" size={19} stroke={2.4} />
          Kamera
        </button>
      </div>
      )}
      <button
        type="button"
        className="nb-btn nb-btn--primary btn-submit-momo"
        data-testid="btn-submit-drawing"
        disabled={!hasInk || !active || !isDrawingPhase}
        onClick={onSubmit}
      >
        <Icon name="sparkles" size={21} stroke={2.4} />
        Tebak Gambarku
      </button>
    </div>
  );
}
