import {
  R1_CLICK_ROLLBACK_MS,
  R1_HOVER_LOOKBACK_MS,
  R1_ROLLBACK_WINDOW_MS,
} from "../../core/constants";
import type { Pt } from "./pointer-filter";

export const ROLLBACK_WINDOW_MS = R1_ROLLBACK_WINDOW_MS;
export const CLICK_ROLLBACK_MS = R1_CLICK_ROLLBACK_MS;
export const HOVER_LOOKBACK_MS = R1_HOVER_LOOKBACK_MS;

export interface RollbackEntry extends Pt {
  t: number;
  hoverId?: string | null;
}

export interface RollbackBuffer {
  push(e: RollbackEntry): void;
  /** Position at time t (linear interpolation, clamped to buffer range). */
  pointAt(t: number): Pt | null;
  /** Most frequent hoverId within [tEnd-spanMs, tEnd]. */
  mostHovered(tEnd: number, spanMs?: number): string | null;
  clear(): void;
  size(): number;
}

/** Convenience helper: pointer position at `t(PINCH_ON) - CLICK_ROLLBACK_MS` (Plan §5.3.4). */
export function clickPointAt(buf: RollbackBuffer, pinchOnMs: number, rollbackMs = CLICK_ROLLBACK_MS): Pt | null {
  return buf.pointAt(pinchOnMs - rollbackMs);
}

export function createRollbackBuffer(windowMs = ROLLBACK_WINDOW_MS): RollbackBuffer {
  let buf: RollbackEntry[] = [];
  return {
    push(e) {
      if (!Number.isFinite(e.t) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
      const last = buf[buf.length - 1];
      if (last && e.t < last.t) return;
      buf.push({ x: e.x, y: e.y, t: e.t, hoverId: e.hoverId });
      const cut = e.t - windowMs;
      while (buf.length > 1 && (buf[0] as RollbackEntry).t < cut) buf.shift();
    },
    pointAt(t) {
      const first = buf[0];
      const last = buf[buf.length - 1];
      if (!first || !last) return null;
      if (t <= first.t) return { x: first.x, y: first.y };
      if (t >= last.t) return { x: last.x, y: last.y };
      for (let i = 1; i < buf.length; i++) {
        const b = buf[i] as RollbackEntry;
        const a = buf[i - 1] as RollbackEntry;
        if (t <= b.t) {
          const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        }
      }
      return { x: last.x, y: last.y };
    },
    mostHovered(tEnd, spanMs = HOVER_LOOKBACK_MS) {
      const counts = new Map<string, number>();
      let best: string | null = null;
      let bestN = 0;
      for (const e of buf) {
        if (e.t < tEnd - spanMs || e.t > tEnd || !e.hoverId) continue;
        const n = (counts.get(e.hoverId) ?? 0) + 1;
        counts.set(e.hoverId, n);
        if (n >= bestN) {
          bestN = n;
          best = e.hoverId;
        }
      }
      return best;
    },
    clear() {
      buf = [];
    },
    size() {
      return buf.length;
    },
  };
}
