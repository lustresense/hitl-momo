/**
 * Right-hand drawing toolbar: pinch-draw indicator, clear, undo and redo.
 * Shown only while the student is drawing.
 */
import type { ReactNode } from "react";

/** Hand-palm outline used by the undo and redo icons (starts at the last finger, ends in the thumb). */
const HAND_PALM_UNDO_REDO =
  "M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47";
/** Hand-palm outline tail used by the draw and clear icons; the leading "M17 <y>" differs per icon. */
const HAND_PALM_PLAIN =
  "a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47";

interface ToolButtonProps {
  className: string;
  label: string;
  title: string;
  ariaLabel: string;
  onClick?: () => void;
  children: ReactNode;
}

function ToolButton({ className, label, title, ariaLabel, onClick, children }: ToolButtonProps) {
  return (
    <button type="button" className={className} aria-label={ariaLabel} title={title} onClick={onClick}>
      <svg
        className="tool-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
      <span className="tool-label">{label}</span>
    </button>
  );
}

export interface DrawingToolbarProps {
  visible: boolean;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function DrawingToolbar({ visible, onClear, onUndo, onRedo }: DrawingToolbarProps) {
  return (
    <aside
      className="drawing-tools-right"
      role="toolbar"
      aria-label="Alat menggambar"
      style={{ display: visible ? undefined : "none" }}
    >
      <ToolButton
        className="tool-btn tool-btn-action active"
        ariaLabel="Gambar (Gesture Pinch)"
        title="Gambar (Gesture Pinch)"
        label="Gambar"
      >
        <path d="M8 13v-2.5a1.5 1.5 0 0 1 3 0v1" />
        <path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5" />
        <path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5" />
        <path d={`M17 11.5${HAND_PALM_PLAIN}`} />
        <circle cx="9.5" cy="7.5" r="2.5" />
      </ToolButton>

      <ToolButton
        className="tool-btn tool-btn-action"
        ariaLabel="Hapus"
        title="Hapus"
        label="Hapus"
        onClick={onClear}
      >
        <path d="M8 11v-3.5a1.5 1.5 0 0 1 3 0v2.5" />
        <path d="M11 9.5v-3a1.5 1.5 0 0 1 3 0v3.5" />
        <path d="M14 7.5a1.5 1.5 0 0 1 3 0v2.5" />
        <path d={`M17 9.5${HAND_PALM_PLAIN}`} />
      </ToolButton>

      <ToolButton
        className="tool-btn tool-btn-action undo-tool"
        ariaLabel="Undo Goresan"
        title="Mundur"
        label="Mundur"
        onClick={onUndo}
      >
        <path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5" />
        <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
        <path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5" />
        <path d={HAND_PALM_UNDO_REDO} />
      </ToolButton>

      <ToolButton
        className="tool-btn tool-btn-action redo-tool"
        ariaLabel="Maju"
        title="Maju"
        label="Maju"
        onClick={onRedo}
      >
        <path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5" />
        <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
        <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
        <path d={HAND_PALM_UNDO_REDO} />
      </ToolButton>
    </aside>
  );
}
