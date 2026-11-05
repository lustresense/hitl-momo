/**
 * Floating header of the world stage: world title, the student's decision chip and the
 * hand-control / draw-again buttons.
 */
import type { HumanDecision } from "@/src/domain/types";
import type { InputMode } from "./game-stage-types";

const DECISION_VERB: Record<HumanDecision["type"], string> = {
  accept: "Terima",
  correct: "Pilih lain",
  override: "Bukan ketiganya",
};

const titleRowStyle = { display: "flex", alignItems: "center", gap: 12 } as const;
const titleStyle = { margin: 0, fontSize: 18, fontWeight: 800, color: "#111111" } as const;
const chipStyle = { margin: 0 } as const;
const actionsStyle = { display: "flex", gap: 8 } as const;

export interface StageHeaderProps {
  characterName: string;
  decision: HumanDecision;
  integrated: boolean | undefined;
  mode: InputMode;
  /** The shared camera stream is live, so hand control may be offered. */
  handAvailable: boolean;
  onToggleHandControl: () => void;
  onToggleCameraNui: () => void;
  onDrawAgain: () => void;
}

export function StageHeader({
  characterName,
  decision,
  integrated,
  mode,
  handAvailable,
  onToggleHandControl,
  onToggleCameraNui,
  onDrawAgain,
}: StageHeaderProps) {
  const cameraOn = mode === "camera";
  return (
    <div className="stage-floating-header">
      <div style={titleRowStyle}>
        <h2 style={titleStyle}>Dunia {characterName}</h2>
        <span className="decision-chip" style={chipStyle}>
          {DECISION_VERB[decision.type]}: “{decision.finalLabel}”
          {decision.type !== "override" ? ` (#${decision.sourceRank})` : ""}
        </span>
      </div>
      <div style={actionsStyle}>
        {integrated && (handAvailable || cameraOn) && (
          <button
            className="btn btn-small"
            data-testid="btn-hand-control"
            aria-pressed={cameraOn}
            onClick={onToggleHandControl}
          >
            {cameraOn ? "Pakai keyboard" : "Kontrol tangan"}
          </button>
        )}
        {!integrated && (
          <button className="btn btn-small" onClick={onToggleCameraNui}>
            {cameraOn ? "Gunakan FALLBACK keyboard/pointer" : "Nyalakan Kamera NUI"}
          </button>
        )}
        <button className="btn btn-small" data-testid="btn-draw-again" onClick={onDrawAgain}>
          Gambar lagi
        </button>
      </div>
    </div>
  );
}
