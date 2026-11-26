import { DRAG_START_PX, HOLD_MS_PLACE, PLACE_RING_DELAY_MS } from "@/src/nui/core/constants";

export const PLACEMENT_DRAG_START_PX = DRAG_START_PX;
export const PLACE_RING_HOLD_MS = HOLD_MS_PLACE;
export const DEFAULT_WORLD_BOUNDS = { width: 800, height: 450 } as const;

export interface PlacementPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlacementBox {
  readonly w: number;
  readonly h: number;
}

export interface PlacementBounds {
  readonly width: number;
  readonly height: number;
}

export interface PlacementState {
  readonly resting: boolean;
  readonly dragging: boolean;
  readonly ringVisible: boolean;
  readonly position: PlacementPoint;
  readonly box: PlacementBox;
}

export interface PlacementControllerOptions {
  readonly initial: PlacementPoint;
  readonly box: PlacementBox;
  readonly bounds?: PlacementBounds;
  readonly ringDelayMs?: number;
}

export interface PlacementController {
  getState(): PlacementState;
  subscribe(listener: (state: PlacementState) => void): () => void;
  markFalling(): void;
  markLanded(x: number, y: number, box?: PlacementBox): void;
  beginDrag(originX?: number, originY?: number, box?: PlacementBox): void;
  moveByDelta(dx: number, dy: number): PlacementPoint;
  setResolvedPosition(x: number, y: number): void;
  endDrag(): void;
  notifyRotated(position: PlacementPoint, box: PlacementBox): void;
  dispose(): void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clampPlacementToBounds(
  x: number,
  y: number,
  box: PlacementBox,
  bounds: PlacementBounds = DEFAULT_WORLD_BOUNDS,
): PlacementPoint {
  const maxX = Math.max(0, bounds.width - Math.max(0, box.w));
  const maxY = Math.max(0, bounds.height - Math.max(0, box.h));
  return {
    x: clamp(x, 0, maxX),
    y: clamp(y, 0, maxY),
  };
}

export function screenDeltaToWorldDelta(
  screenDx: number,
  screenDy: number,
  surfaceRect: { width: number; height: number },
  bounds: PlacementBounds = DEFAULT_WORLD_BOUNDS,
): { dx: number; dy: number } {
  const w = surfaceRect.width > 0 ? surfaceRect.width : bounds.width;
  const h = surfaceRect.height > 0 ? surfaceRect.height : bounds.height;
  return {
    dx: (screenDx * bounds.width) / w,
    dy: (screenDy * bounds.height) / h,
  };
}

/**
 * Pengendali murni penempatan benda (port place.js tanpa DOM).
 * Tarik relatif mengikuti delta (ambang 12 px di layer NUI, clamp batas panggung) +
 * timer diam PLACE_RING_DELAY_MS = 700 ms memunculkan ring "Taruh di sini" (1500 ms).
 */
export function createPlacementController(options: PlacementControllerOptions): PlacementController {
  const bounds = options.bounds ?? DEFAULT_WORLD_BOUNDS;
  const ringDelayMs = options.ringDelayMs ?? PLACE_RING_DELAY_MS;
  const listeners = new Set<(state: PlacementState) => void>();

  let box: PlacementBox = { ...options.box };
  let position: PlacementPoint = clampPlacementToBounds(options.initial.x, options.initial.y, box, bounds);
  let dragOrigin: PlacementPoint = { ...position };
  let resting = false;
  let dragging = false;
  let ringVisible = false;
  let disposed = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const snapshot = (): PlacementState => ({
    resting,
    dragging,
    ringVisible,
    position: { ...position },
    box: { ...box },
  });

  const emit = () => {
    if (disposed) return;
    const snap = snapshot();
    for (const listener of [...listeners]) listener(snap);
  };

  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const armRingTimer = () => {
    clearIdleTimer();
    if (disposed || dragging || !resting) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (disposed || dragging || !resting) return;
      if (!ringVisible) {
        ringVisible = true;
        emit();
      }
    }, ringDelayMs);
  };

  return {
    getState: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markFalling() {
      clearIdleTimer();
      resting = false;
      dragging = false;
      ringVisible = false;
      emit();
    },
    markLanded(x, y, nextBox) {
      if (nextBox) box = { ...nextBox };
      position = clampPlacementToBounds(x, y, box, bounds);
      resting = true;
      dragging = false;
      ringVisible = false;
      emit();
      armRingTimer();
    },
    beginDrag(originX, originY, nextBox) {
      clearIdleTimer();
      if (nextBox) box = { ...nextBox };
      const startX = originX ?? position.x;
      const startY = originY ?? position.y;
      position = clampPlacementToBounds(startX, startY, box, bounds);
      dragOrigin = { ...position };
      dragging = true;
      resting = false;
      ringVisible = false;
      emit();
    },
    moveByDelta(dx, dy) {
      position = clampPlacementToBounds(dragOrigin.x + dx, dragOrigin.y + dy, box, bounds);
      return { ...position };
    },
    setResolvedPosition(x, y) {
      position = clampPlacementToBounds(x, y, box, bounds);
    },
    endDrag() {
      if (!dragging) return;
      dragging = false;
      resting = true;
      ringVisible = false;
      emit();
      armRingTimer();
    },
    notifyRotated(nextPos, nextBox) {
      clearIdleTimer();
      box = { ...nextBox };
      position = clampPlacementToBounds(nextPos.x, nextPos.y, box, bounds);
      resting = true;
      ringVisible = false;
      emit();
      armRingTimer();
    },
    dispose() {
      clearIdleTimer();
      disposed = true;
      ringVisible = false;
      listeners.clear();
    },
  };
}
