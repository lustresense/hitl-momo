/* Pure port of proto-html/r83/shared/ui.js: anchors (:52-61 + end.js:145-148),
   path sampling (momo.js:60-71), momoTo path (ui.js:63-71), placeBubble (ui.js:95-117),
   placeRing (ui.js:168-185), bold markup parser (ui.js:86-89), and throttle (ui.js:154-158). */

export const BUBBLE_REPLACE_MS = 200;
export const BUBBLE_GAP = 30;
export const RING_DEFAULT_W = 96;
export const RING_DEFAULT_H = 112;
export const RING_MARGIN = 8;
export const RING_GAP = 12;
export const RING_AVOID_PAD = 4;
export const RING_SLIDE_FACTORS = [-0.7, 0.7, -1.4, 1.4, -2.1, 2.1] as const;

export const ANCHOR_NAMES = ["corner", "side", "mid", "bottom", "strip", "ending"] as const;
export type AnchorName = (typeof ANCHOR_NAMES)[number];

export interface Pose { x: number; y: number; s: number; r: number }
export interface AnchorPoint { x: number; y: number; s: number }
export interface Base { w: number; h: number }
export interface Viewport { w: number; h: number }
export interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface PathPoint extends Pose { t: number }
export type EndingTarget = Pick<Rect, "right" | "top" | "height">;
export type BubbleSide = "left" | "right" | "up" | "down";
export type RingSide = "under" | "side";

export interface BubbleInput {
  anchor: AnchorName;
  momo: Rect;
  vp: Viewport;
  /** offsetWidth - width: padding + border measured from the real element (ui.js:108). */
  extra: number;
  /** offsetHeight after the width was applied. */
  height: number;
  /** Actual offsetWidth after width was applied (accounts for CSS !important widths, ui.js:113). */
  renderedWidth?: number;
  /** Optional explicit side override; omit for exact ui.js automatic placement. */
  sideOverride?: BubbleSide;
}

export interface BubbleLayout { left: number; top: number; width: number; side: BubbleSide; tailX?: number; tailY?: number }

export interface RingInput {
  anchor: Rect;
  vp: Viewport;
  /** Ring dimensions; defaults to 96 x 112 (ui.js:169). */
  ring?: { w: number; h: number };
  /** 'under' = below Momo's bubble; 'side' = beside an object/drawing/sticker (ui.js:164). */
  side?: RingSide;
  /** True when anchored to Momo's bubble sitting above her head (data-side="up", ui.js:176). */
  anchorIsBubbleUp?: boolean;
  /** Visible rects to avoid: hint chip, skip bar, camera PIP, and Momo's bubble. */
  avoid?: readonly (Rect | null | undefined)[];
}

export interface RingLayout { left: number; top: number }

export interface PlacementSignatureInput {
  pose: Readonly<Pose> | null;
  anchor: AnchorName;
  visible: boolean;
  textLength: number;
  hasExtra: boolean;
  vp: Viewport;
  extraKey?: string;
}

export interface BubbleSegment { text: string; bold: boolean }

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Build a Rect from [left, top, right, bottom] bounds (ui.js:189 rectAnchor). */
export function rectFromBounds(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Measure an element's live bounding rect only if visibly rendered (ui.js:173). */
export function measureLiveRect(el: Element | null | undefined): Rect | null {
  if (!el || typeof window === "undefined") return null;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return null;
  const b = el.getBoundingClientRect();
  return b.width > 0
    ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }
    : null;
}

/** Momo's base size follows the viewport (momo.js:108-111). */
export function momoBase(vp: Viewport): Base {
  const w = clamp(Math.round(Math.min(vp.w, vp.h * 1.78) * 0.122), 150, 260);
  return { w, h: Math.round((w * 2058) / 1389) };
}

