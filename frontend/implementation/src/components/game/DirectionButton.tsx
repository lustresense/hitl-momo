/**
 * One on-screen movement button (left / right / jump). Reports pointer presses and releases by
 * pointer id so several fingers can hold different directions at once. In camera mode it is only
 * an indicator: the hand gives the direction, so the button takes no press.
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
  /** Camera mode: show the direction, take no press (the hand moves Thinman). */
  indicator?: boolean;
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
  onPress,
  onRelease,
}: DirectionButtonProps) {
  const className = `nb-btn btn-small game-input-button${primary ? " nb-btn--primary" : ""}${pressed ? " is-pressed" : ""}${handActive ? " is-hand-active" : ""}${indicator ? " is-indicator" : ""}`;
  // An indicator gets no press handlers at all, so a stray mouse event cannot move Thinman.
  const pressHandlers = indicator
    ? {}
    : {
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
      aria-disabled={indicator ? true : undefined}
      tabIndex={indicator ? -1 : undefined}
      style={indicator ? { pointerEvents: "none" } : undefined}
      {...pressHandlers}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Icon name={icon} size={22} stroke={3} />
      <span className="game-input-button__label">{label}</span>
    </button>
  );
}
