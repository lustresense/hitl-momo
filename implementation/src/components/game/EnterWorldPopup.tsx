/**
 * Pop-up that offers the decided object to the world; the world only starts once the student enters it.
 */
import type { DrawingInput, ObjectBehavior } from "@/src/domain/types";
import { generateSketchDataUri } from "@/src/game/sketch-renderer";

export interface EnterWorldPopupProps {
  label: string;
  behavior: ObjectBehavior;
  drawingInput: DrawingInput | null;
  onEnter: () => void;
  onRedraw: () => void;
}

export function EnterWorldPopup({ label, behavior, drawingInput, onEnter, onRedraw }: EnterWorldPopupProps) {
  return (
    <div className="enter-world-popup" role="dialog" aria-label="Masukkan objek ke dunia" data-testid="enter-world-popup">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI preview of the student's own sketch */}
      <img
        className="enter-preview"
        alt={`Sketsa ${label}`}
        src={generateSketchDataUri(drawingInput, { width: 220, height: 74, behavior, label, pixelScale: 2 })}
      />
      <p className="enter-label">{label}</p>
      <button className="btn btn-primary" data-testid="btn-enter-world" onClick={onEnter}>
        Masukkan ke dunia
      </button>
      <button className="btn btn-ghost btn-small" data-testid="btn-redraw" onClick={onRedraw}>
        Gambar ulang
      </button>
    </div>
  );
}
