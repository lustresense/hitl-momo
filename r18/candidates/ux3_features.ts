/**
 * R18-UX3 Shared Feature Extractor (pure TS, 0-lookahead causal temporal window).
 * Used identically for training feature extraction and live browser / Node inference.
 */
import { thumbLateral, withAspect } from "../repo/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";

export const UX3_LABELS = [
  "NOG",
  "POINT_1F",
  "POINT_2F",
  "GRAB_FIST",
  "THROW_SWIPE",
  "OPEN_ZOOM",
] as const;
export type Ux3Label = (typeof UX3_LABELS)[number];

export const IPN_TO_UX3: Record<string, Ux3Label> = {
  NOG: "NOG",
  P1F: "POINT_1F",
  C1F: "POINT_1F",
  "2C1": "POINT_1F",
  P2F: "POINT_2F",
  C2F: "POINT_2F",
  "2C2": "POINT_2F",
  GRB: "GRAB_FIST",
  TUP: "THROW_SWIPE",
  TDN: "THROW_SWIPE",
  TLT: "THROW_SWIPE",
  TRT: "THROW_SWIPE",
  OP2: "OPEN_ZOOM",
  ZIN: "OPEN_ZOOM",
  ZOT: "OPEN_ZOOM",
};

export function mapIpnClass(cls: string): Ux3Label {
  return IPN_TO_UX3[cls] ?? "NOG";
}

export const UX3_FEATURE_NAMES: string[] = [];
for (let i = 1; i <= 20; i++) UX3_FEATURE_NAMES.push(`x${i}`, `y${i}`);
for (const f of ["thumb", "index", "middle", "ring", "pinky"]) UX3_FEATURE_NAMES.push(`reach_${f}`);
for (const f of ["thumb", "index", "middle", "ring", "pinky"]) UX3_FEATURE_NAMES.push(`bend_${f}`);
for (const f of ["thumb_index", "index_middle", "middle_ring", "ring_pinky"]) UX3_FEATURE_NAMES.push(`gap_${f}`);
UX3_FEATURE_NAMES.push(
  "thumb_index_tip",
  "thumb_lateral",
  "palm_aspect_ratio",
  "index_proj_ratio",
  "hand_size",
  "has_history",
  "wrist_speed",
  "wrist_vx",
  "wrist_vy",
  "tip8_speed",
  "pinch_delta",
  "index_reach_delta",
  "spread_delta",
  "shape_jitter",
);
export const UX3_FEATURE_COUNT = UX3_FEATURE_NAMES.length; // 68

const TIPS = [4, 8, 12, 16, 20] as const;
const BEND: ReadonlyArray<readonly [number, number, number]> = [
  [2, 3, 4], [5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20],
];

function jointAngle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) / Math.PI;
}

export interface Ux3FrameSnap {
  tMs: number;
  palmScale: number;
  wristX: number;
  wristY: number;
  tip8X: number;
  tip8Y: number;
  pinchNorm: number;
  idxReach: number;
  meanGap: number;
  localTips: Array<{ x: number; y: number }>;
}

/** Stateful 0-lookahead causal ring buffer (~100ms lag) per tracked video/stream. */
export class Ux3FeatureTracker {
  private ring: Ux3FrameSnap[] = [];

  reset(): void {
    this.ring = [];
  }

  /** Extract 68 features matching UX3_FEATURE_NAMES; returns null if hand is degenerate. */
  extract(lm: Landmark[] | undefined, nowMs: number, aspect: number): number[] | null {
    if (!lm || lm.length < 21) {
      this.ring = [];
      return null;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of lm) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        this.ring = [];
        return null;
      }
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const hs = Math.max(maxX - minX, maxY - minY);
    const g = withAspect(lm, aspect);
    const w = g[0]!;
    const m = g[9]!;
    const span = Math.hypot(m.x - w.x, m.y - w.y);
    const knuckle = Math.hypot(g[17]!.x - g[5]!.x, g[17]!.y - g[5]!.y);
    const palmScale = Math.max(span, knuckle);
    if (!(palmScale > 1e-4)) {
      this.ring = [];
      return null;
    }

