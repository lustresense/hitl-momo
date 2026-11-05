/**
 * Bottom controls of the drawing screen: the Mouse/Kamera input switch and the "Tebak Gambarku" submit button.
 */
import type { InputModeId } from "@/src/input/types";

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
  return (
    <>
      <div
        className="drawing-submit-controls"
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          opacity: isDrawingPhase ? 1 : 0.4,
          pointerEvents: isDrawingPhase ? "auto" : "none",
        }}
      >
        <div className="input-switch" role="group" aria-label="Cara menggambar">
          <button
            type="button"
            data-testid="btn-input-pointer"
            aria-pressed={inputMode !== "hand"}
            onClick={() => onSwitchMode("pointer")}
          >
            Mouse
          </button>
          <button
            type="button"
            data-testid="btn-input-hand"
            aria-pressed={inputMode === "hand"}
            onClick={() => onSwitchMode("hand")}
          >
            Kamera
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-submit-momo"
          data-testid="btn-submit-drawing"
          disabled={!hasInk || !active || !isDrawingPhase}
          onClick={onSubmit}
        >
          Tebak Gambarku
        </button>
      </div>

      {/* Phones: pin the controls bottom-right as a column. */}
      <style jsx>{`
        @media (max-width: 600px) {
          .drawing-momo-top-right {
            display: none !important;
          }
          .drawing-submit-controls {
            top: auto !important;
            bottom: 24px !important;
            left: auto !important;
            right: 16px !important;
            transform: none !important;
            width: auto !important;
            flex-direction: column !important;
            align-items: flex-end !important;
            z-index: 950 !important;
          }
          .drawing-submit-controls button {
            font-size: 12px !important;
            padding: 8px 14px !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
          }
        }
      `}</style>
    </>
  );
}
