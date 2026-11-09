/**
 * Floating gameplay controls: the three on-screen movement buttons plus "Geser objek".
 */
import { Icon, type IconName } from "../ui/Icon";
import { DirectionButton } from "./DirectionButton";
import { GuideHelpIcon } from "./ControlGuide";
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
  onReposition: () => void;
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
  guideOpen,
  onToggleGuide,
}: GameplayControlsProps) {
  return (
    <div className="stage-floating-controls" data-testid="gameplay-controls">
      <div className="gameplay-controls__row">
        {DIRECTION_BUTTONS.map((button) => (
          <DirectionButton
            key={button.dir}
            {...button}
            pressed={heldDirs.includes(button.dir)}
            handActive={handDirs.includes(button.dir)}
            indicator={mode === "camera"}
            onPress={onPress}
            onRelease={onRelease}
          />
        ))}
      </div>
      <span className="gameplay-controls__sep" aria-hidden="true" />
      <button className="nb-btn btn-small" data-testid="btn-reposition" onClick={onReposition}>
        <Icon name="swap" size={19} />
        Geser objek
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
