/**
 * Right-hand drawing toolbar. Each tool is a hand gesture drawn with the same glyph the tutorial teaches:
 * pinch to draw, open palm to erase, two swipes for undo and redo. Shown only while the student is drawing.
 */
import { Icon, type IconName } from "../ui/Icon";

interface ToolButtonProps {
  icon: IconName;
  label: string;
  ariaLabel: string;
  title: string;
  active?: boolean;
  extraClass?: string;
  onClick?: () => void;
}

function ToolButton({ icon, label, ariaLabel, title, active = false, extraClass, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`tool-btn nb-tool${active ? " is-active" : ""}${extraClass ? " " + extraClass : ""}`}
      aria-label={ariaLabel}
      aria-pressed={active ? true : undefined}
      title={title}
      onClick={onClick}
    >
      <Icon name={icon} size={30} stroke={2} />
      <span className="nb-tool__label">{label}</span>
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
    <aside className="nb-toolbar" role="toolbar" aria-label="Alat menggambar" style={{ display: visible ? undefined : "none" }}>
      <ToolButton icon="hand-draw" label="Gambar" ariaLabel="Gambar, gestur cubit" title="Gambar dengan cubitan jari" active />
      <ToolButton icon="hand-erase" label="Hapus" ariaLabel="Hapus" title="Hapus semua gambar" onClick={onClear} />
      <ToolButton icon="hand-undo" label="Mundur" ariaLabel="Undo Goresan" title="Mundur satu goresan" extraClass="undo-tool" onClick={onUndo} />
      <ToolButton icon="hand-redo" label="Maju" ariaLabel="Maju" title="Maju satu goresan" extraClass="redo-tool" onClick={onRedo} />
    </aside>
  );
}