    // Rotation unit vector (0->9 if valid, else perpendicular to 5->17)
    let ux = span > 1e-4 ? (m.x - w.x) / span : -(g[17]!.y - g[5]!.y) / palmScale;
    let uy = span > 1e-4 ? (m.y - w.y) / span : (g[17]!.x - g[5]!.x) / palmScale;
    const un = Math.hypot(ux, uy) || 1;
    ux /= un;
    uy /= un;

    const local = g.map((p) => {
      const dx = p.x - w.x;
      const dy = p.y - w.y;
      return { x: (dx * -uy + dy * ux) / palmScale, y: -(dx * ux + dy * uy) / palmScale };
    });
    const mirror = local[5]!.x > local[17]!.x ? -1 : 1;
    const L = local.map((p) => ({ x: p.x * mirror, y: p.y }));

    const f: number[] = [];
    for (let i = 1; i <= 20; i++) f.push(L[i]!.x, L[i]!.y);
    const reaches: number[] = [];
    for (const t of TIPS) {
      const r = Math.hypot(L[t]!.x, L[t]!.y);
      reaches.push(r);
      f.push(r);
    }
    for (const [a, b, c] of BEND) f.push(jointAngle(L[a]!, L[b]!, L[c]!));
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(L[TIPS[i]!]!.x - L[TIPS[i + 1]!]!.x, L[TIPS[i]!]!.y - L[TIPS[i + 1]!]!.y);
      gaps.push(d);
      f.push(d);
    }
    const pinchNorm = Math.hypot(L[4]!.x - L[8]!.x, L[4]!.y - L[8]!.y);
    f.push(pinchNorm);
    const tl = thumbLateral(g);
    f.push(Number.isFinite(tl) && tl !== null ? tl : 0);

    // Extra static cues
    f.push(span / palmScale);
    f.push(Math.hypot(g[8]!.x - g[5]!.x, g[8]!.y - g[5]!.y) / palmScale);
    f.push(hs);

    const meanGap = (gaps[0]! + gaps[1]! + gaps[2]! + gaps[3]!) * 0.25;
    const snap: Ux3FrameSnap = {
      tMs: nowMs,
      palmScale,
      wristX: w.x,
      wristY: w.y,
      tip8X: g[8]!.x,
      tip8Y: g[8]!.y,
      pinchNorm,
      idxReach: reaches[1]!,
      meanGap,
      localTips: TIPS.map((idx) => ({ x: L[idx]!.x, y: L[idx]!.y })),
    };

    // Prune stale history > 260ms, pick sample ~85..180ms back if present else oldest <= 260ms
    while (this.ring.length > 0 && nowMs - this.ring[0]!.tMs > 260) this.ring.shift();
    let prev: Ux3FrameSnap | null = null;
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
      f.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
    } else {
      const dtScale = Math.max(0.3, Math.min(2.6, (nowMs - prev.tMs) / 100));
      const wvx = (snap.wristX - prev.wristX) / palmScale / dtScale;
      const wvy = (snap.wristY - prev.wristY) / palmScale / dtScale;
      const t8s = Math.hypot(snap.tip8X - prev.tip8X, snap.tip8Y - prev.tip8Y) / palmScale / dtScale;
      let jitter = 0;
      for (let k = 0; k < 5; k++) {
        jitter += Math.hypot(snap.localTips[k]!.x - prev.localTips[k]!.x, snap.localTips[k]!.y - prev.localTips[k]!.y);
      }
      jitter = (jitter / 5) / dtScale;
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
      );
    }

    this.ring.push(snap);
    if (this.ring.length > 10) this.ring.shift();

    for (let i = 0; i < f.length; i++) {
      f[i] = Math.round(Math.max(-8, Math.min(8, f[i]!)) * 1e5) / 1e5;
    }
    return f;
  }
}
