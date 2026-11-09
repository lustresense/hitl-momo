/**
 * Right-hand drawing toolbar. Each tool is a hand gesture drawn with the same glyph the tutorial teaches:
 * pinch to draw, fist to erase, two fingers for undo and split palm for redo. Hapus is a tool (erase where you
 * drag), toggled with Gambar; it never clears the whole page. Shown only while the student is drawing.
 */
import { Icon, type IconName } from "../ui/Icon";

interface ToolButtonProps {
  icon: IconName;
  label: string;
  ariaLabel: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  extraClass?: string;
  onClick?: () => void;
}

function ToolButton({ icon, label, ariaLabel, title, active = false, disabled = false, extraClass, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`tool-btn nb-tool${active ? " is-active" : ""}${extraClass ? " " + extraClass : ""}`}
      aria-label={ariaLabel}
      aria-pressed={active ? true : undefined}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={30} stroke={2} />
      <span className="nb-tool__label">{label}</span>
    </button>
  );
}

export interface DrawingToolbarProps {
  /** The tools stay on screen for balance; they only work while the student is drawing. */
  enabled: boolean;
  /** Hapus tool is on: drags erase instead of draw. */
  erasing: boolean;
  /** Turn the Hapus tool on (true) or back to Gambar (false). */
  onErasingChange: (on: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function DrawingToolbar({ enabled, erasing, onErasingChange, onUndo, onRedo }: DrawingToolbarProps) {
  return (
    <aside className={`nb-toolbar${enabled ? "" : " is-idle"}`} role="toolbar" aria-label="Alat menggambar">
      <ToolButton icon="hand-draw" label="Gambar" ariaLabel="Gambar, gestur cubit" title="Gambar dengan cubitan jari" active={!erasing} disabled={!enabled} onClick={() => onErasingChange(false)} />
      <ToolButton icon="hand-erase" label="Hapus" ariaLabel="Hapus" title="Hapus bagian yang kamu geser, atau kepalkan tangan" active={erasing} extraClass="erase-tool" disabled={!enabled} onClick={() => onErasingChange(!erasing)} />
      <ToolButton icon="hand-undo" label="Mundur" ariaLabel="Undo Goresan" title="Mundur satu goresan" extraClass="undo-tool" disabled={!enabled} onClick={onUndo} />
      <ToolButton icon="hand-redo" label="Maju" ariaLabel="Maju" title="Maju satu goresan" extraClass="redo-tool" disabled={!enabled} onClick={onRedo} />
    </aside>
  );
}