/** All 6 Momo anchor positions from ui.js:52-61 and end.js:145-148. */
export function anchorPoint(name: AnchorName, vp: Viewport, b: Base, target?: EndingTarget): AnchorPoint {
  switch (name) {
    case "corner": {
      const s = 0.62;
      return { x: clamp(vp.w * 0.026, 24, 50) + (b.w * s) / 2, y: clamp(vp.h * 0.03, 22, 40) + (b.h * s) / 2, s };
    }
    case "side":
      return { x: vp.w * 0.16, y: vp.h * 0.5, s: 1 };
    case "mid": {
      const sc = clamp((vp.h * 0.3) / b.h, 0.55, 1), mw = b.w * sc;
      const bw = Math.min(clamp(vp.w * 0.3, 340, 460), vp.w - 24) + 42, total = mw + 30 + bw;
      return { x: clamp((vp.w - total) / 2 + mw / 2, mw / 2 + 12, vp.w - mw / 2 - 12), y: vp.h * 0.46, s: sc };
    }
    case "bottom": {
      const sc = clamp((vp.h * 0.3) / b.h, 0.5, 1);
      return { x: vp.w / 2, y: vp.h - (b.h * sc) / 2 - clamp(vp.h * 0.035, 20, 40), s: sc };
    }
    case "strip": {
      const s = 0.55;
      return { x: vp.w - clamp(vp.w * 0.02, 20, 40) - (b.w * s) / 2, y: vp.h - (b.h * s) / 2 - clamp(vp.h * 0.03, 20, 34), s };
    }
    case "ending": {
      const sc = clamp((vp.h * 0.27) / b.h, 0.5, 0.85), hw = (b.w * sc) / 2, hh = (b.h * sc) / 2;
      const t = target ?? { right: vp.w * 0.4, top: vp.h * 0.5, height: 0 };
      return { x: clamp(t.right + hw + 22, hw + 12, vp.w - hw - 12), y: clamp(t.top - t.height * 0.06, hh + 12, vp.h - hh - 12), s: sc };
    }
  }
}

/** Cubic Hermite through keyframes with zero end tangents (momo.js:60-71). */
export function samplePath(points: readonly PathPoint[], t: number): Pose {
  const first = points[0];
  if (!first) return { x: 0, y: 0, s: 1, r: 0 };
  if (points.length === 1) return { x: first.x, y: first.y, s: first.s, r: first.r };
  let j = 0;
  while (j < points.length - 2) {
    const nextKey = points[j + 1];
    if (!nextKey || t <= nextKey.t) break;
    j++;
  }
  const a = points[j] ?? first, b = points[j + 1] ?? a, d = b.t - a.t;
  const u = d > 0 ? clamp((t - a.t) / d, 0, 1) : t >= b.t ? 1 : 0, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const prev = points[Math.max(0, j - 1)] ?? a, next = points[Math.min(points.length - 1, j + 2)] ?? b;
  const calc = (k: keyof Pose): number => {
    const sa = j === 0 || b.t === prev.t ? 0 : (b[k] - prev[k]) / (b.t - prev.t);
    const sb = j === points.length - 2 || next.t === a.t ? 0 : (next[k] - a[k]) / (next.t - a.t);
    return h00 * a[k] + h10 * d * sa + h01 * b[k] + h11 * d * sb;
  };
  return { x: calc("x"), y: calc("y"), s: calc("s"), r: calc("r") };
}

/** Flight path for momoTo (ui.js:63-71); null when already within arrival tolerance. */
export function momoPath(from: Pose, to: AnchorPoint, tilt = 0): PathPoint[] | null {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 3 && Math.abs(from.s - to.s) < 0.02) return null;
  return [
    { t: 0, x: from.x, y: from.y, s: from.s, r: from.r },
    { t: 0.5, x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 26, s: (from.s + to.s) / 2, r: tilt },
    { t: 1, x: to.x, y: to.y, s: to.s, r: 0 },
  ];
}

/** Pure bubble placement ported 1:1 from proto-html/r83/shared/ui.js:95-117. */
export function placeBubble(i: BubbleInput): BubbleLayout {
  const { momo: mr, vp } = i, W = vp.w, H = vp.h;
  const verticalSide: "up" | "down" | null =
    i.sideOverride === "up" || i.sideOverride === "down"
      ? i.sideOverride
      : !i.sideOverride && i.anchor === "bottom"
        ? "up"
        : null;

  if (verticalSide) {
    const bw = Math.min(clamp(W * 0.42, 360, 600), W - 24);
    const left = clamp(mr.left + mr.width / 2 - bw / 2, 12, W - bw - 12);
    const top = clamp(verticalSide === "up" ? mr.top - i.height - 10 : mr.bottom + 10, 12, H - i.height - 12);
    return {
      left: Math.round(left), top: Math.round(top), width: bw, side: verticalSide,
      tailX: Math.round(clamp(mr.left + mr.width / 2 - left, 36, Math.max(36, bw - 36))),
    };
  }

  let bw = Math.min(clamp(W * 0.24, 300, 420), W - 24);
  const side: "left" | "right" =
    i.sideOverride === "left" || i.sideOverride === "right"
      ? i.sideOverride
      : i.anchor === "ending" || i.anchor === "mid"
        ? "left"
        : mr.left + mr.width / 2 < W * 0.55
          ? "left"
          : "right";

  let left: number;
  if (side === "left") {
    left = mr.right + BUBBLE_GAP;
    bw = Math.max(150, bw - (BUBBLE_GAP - 14));
    const room = W - left - 10 - i.extra;
    if (room < bw) bw = Math.max(150, room);
  } else {
    bw = Math.min(bw, Math.max(200 - i.extra, mr.left - BUBBLE_GAP - 10 - i.extra));
    left = Math.max(10, mr.left - (i.renderedWidth ?? bw + i.extra) - BUBBLE_GAP);
  }
  const top = clamp(mr.top + mr.height * 0.1, 12, H - i.height - 96);
  return {
    left: Math.round(left), top: Math.round(top), width: bw, side,
    tailY: Math.round(clamp(mr.top + mr.height * 0.3 - top, 34, Math.max(35, i.height - 34))),
  };
}

