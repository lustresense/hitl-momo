/**
 * One on-screen movement button (left / right / jump). Reports pointer presses and releases by
 * pointer id so several fingers can hold different directions at once.
 */
import type { DirectionKey } from "./game-stage-types";

export interface DirectionButtonProps {
  dir: DirectionKey;
  testId: string;
  ariaLabel: string;
  label: string;
  pressed: boolean;
  /** Highlights the button as the primary action (jump). */
  primary?: boolean;
  onPress: (pointerId: number, dir: DirectionKey) => void;
  onRelease: (pointerId: number) => void;
}

export function DirectionButton({
  dir,
  testId,
  ariaLabel,
  label,
  pressed,
  primary = false,
  onPress,
  onRelease,
}: DirectionButtonProps) {
  // The literal "null" class when not pressed is historical; kept so the DOM stays byte-identical.
  const className = `btn btn-small game-input-button${primary ? " btn-primary" : ""} ${pressed ? "is-pressed" : null}`;
  return (
    <button
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
        onPress(event.pointerId, dir);
      }}
      onPointerUp={(event) => onRelease(event.pointerId)}
      onPointerCancel={(event) => onRelease(event.pointerId)}
      onLostPointerCapture={(event) => onRelease(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
}
