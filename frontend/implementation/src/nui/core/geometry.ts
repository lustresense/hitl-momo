import { DIST_CENTER_WEIGHT, NEAREST_INIT } from "./constants";
import type { Rect } from "./types";

/** hand.js:61 jarak ke tepi kotak + 0,001 x jarak ke pusat. */
export function distanceToRect(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  return Math.hypot(dx, dy) + Math.hypot(cx - x, cy - y) * DIST_CENTER_WEIGHT;
}

/** hand.js:63 target terdekat; seri dimenangkan yang terdaftar lebih dulu. */
export function nearestItem<T>(list: readonly (readonly [T, Rect])[], x: number, y: number): T | null {
  let best: T | null = null;
  let bd = NEAREST_INIT;
  for (const [item, rect] of list) {
    const d = distanceToRect(rect, x, y);
    if (d < bd) {
      bd = d;
      best = item;
    }
  }
  return best;
}

export function rectContains(r: Rect, x: number, y: number, pad = 0): boolean {
  const p = pad > 0 ? pad : 0;
  return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
}

/**
 * Resep R1 (§5.3.4) hover lengket Mode B non-kanvas + partisi zona kamera (2-3 pilihan):
 * 1) Direct hit ke rect selalu menang agar klik/tunjuk langsung tetap akurat.
 * 2) Saat `viewport` diberikan dan ada 2-3 pilihan, bagi sumbu dominan viewport menjadi
 *    zona sama lebar dengan histeresis lebar agar tangan tidak bergetar antar pilihan.
 * 3) Fallback ke hover lengket `stickyPadPx` + `nearestItem`.
 */
export function pickHoverTarget<T>(
  pool: readonly (readonly [T, Rect])[],
  x: number,
  y: number,
  prev: T | null,
  stickyPadPx: number,
  viewport?: { readonly w: number; readonly h: number },
): T | null {
  const directHits = pool.filter(([, r]) => rectContains(r, x, y));
  if (directHits.length > 0) {
    if (prev !== null && directHits.some(([item]) => item === prev)) return prev;
    return nearestItem(directHits, x, y);
  }
  if (viewport && viewport.w > 0 && viewport.h > 0 && (pool.length === 2 || pool.length === 3)) {
    const items = pool.map(([item, r]) => ({
      item,
      cx: (r.left + r.right) / 2,
      cy: (r.top + r.bottom) / 2,
    }));
    const xs = items.map((e) => e.cx);
    const ys = items.map((e) => e.cy);
    const vertical = Math.max(...ys) - Math.min(...ys) >= Math.max(...xs) - Math.min(...xs);
    const sorted = [...items].sort((a, b) => (vertical ? a.cy - b.cy : a.cx - b.cx));
    const axisSize = vertical ? viewport.h : viewport.w;
    const n = sorted.length;
    const band = axisSize / n;
    const coord = Math.max(0, Math.min(axisSize, vertical ? y : x));
    const margin = Math.max(stickyPadPx, axisSize * 0.06);
    if (prev !== null) {
      const prevIdx = sorted.findIndex((e) => e.item === prev);
      if (prevIdx >= 0 && coord >= prevIdx * band - margin && coord <= (prevIdx + 1) * band + margin) {
        return prev;
      }
    }
    const idx = Math.min(n - 1, Math.max(0, Math.floor(coord / band)));
    const picked = sorted[idx];
    return picked ? picked.item : null;
  }
  if (prev !== null && stickyPadPx > 0) {
    const prevEntry = pool.find(([item]) => item === prev);
    if (prevEntry && rectContains(prevEntry[1], x, y, stickyPadPx)) return prev;
  }
  return nearestItem(pool, x, y);
}

export function rectVisible(r: Rect | null): r is Rect {
  return r !== null && r.right - r.left > 0 && r.bottom - r.top > 0;
}
