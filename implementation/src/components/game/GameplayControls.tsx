/**
 * Floating gameplay controls: the three on-screen movement buttons plus "Geser Ulang Objek".
 */
import { DirectionButton } from "./DirectionButton";
import type { DirectionKey } from "./game-stage-types";

const DIRECTION_BUTTONS: ReadonlyArray<{
  dir: DirectionKey;
  testId: string;
  ariaLabel: string;
  label: string;
  primary?: boolean;
}> = [
  { dir: "left", testId: "move-left", ariaLabel: "Gerak Kiri", label: "← Kiri" },
  { dir: "right", testId: "move-right", ariaLabel: "Gerak Kanan", label: "Kanan →" },
  { dir: "jump", testId: "move-jump", ariaLabel: "Lompat / Loncat", label: "↑ Lompat", primary: true },
];

const buttonRowStyle = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } as const;

export interface GameplayControlsProps {
  heldDirs: DirectionKey[];
  onPress: (pointerId: number, dir: DirectionKey) => void;
  onRelease: (pointerId: number) => void;
  onReposition: () => void;
}

export function GameplayControls({ heldDirs, onPress, onRelease, onReposition }: GameplayControlsProps) {
  return (
    <div className="stage-floating-controls" data-testid="gameplay-controls">
      <div style={buttonRowStyle}>
        {DIRECTION_BUTTONS.map((button) => (
          <DirectionButton
            key={button.dir}
            {...button}
            pressed={heldDirs.includes(button.dir)}
            onPress={onPress}
            onRelease={onRelease}
          />
        ))}
      </div>
      <button className="btn btn-small" data-testid="btn-reposition" onClick={onReposition}>
        Geser Ulang Objek
      </button>
    </div>
  );
}
