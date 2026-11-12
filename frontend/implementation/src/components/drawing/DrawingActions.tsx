/**
 * Bottom controls of the drawing screen: the "selesai gambar" thumb ring, the Mouse/Kamera input switch and the
 * "Tebak Gambarku" submit button. The finish ring appears once there is ink, and only then can a thumbs-up make
 * Momo guess.
 *
 * The switch and Tebak are fallback routes, so they are not shown at the start of a working camera drawing:
 * - camera mode: a small "Bantuan" button opens them, and they also appear when no hand has been seen for 15 s;
 * - fallback mode (camera missing, denied or failed): they show at once, with no Bantuan button.
 */
import { useEffect, useState } from "react";
import type { InputModeId } from "@/src/input/types";
import { Icon } from "../ui/Icon";
import { DwellButton } from "../ui/DwellButton";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import "../ui/nui-actions.css";
import { useInputMode } from "@/src/hooks/useHandGesture";
import "./drawing-finish.css";
import "./drawing-actions.css";

/** Camera mode: this long without a hand in view reveals the fallback controls. */
export const HAND_LOST_REVEAL_MS = 15000;

export interface DrawingActionsProps {
  /** Only the drawing phase accepts input; other phases dim the controls. */
  phase: string;
  active: boolean;
  inputMode: InputModeId;
  hasInk: boolean;
  /** The drawing surface's hand shows a thumbs-up right now (camera mode feeds the finish ring with it). */
  externalThumbUp?: boolean;
  /**
   * The mission briefing is open: hide the finish ring (a thumb there cannot confirm the drawing) and disable
   * Tebak, which the briefing covers (a resting fingertip could otherwise submit through it).
   */
  finishPaused?: boolean;
  /** The drawing surface sees no hand right now. After HAND_LOST_REVEAL_MS the fallback controls appear. */
  handMissing?: boolean;
  onSwitchMode: (mode: InputModeId) => void;
  onSubmit: () => void;
}

export function DrawingActions({
  phase,
  active,
  inputMode,
  hasInk,
  externalThumbUp = false,
  finishPaused = false,
  handMissing = false,
  onSwitchMode,
  onSubmit,
}: DrawingActionsProps) {
  const isDrawingPhase = phase === "drawing";
  const cameraMode = useInputMode() === "camera";
  const [helpOpen, setHelpOpen] = useState(false);
  const [handLost, setHandLost] = useState(false);
  useEffect(() => {
    if (!handMissing) {
      setHandLost(false);
      return;
    }
    // A hand seen again before the time is up starts the count over (the cleanup clears this timer).
    const timer = setTimeout(() => setHandLost(true), HAND_LOST_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [handMissing]);
  const showFallback = !cameraMode || helpOpen || handLost;
  const showFinish = isDrawingPhase && active && hasInk && !finishPaused;
  return (
    <>
      {showFinish && (
        <ThumbConfirm
          holdMs={2000}
          label="Tahan jempol kalau sudah selesai"
          onConfirm={onSubmit}
          externalThumbUp={externalThumbUp}
          className="drawing-finish"
          testId="btn-finish-drawing"
        />
      )}
      <div className={`drawing-submit-controls${isDrawingPhase ? "" : " is-idle"}`}>
        {cameraMode && (
          <DwellButton
            testId="btn-drawing-help"
            className="drawing-help-toggle"
            expanded={showFallback}
            onActivate={() => setHelpOpen((open) => !open)}
            icon={<Icon name="bulb" size={18} stroke={2.4} />}
          >
            Bantuan
          </DwellButton>
        )}
        {showFallback && (
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
        {/*
          56 px tall. A fingertip picks it by dwell (2 s, reading the drawing surface's fingertip); a click picks it
          at once. The finish ring above is the thumb route to the same guess.
        */}
        {showFallback && (
        <DwellButton
          tone="accent"
          dwellMs={2000}
          className="nb-btn nb-btn--primary btn-submit-momo nui-submit"
          testId="btn-submit-drawing"
          disabled={!hasInk || !active || !isDrawingPhase || finishPaused}
          onActivate={onSubmit}
          icon={<Icon name="sparkles" size={21} stroke={2.4} />}
        >
          Tebak Gambarku
        </DwellButton>
        )}
      </div>
    </>
  );
}
