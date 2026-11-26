import { DRAG_START_PX } from "./constants";

export interface DragOptions {
  onStart?: () => void;
  /** Delta tangan dari titik cubit awal (benda ikut delta, bukan posisi absolut). */
  onMove?: (dx: number, dy: number) => void;
  onEnd?: () => void;
  threshold?: number;
}

export interface DragRelative {
  down(x: number, y: number, ok?: boolean, activeThreshold?: number): void;
  move(x: number, y: number): void;
  up(): void;
  dragging(): boolean;
}

/** Port tarik relatif place.js:76-88: cubit di mana saja, mulai setelah bergeser >= ambang. */
export function createDragRelative(o: DragOptions = {}): DragRelative {
  const threshold = o.threshold ?? DRAG_START_PX;
  let grab: { x: number; y: number; threshold: number } | null = null;
  let dragging = false;
  return {
    down(x, y, ok = true, activeThreshold?: number) {
      if (ok) {
        const eff = activeThreshold !== undefined && Number.isFinite(activeThreshold) && activeThreshold > 0
          ? activeThreshold
          : threshold;
        grab = { x, y, threshold: eff };
      }
    },
    move(x, y) {
      if (!grab) return;
      if (!dragging) {
        if (Math.hypot(x - grab.x, y - grab.y) < grab.threshold) return;
        dragging = true;
        o.onStart?.();
      }
      o.onMove?.(x - grab.x, y - grab.y);
    },
    up() {
      grab = null;
      if (!dragging) return;
      dragging = false;
      o.onEnd?.();
    },
    dragging: () => dragging,
  };
}
