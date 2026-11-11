/**
 * Floating gameplay controls.
 * Camera mode: a speedometer for the finger direction and icon-only direction lights. The object's actions
 * "Geser objek" and "Putar" are the gesture rings in the stage (ExplorationRings), so the bar shows no button
 * for them. No keyboard hints.
 * Fallback mode: the on-screen movement buttons with their words, plus "Geser objek" and the two turn buttons.
 * Q (left) and E (right) turn the object from the keyboard too; no key is named on screen.
 */
import { useEffect } from "react";
import { Icon, type IconName } from "../ui/Icon";
import type { TurnDirection } from "@/src/game/runtime/creations";
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
  /** "Putar" request: turn the object 90 degrees, 1 clockwise or -1 counter-clockwise. */
  onRotateRequest?: (dir: TurnDirection) => void;
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

  // Keyboard turn: Q left, E right. Camera mode has the rings for turning instead, so it takes no keys here.
  useEffect(() => {
    if (camera || !onRotateRequest) return;
    const turnByKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "KeyQ") onRotateRequest(-1);
      else if (event.code === "KeyE") onRotateRequest(1);
    };
    window.addEventListener("keydown", turnByKey);
    return () => window.removeEventListener("keydown", turnByKey);
  }, [camera, onRotateRequest]);

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
      {!camera && (
        <>
          <button
            type="button"
            className="nb-btn btn-small gameplay-controls__action"
            data-testid="btn-reposition"
            onClick={() => (onMoveRequest ?? onReposition)()}
          >
            <Icon name="swap" size={19} />
            Geser objek
          </button>
          <button
            type="button"
            className="nb-btn btn-small gameplay-controls__action"
            data-testid="btn-rotate-left"
            aria-keyshortcuts="Q"
            onClick={() => onRotateRequest?.(-1)}
          >
            <Icon name="again" size={19} style={{ transform: "scaleX(-1)" }} />
            Putar kiri
          </button>
          <button
            type="button"
            className="nb-btn btn-small gameplay-controls__action"
            data-testid="btn-rotate"
            aria-keyshortcuts="E"
            onClick={() => onRotateRequest?.(1)}
          >
            <Icon name="again" size={19} />
            Putar kanan
          </button>
        </>
      )}
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
