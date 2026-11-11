"use client";
/**
 * What Momo shows under her catalog lines in the focus phase: the level's objects as chips (for the student to see
 * what can be drawn; they are not buttons) and the "Mulai Menggambar" thumb. Both appear only once the lines and
 * their reading pause are done (MomoChat extrasFrom="last").
 */
import type { LevelDefinition } from "@/src/domain/levels";
import { Icon, objectIconFor } from "../ui/Icon";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import { FOCUS_START_LABEL } from "./canvas-focus";

export interface CanvasFocusExtrasProps {
  catalog: LevelDefinition["catalog"];
  /** The drawing surface's thumbs-up (camera mode); the ring never starts a second tracker. */
  externalThumbUp: boolean;
  onStart: () => void;
}

export function CanvasFocusExtras({ catalog, externalThumbUp, onStart }: CanvasFocusExtrasProps) {
  return (
    <>
      <ul className="canvas-focus__chips" aria-label="Benda yang bisa kamu gambar" data-testid="canvas-focus-chips">
        {catalog.map((item) => (
          <li key={item.labelId} className="canvas-focus__chip">
            <Icon name={objectIconFor(item.labelId)} size={26} stroke={2.2} />
            <span>{item.displayName}</span>
          </li>
        ))}
      </ul>
      <ThumbConfirm
        holdMs={1000}
        label={FOCUS_START_LABEL}
        onConfirm={onStart}
        externalThumbUp={externalThumbUp}
        className="canvas-focus__thumb"
        testId="btn-focus-start"
      />
    </>
  );
}
