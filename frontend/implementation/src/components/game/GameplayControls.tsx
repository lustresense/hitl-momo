/**
 * Floating gameplay controls.
 * Camera mode: a speedometer for the finger direction, icon-only direction lights, and the two
 * gesture affordances "Geser objek" (pinch) and "Putar" (open palm). No keyboard hints.
 * Fallback mode: the on-screen movement buttons with their words, plus the same two actions.
 */
import { Icon, type IconName } from "../ui/Icon";
import { DirectionButton } from "./DirectionButton";
import { GuideHelpIcon } from "./ControlGuide";
import { SteerDial } from "./SteerDial";
import type { DirectionKey, InputMode } from "./game-stage-types";
import "./gameplay-guide.css";

const DIRECTION_BUTTONS: ReadonlyArray<{
  dir: DirectionKey;
  testId: string;
  ariaLabel: string;
  icon: IconName;
  label: string;
  primary?: boolean;
}> = [
  { dir: "left", testId: "move-left", ariaLabel: "Gerak Kiri", icon: "arrow-left", label: "Kiri" },
  { dir: "right", testId: "move-right", ariaLabel: "Gerak Kanan", icon: "arrow-right", label: "Kanan" },
  { dir: "jump", testId: "move-jump", ariaLabel: "Lompat / Loncat", icon: "arrow-up", label: "Lompat", primary: true },
];

export interface GameplayControlsProps {
  /** "camera": the hand steers, the buttons only show it. "fallback": the buttons are the controls. */
  mode: InputMode;
  heldDirs: DirectionKey[];
  /** Directions the hand is giving right now (highlight only). */
  handDirs: DirectionKey[];
  onPress: (pointerId: number, dir: DirectionKey) => void;
  onRelease: (pointerId: number) => void;
  /** The existing reposition action; "Geser objek" uses it until onMoveRequest is wired. */
  onReposition: () => void;
  /** "Geser objek" request (the placement work owns the action). Defaults to onReposition. */
  onMoveRequest?: () => void;
  /** "Putar" request: turn the object 90 degrees. Owned by the placement work. */
  onRotateRequest?: () => void;
  guideOpen: boolean;
  onToggleGuide: () => void;
}

export function GameplayControls({
  mode,
  heldDirs,
  handDirs,
  onPress,
  onRelease,
  onReposition,
  onMoveRequest,
  onRotateRequest,
  guideOpen,
  onToggleGuide,
}: GameplayControlsProps) {
  const camera = mode === "camera";
  return (
    <div className="stage-floating-controls" data-testid="gameplay-controls" data-input-mode={mode}>
      <div className="gameplay-controls__row">
        {DIRECTION_BUTTONS.map((button) => (
          <DirectionButton
            key={button.dir}
            {...button}
            pressed={heldDirs.includes(button.dir)}
            handActive={handDirs.includes(button.dir)}
            indicator={camera}
            iconOnly={camera}
            onPress={onPress}
            onRelease={onRelease}
          />
        ))}
        {camera && <SteerDial />}
      </div>
      <span className="gameplay-controls__sep" aria-hidden="true" />
      <button
        type="button"
        className="nb-btn btn-small gameplay-controls__action"
        data-testid="btn-reposition"
        onClick={() => (onMoveRequest ?? onReposition)()}
      >
        <Icon name={camera ? "hand-draw" : "swap"} size={camera ? 22 : 19} />
        Geser objek
      </button>
      <button
        type="button"
        className="nb-btn btn-small gameplay-controls__action"
        data-testid="btn-rotate"
        onClick={() => onRotateRequest?.()}
      >
        <Icon name={camera ? "hand-redo" : "again"} size={camera ? 22 : 19} />
        Putar
      </button>
      <button
        type="button"
        className="nb-btn btn-small gameplay-controls__help"
        data-testid="btn-control-guide"
        aria-label="Cara menjalankan Thinman"
        aria-expanded={guideOpen}
        onClick={onToggleGuide}
      >
        <GuideHelpIcon />
      </button>
    </div>
  );
}
