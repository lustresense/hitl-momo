/**
 * World HUD, top row. Left: whose world this is and what the student decided (icon + the label only).
 * Right: "Gambar lagi". There is no hand or camera toggle here: in camera mode the hand steers by itself
 * (GameStage), so a toggle would do nothing. The button is a plain click target, not a dwell button: the
 * stage's own hand reader is already running, and a dwell button would start a second one. In camera mode it
 * stays a small secondary button: the hand reaches "Gambar lagi" through the fail screen and the sticker.
 */
import { Icon, type IconName } from "../ui/Icon";
import { ThinmanArt } from "../ui/ThinmanArt";
import "../ui/nui-actions.css";
import type { HumanDecision } from "@/src/domain/types";
import type { InputMode } from "./game-stage-types";

const DECISION_ICON: Record<HumanDecision["type"], IconName> = {
  accept: "check",
  correct: "swap",
  override: "pencil",
};

const DECISION_NAME: Record<HumanDecision["type"], string> = {
  accept: "Terima",
  correct: "Pilih lain",
  override: "Bukan ketiganya",
};

export interface StageHeaderProps {
  characterName: string;
  decision: HumanDecision;
  onDrawAgain: () => void;
  /** "camera": the button is a small secondary click target, so it does not compete with the palm gesture. */
  mode?: InputMode;
}

export function StageHeader({ characterName, decision, onDrawAgain, mode = "fallback" }: StageHeaderProps) {
  const quiet = mode === "camera";
  return (
    <div className="stage-floating-header hud">
      <div className="hud-plate nb-card">
        <span className="hud-plate__mark" aria-hidden="true">
          <ThinmanArt />
        </span>
        <h2 className="hud-plate__title">Dunia {characterName}</h2>
        <span className="hud-plate__sep" aria-hidden="true" />
        <span
          className="nb-chip nb-chip--leaf decision-chip"
          title={`${DECISION_NAME[decision.type]}${decision.type !== "override" ? `, peringkat ${decision.sourceRank}` : ""}`}
        >
          <span className="nb-chip__badge" aria-hidden="true">
            <Icon name={DECISION_ICON[decision.type]} size={13} stroke={3.2} />
          </span>
          {decision.finalLabel}
        </span>
      </div>
      <div className="hud-actions">
        <button
          className={quiet ? "nb-btn nb-btn--ghost btn-small nui-header-action is-quiet" : "nb-btn nb-btn--primary nui-header-action"}
          data-testid="btn-draw-again"
          onClick={onDrawAgain}
        >
          <Icon name="pencil" size={quiet ? 16 : 20} />
          Gambar lagi
        </button>
      </div>
    </div>
  );
}
