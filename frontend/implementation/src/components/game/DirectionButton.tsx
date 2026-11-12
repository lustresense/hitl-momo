/**
 * One movement button (left / right / jump). Reports pointer presses and releases by pointer id so
 * several fingers can hold different directions at once. In camera mode it is an icon-only light
 * that also takes a silent press and hold (no visible text, no keyboard label): a student whose hand
 * is not seen can still steer with the mouse or a finger.
 */
import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon, type IconName } from "../ui/Icon";
import type { DirectionKey } from "./game-stage-types";

export interface DirectionButtonProps {
  dir: DirectionKey;
  testId: string;
  ariaLabel: string;
  icon: IconName;
  label: string;
  pressed: boolean;
  /** The hand gesture is giving this direction right now. Highlight only; input is unchanged. */
  handActive?: boolean;
  /** Highlights the button as the primary action (jump). */
  primary?: boolean;
  /** Camera mode look: the hand shows the direction here; a press is still accepted (silent fallback). */
  indicator?: boolean;
  /** Camera mode: the icon alone; the words are not needed next to the speedometer. */
  iconOnly?: boolean;
  onPress: (pointerId: number, dir: DirectionKey) => void;
  onRelease: (pointerId: number) => void;
}

export function DirectionButton({
  dir,
  testId,
  ariaLabel,
  icon,
  label,
  pressed,
  handActive = false,
  primary = false,
  indicator = false,
  iconOnly = false,
  onPress,
  onRelease,
}: DirectionButtonProps) {
  const className = `nb-btn btn-small game-input-button${primary ? " nb-btn--primary" : ""}${pressed ? " is-pressed" : ""}${handActive ? " is-hand-active" : ""}${indicator ? " is-indicator" : ""}${iconOnly ? " is-icon-only" : ""}`;
  // Same press handlers in both modes: the camera bar only changes the look, not the input path.
  const pressHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
      onPress(event.pointerId, dir);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => onRelease(event.pointerId),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => onRelease(event.pointerId),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => onRelease(event.pointerId),
  };
  return (
    <button
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      tabIndex={indicator ? -1 : undefined}
      {...pressHandlers}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Icon name={icon} size={22} stroke={3} />
      {!iconOnly && <span className="game-input-button__label">{label}</span>}
    </button>
  );
}
