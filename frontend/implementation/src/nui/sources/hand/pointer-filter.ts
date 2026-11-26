import {
  R1_ANCHOR_LANDMARK,
  R1_COMPUTE_WIDTH_PX,
  R1_CONTROL_BOX,
  R1_DEADZONE_PX,
  R1_DISPLAY_TAU_MS,
  R1_ONE_EURO_BETA,
  R1_ONE_EURO_BETA_PINCH,
  R1_ONE_EURO_D_CUTOFF,
  R1_ONE_EURO_MIN_CUTOFF,
  R1_T_GAP_MAX_MS,
} from "../../core/constants";
import { OneEuro1D, type OneEuroParams } from "./one-euro";

export interface Pt {
  x: number;
  y: number;
}
export interface Viewport {
  w: number;
  h: number;
}

/** Plan §5.3.4 (R1) — satu sumber di `src/nui/core/constants.ts`. */
export const POINTER_LANDMARK_INDEX = R1_ANCHOR_LANDMARK;
/** 5 titik kaku telapak tangan (pergelangan + 4 buku pangkal jari) agar kursor stabil & tidak goyang saat cubit. */
export const PALM_LANDMARK_INDICES = [0, 5, 9, 13, 17] as const;

export function computePalmCenter(lm: ReadonlyArray<Pt | undefined>): Pt | null {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const idx of PALM_LANDMARK_INDICES) {
    const p = lm[idx];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      sx += p.x;
      sy += p.y;
      count++;
    }
  }
  if (count > 0) return { x: sx / count, y: sy / count };
  const fallback = lm[POINTER_LANDMARK_INDEX] ?? lm[0];
  return fallback ? { x: fallback.x, y: fallback.y } : null;
}
export const POINTER_COMPUTE_WIDTH = R1_COMPUTE_WIDTH_PX;
export const POINTER_ONE_EURO: OneEuroParams = {
  minCutoff: R1_ONE_EURO_MIN_CUTOFF,
  beta: R1_ONE_EURO_BETA,
  dCutoff: R1_ONE_EURO_D_CUTOFF,
  maxGapMs: R1_T_GAP_MAX_MS,
};
export const POINTER_BETA_PINCH = R1_ONE_EURO_BETA_PINCH;
export const POINTER_DEADZONE_PX = R1_DEADZONE_PX;
export const CONTROL_BOX = R1_CONTROL_BOX;
export const DISPLAY_TAU_MS = R1_DISPLAY_TAU_MS;

const DEFAULT_ASPECT = 16 / 9;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const safeAspect = (aspect: number): number => (Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT);

/** Raw (unmirrored, normalized) MCP5 -> compute-space px (x mirrored). */
export function toComputeSpace(raw: Pt, aspect: number): Pt {
  const a = safeAspect(aspect);
  return { x: (1 - raw.x) * POINTER_COMPUTE_WIDTH, y: (raw.y * POINTER_COMPUTE_WIDTH) / a };
}

export function fromComputeSpace(p: Pt, aspect: number): Pt {
  const a = safeAspect(aspect);
  return { x: p.x / POINTER_COMPUTE_WIDTH, y: (p.y * a) / POINTER_COMPUTE_WIDTH };
}

/** Mirrored normalized point -> viewport px via control box, clamped. */
export function mapControlBox(mirrored: Pt, vp: Viewport): Pt {
  const nx = clamp01((mirrored.x - (1 - CONTROL_BOX.x1)) / (CONTROL_BOX.x1 - CONTROL_BOX.x0));
  const ny = clamp01((mirrored.y - CONTROL_BOX.y0) / (CONTROL_BOX.y1 - CONTROL_BOX.y0));
  return { x: nx * vp.w, y: ny * vp.h };
}

/** Soft ("rope") dead zone: anchor only moves when target is farther than radius. */
export function softDeadzone(anchor: Pt, target: Pt, radius: number): Pt {
  if (radius <= 0) return { x: target.x, y: target.y };
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const d = Math.hypot(dx, dy);
  if (d <= radius) return anchor;
  const k = (d - radius) / d;
  return { x: anchor.x + dx * k, y: anchor.y + dy * k };
}

/** Display chase: exponential approach with time constant tau, no extrapolation. */
export function chase(current: Pt, target: Pt, dtMs: number, tauMs = DISPLAY_TAU_MS): Pt {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return { x: current.x, y: current.y };
  if (!Number.isFinite(tauMs) || tauMs <= 0) return { x: target.x, y: target.y };
  const a = 1 - Math.exp(-dtMs / tauMs);
  return { x: current.x + (target.x - current.x) * a, y: current.y + (target.y - current.y) * a };
}

export interface PointerFilter {
  /** raw = unmirrored MCP5 normalized. Returns filtered viewport px. */
  update(raw: Pt, tMs: number, pinching: boolean, aspect: number, vp: Viewport): Pt;
  reset(): void;
}

export function createPointerFilter(): PointerFilter {
  const fx = new OneEuro1D({ ...POINTER_ONE_EURO });
  const fy = new OneEuro1D({ ...POINTER_ONE_EURO });
  let anchor: Pt | null = null;
  let lastT: number | null = null;
  return {
    update(raw, tMs, pinching, aspect, vp) {
      const beta = pinching ? POINTER_BETA_PINCH : POINTER_ONE_EURO.beta;
      fx.params.beta = beta;
      fy.params.beta = beta;
      if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y) || !Number.isFinite(tMs)) {
        fx.reset();
        fy.reset();
        anchor = null;
        lastT = null;
        return mapControlBox({ x: 0.5, y: 0.5 }, vp);
      }
      if (lastT !== null && tMs - lastT > POINTER_ONE_EURO.maxGapMs) {
        anchor = null;
      }
      if (lastT === null || tMs > lastT) {
        lastT = tMs;
      }
      const c = toComputeSpace(raw, aspect);
      const f = { x: fx.filter(c.x, tMs), y: fy.filter(c.y, tMs) };
      anchor = anchor ? softDeadzone(anchor, f, POINTER_DEADZONE_PX) : f;
      return mapControlBox(fromComputeSpace(anchor, aspect), vp);
    },
    reset() {
      fx.reset();
      fy.reset();
      anchor = null;
      lastT = null;
    },
  };
}