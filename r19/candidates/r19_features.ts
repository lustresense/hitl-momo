/**
 * R19 Pistol-Aware Causal Feature Extractor (pure TS, 2D aspect-corrected, 0-lookahead).
 *
 * Improvements over R18 (`ux3_features.ts`, 68 dims):
 *  - Fixes `thumbLateral()` knuckle-collapse blowup on dorsal/rolled hands by clamping and
 *    augmenting with orientation-invariant thumb-to-palm/index distances (`d4_5`, `d4_6`, `d4_9`,
 *    `d4_10`, `d4_2`, `d4_17`), radial separation from index ray `5->8`, abduction angles
 *    (`8-5-4`, `5-2-4`), thumb CMC/MCP bend (`1-2-3`), `knuckle_span_ratio`, and `d4_8/d5_8`.
 *  - Adds causal `thumb_open_delta` (~100 ms ring buffer) to capture `POINT_READY <-> POINT_PRESS`
 *    transitions without lookahead while cleanly outputting `has_history = 0` on static frames.
 */
import { thumbLateral, withAspect, type Landmark } from "./pistol_types";

export const R19_LABELS = ["POINT_READY", "POINT_PRESS", "OTHER"] as const;
export type R19Label = (typeof R19_LABELS)[number];

export const R19_FEATURE_NAMES: string[] = [];
for (let i = 1; i <= 20; i++) R19_FEATURE_NAMES.push(`x${i}`, `y${i}`);
for (const f of ["thumb", "index", "middle", "ring", "pinky"]) R19_FEATURE_NAMES.push(`reach_${f}`);
for (const f of ["thumb", "index", "middle", "ring", "pinky"]) R19_FEATURE_NAMES.push(`bend_${f}`);
for (const f of ["thumb_index", "index_middle", "middle_ring", "ring_pinky"]) R19_FEATURE_NAMES.push(`gap_${f}`);
R19_FEATURE_NAMES.push(
  "thumb_index_tip",
  "thumb_lateral_clamped",
  "palm_aspect_ratio",
  "knuckle_span_ratio",
  "index_proj_ratio",
  "thumb_over_index_reach",
  "d4_5",
  "d4_6",
  "d4_9",
  "d4_10",
  "d4_2",
  "d4_17",
  "thumb_perp_idx",
  "thumb_along_idx",
  "thumb_abduct_854",
  "thumb_abduct_524",
  "thumb_bend_123",
  "d4_8_over_d5_8",
  "has_history",
  "wrist_speed",
  "wrist_vx",
  "wrist_vy",
  "tip8_speed",
  "pinch_delta",
  "index_reach_delta",
  "spread_delta",
  "shape_jitter",
  "thumb_open_delta",
);
export const R19_FEATURE_COUNT = R19_FEATURE_NAMES.length; // 82

const TIPS = [4, 8, 12, 16, 20] as const;
const BEND: ReadonlyArray<readonly [number, number, number]> = [
  [2, 3, 4],
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

function jointAngleNorm(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-9) return 0;
  return Math.acos(clamp((v1x * v2x + v1y * v2y) / n, -1, 1)) / Math.PI;
}

export interface R19FrameSnap {
  tMs: number;
  palmScale: number;
  wristX: number;
  wristY: number;
  tip8X: number;
  tip8Y: number;
  pinchNorm: number;
  idxReach: number;
  meanGap: number;
  thumbOpenCue: number;
  localTips: Array<{ x: number; y: number }>;
}

/** Stateful 0-lookahead causal ring buffer (~85..180 ms lookback) for R19 feature extraction. */
export class R19FeatureTracker {
  private ring: R19FrameSnap[] = [];

  reset(): void {
    this.ring = [];
  }

  /** Extract 82 causal features for a single frame (or static image when reset between images). */
  extract(lm: Landmark[] | undefined, nowMs: number, aspect: number): number[] | null {
    if (!lm || lm.length < 21) {
      this.ring = [];
      return null;
    }
    for (let i = 0; i < 21; i++) {
      const p = lm[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        this.ring = [];
        return null;
      }
    }
    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const g = withAspect(lm, a);
    const w = g[0]!;
    const m = g[9]!;
    const span = dist2(m, w);
    const knuckle = dist2(g[17]!, g[5]!);
    const palmScale = Math.max(span, knuckle);
    if (!(palmScale > 1e-4)) {
      this.ring = [];
      return null;
    }

    let ux = span > 1e-4 ? (m.x - w.x) / span : -(g[17]!.y - g[5]!.y) / palmScale;
    let uy = span > 1e-4 ? (m.y - w.y) / span : (g[17]!.x - g[5]!.x) / palmScale;
    const un = Math.hypot(ux, uy) || 1;
    ux /= un;
    uy /= un;

    const local = new Array<{ x: number; y: number }>(21);
    for (let i = 0; i < 21; i++) {
      const p = g[i]!;
      const dx = p.x - w.x;
      const dy = p.y - w.y;
      local[i] = { x: (dx * -uy + dy * ux) / palmScale, y: -(dx * ux + dy * uy) / palmScale };
    }
    const mirror = local[5]!.x > local[17]!.x ? -1 : 1;
    const L = mirror === 1 ? local : local.map((p) => ({ x: -p.x, y: p.y }));

    const f: number[] = [];
    for (let i = 1; i <= 20; i++) f.push(L[i]!.x, L[i]!.y);

    const reaches: number[] = [];
    for (const t of TIPS) {
      const r = Math.hypot(L[t]!.x, L[t]!.y);
      reaches.push(r);
      f.push(r);
    }
    for (const [ia, ib, ic] of BEND) f.push(jointAngleNorm(L[ia]!, L[ib]!, L[ic]!));

    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const d = dist2(L[TIPS[i]!]!, L[TIPS[i + 1]!]!);
      gaps.push(d);
      f.push(d);
    }