/** Pure ring placement ported 1:1 from proto-html/r83/shared/ui.js:168-185. */
export function placeRing(i: RingInput): RingLayout {
  const r = i.anchor, W = i.vp.w, H = i.vp.h;
  const w = i.ring?.w || RING_DEFAULT_W, h = i.ring?.h || RING_DEFAULT_H;
  const M = RING_MARGIN, GAP = RING_GAP, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const fits = (x: number, y: number): boolean => x >= M && y >= M && x + w <= W - M && y + h <= H - M;

  const avoid: Rect[] = [];
  if (i.avoid) {
    for (const a of i.avoid) if (a && a.width > 0) avoid.push(a);
  }
  const free = (x: number, y: number): boolean =>
    avoid.every((a) =>
      x + w + RING_AVOID_PAD <= a.left || x >= a.right + RING_AVOID_PAD ||
      y + h + RING_AVOID_PAD <= a.top || y >= a.bottom + RING_AVOID_PAD,
    );

  const candidates: Array<[number, number]> = i.side === "side"
    ? [[r.right + GAP, cy - h / 2], [r.left - GAP - w, cy - h / 2], [cx - w / 2, r.bottom + GAP], [cx - w / 2, r.top - GAP - h]]
    : i.anchorIsBubbleUp
      ? [[r.right + GAP, cy - h / 2], [r.left - GAP - w, cy - h / 2], [cx - w / 2, r.top - GAP - h], [cx - w / 2, r.bottom + GAP]]
      : [[cx - w / 2, r.bottom + GAP], [cx - w / 2, r.top - GAP - h], [r.right + GAP, cy - h / 2], [r.left - GAP - w, cy - h / 2]];

  for (const k of RING_SLIDE_FACTORS) {
    candidates.push([r.right + GAP, cy - h / 2 + k * h], [r.left - GAP - w, cy - h / 2 + k * h]);
  }
  const fallback = candidates[0] ?? [M, M];
  const chosen =
    candidates.find(([x, y]) => fits(x, y) && free(x, y)) ??
    candidates.find(([x, y]) => fits(x, y)) ??
    ([clamp(fallback[0], M, W - w - M), clamp(fallback[1], M, H - h - M)] as [number, number]);
  return { left: Math.round(chosen[0]), top: Math.round(chosen[1]) };
}

/** Deterministic signature mirroring ui.js:157 so layout only runs on state change or throttle expiry. */
export function placementSignature(i: PlacementSignatureInput): string {
  const p = i.pose;
  const posePart = p ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.s.toFixed(3)},${p.r.toFixed(2)}` : "no-pose";
  return `${posePart},${i.visible},${i.textLength},${i.hasExtra},${i.vp.w}x${i.vp.h},${i.anchor}${i.extraKey ? `,${i.extraKey}` : ""}`;
}

/** Re-place only when signature changed or `ms` (default 200 ms) elapsed (ui.js:154-158, §5.6). */
export function createPlacementThrottle(ms: number = BUBBLE_REPLACE_MS): (now: number, signature: string) => boolean {
  let lastAt = -Infinity, lastSig = "";
  return (now, signature) => {
    if (signature === lastSig && now - lastAt < ms) return false;
    lastAt = now;
    lastSig = signature;
    return true;
  };
}

/** Safe parser for `**bold**` markup without raw HTML injection (ui.js:86-89). Unclosed `**` stays literal. */
export function parseBubbleSegments(input: string): BubbleSegment[] {
  const parts = String(input).split("**");
  if (parts.length === 1) return parts[0] ? [{ text: parts[0], bold: false }] : [];
  const hasUnclosed = parts.length % 2 === 0;
  const limit = hasUnclosed ? parts.length - 1 : parts.length;
  const out: BubbleSegment[] = [];
  for (let i = 0; i < limit; i++) {
    const chunk = parts[i] ?? "";
    if (chunk) out.push({ text: chunk, bold: i % 2 === 1 });
  }
  if (hasUnclosed) {
    const tail = `**${parts[parts.length - 1] ?? ""}`;
    const prev = out[out.length - 1];
    if (prev && !prev.bold) prev.text += tail;
    else out.push({ text: tail, bold: false });
  }
  return out;
}