    const pinchNorm = dist2(L[4]!, L[8]!);
    const tlRaw = thumbLateral(g);
    const tlClamped = tlRaw !== null && Number.isFinite(tlRaw) ? clamp(tlRaw, -4.0, 4.0) : 0;
    const d5_8 = dist2(L[5]!, L[8]!);

    const d4_5 = dist2(L[4]!, L[5]!);
    const d4_6 = dist2(L[4]!, L[6]!);
    const d4_9 = dist2(L[4]!, L[9]!);
    const d4_10 = dist2(L[4]!, L[10]!);
    const d4_2 = dist2(L[4]!, L[2]!);
    const d4_17 = dist2(L[4]!, L[17]!);

    // Normalized index ray L[5] -> L[8] (fallback L[5] -> L[6] -> palm Y).
    let rdx = L[8]!.x - L[5]!.x;
    let rdy = L[8]!.y - L[5]!.y;
    let rLen = Math.hypot(rdx, rdy);
    if (rLen < 0.08) {
      rdx = L[6]!.x - L[5]!.x;
      rdy = L[6]!.y - L[5]!.y;
      rLen = Math.hypot(rdx, rdy);
    }
    const rx = rLen > 1e-5 ? rdx / rLen : 0;
    const ry = rLen > 1e-5 ? rdy / rLen : 1;
    const v54x = L[4]!.x - L[5]!.x;
    const v54y = L[4]!.y - L[5]!.y;
    const thumbPerpIdx = Math.abs(rx * v54y - ry * v54x);
    const thumbAlongIdx = rx * v54x + ry * v54y;

    f.push(
      pinchNorm,
      tlClamped,
      span / palmScale,
      knuckle / palmScale,
      d5_8,
      clamp(reaches[0]! / Math.max(0.25, reaches[1]!), 0, 2.5),
      d4_5,
      d4_6,
      d4_9,
      d4_10,
      d4_2,
      d4_17,
      thumbPerpIdx,
      thumbAlongIdx,
      jointAngleNorm(L[8]!, L[5]!, L[4]!),
      jointAngleNorm(L[5]!, L[2]!, L[4]!),
      jointAngleNorm(L[1]!, L[2]!, L[3]!),
      clamp(pinchNorm / Math.max(0.1, d5_8), 0, 3),
    );

    const meanGap = (gaps[0]! + gaps[1]! + gaps[2]! + gaps[3]!) * 0.25;
    const thumbOpenCue = 0.5 * (d4_5 + d4_9);
    const snap: R19FrameSnap = {
      tMs: nowMs,
      palmScale,
      wristX: w.x,
      wristY: w.y,
      tip8X: g[8]!.x,
      tip8Y: g[8]!.y,
      pinchNorm,
      idxReach: reaches[1]!,
      meanGap,
      thumbOpenCue,
      localTips: TIPS.map((idx) => ({ x: L[idx]!.x, y: L[idx]!.y })),
    };

    while (this.ring.length > 0 && nowMs - this.ring[0]!.tMs > 260) this.ring.shift();
    let prev: R19FrameSnap | null = null;
    for (let i = this.ring.length - 1; i >= 0; i--) {
      if (nowMs - this.ring[i]!.tMs >= 80) {
        prev = this.ring[i]!;
        break;
      }
    }
    if (!prev && this.ring.length > 0 && nowMs - this.ring[0]!.tMs >= 25) {
      prev = this.ring[0]!;
    }

    if (!prev) {
      f.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    } else {
      const dtScale = Math.max(0.3, Math.min(2.6, (nowMs - prev.tMs) / 100));
      const wvx = (snap.wristX - prev.wristX) / palmScale / dtScale;
      const wvy = (snap.wristY - prev.wristY) / palmScale / dtScale;
      const t8s = Math.hypot(snap.tip8X - prev.tip8X, snap.tip8Y - prev.tip8Y) / palmScale / dtScale;
      let jitter = 0;
      for (let k = 0; k < 5; k++) {
        jitter += Math.hypot(snap.localTips[k]!.x - prev.localTips[k]!.x, snap.localTips[k]!.y - prev.localTips[k]!.y);
      }
      jitter = jitter / 5 / dtScale;
      f.push(
        1,
        Math.hypot(wvx, wvy),
        wvx,
        wvy,
        t8s,
        (snap.pinchNorm - prev.pinchNorm) / dtScale,
        (snap.idxReach - prev.idxReach) / dtScale,
        (snap.meanGap - prev.meanGap) / dtScale,
        jitter,
        (snap.thumbOpenCue - prev.thumbOpenCue) / dtScale,
      );
    }

    this.ring.push(snap);
    if (this.ring.length > 10) this.ring.shift();

    for (let i = 0; i < f.length; i++) {
      if (!Number.isFinite(f[i]!)) return null;
    }
    return f;
  }
}
