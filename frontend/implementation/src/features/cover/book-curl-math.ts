export interface CurlPoint {
  readonly x: number;
  readonly y: number;
  readonly onCrease?: boolean;
}

export interface CurlGradientCoords {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface CurlFrameGeometry {
  readonly clamped: number;
  readonly frontVisible: boolean;
  readonly frontClipD: string;
  readonly rulerClipPath: string;
  readonly flapD: string;
  readonly flapOpacity: number;
  readonly shadowOpacity: number;
  readonly bendOpacity: number;
  readonly curlBackGrad: CurlGradientCoords;
  readonly greenBendGrad: CurlGradientCoords;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function smoothStep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * Pemotongan poligon setengah-bidang (Sutherland-Hodgman) untuk efek kelupas buku 3D.
 * Port persis dari `proto-html/r83/index.html:1014`.
 */
export function clipPolygon(
  poly: readonly CurlPoint[],
  distFn: (pt: CurlPoint) => number,
  keepNegative: boolean,
): CurlPoint[] {
  const out: CurlPoint[] = [];
  const inside = (d: number) => (keepNegative ? d <= 1e-4 : d >= -1e-4);

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dA = distFn(a);
    const dB = distFn(b);
    const inA = inside(dA);
    const inB = inside(dB);

    if (inA && inB) {
      out.push(b);
    } else if (inA && !inB) {
      const t = dA / (dA - dB);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), onCrease: true });
    } else if (!inA && inB) {
      const t = dA / (dA - dB);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), onCrease: true });
      out.push(b);
    }
  }
  return out;
}

function buildSmoothFlapPath(
  pts: readonly CurlPoint[],
  nx: number,
  ny: number,
  rollRadius: number,
  baseRadius: number,
): string {
  if (pts.length < 3) return "";
  const tx = -ny;
  const ty = nx;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  let dStr = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    if (i === 0) dStr += `M ${round2(p.x)} ${round2(p.y)} `;
    const mx = (p.x + q.x) * 0.5;
    const my = (p.y + q.y) * 0.5;
    const segLen = Math.hypot(q.x - p.x, q.y - p.y);
    if (p.onCrease && q.onCrease) {
      const bulge = rollRadius * 0.85;
      dStr += `Q ${round2(mx + nx * bulge)} ${round2(my + ny * bulge)} ${round2(q.x)} ${round2(q.y)} `;
    } else {
      const flex = Math.min(26, segLen * 0.055) * (baseRadius > 0 ? rollRadius / baseRadius : 0);
      const sign = (mx - cx) * tx + (my - cy) * ty >= 0 ? 1 : -1;
      dStr += `Q ${round2(mx + (nx * 0.45 + tx * sign * 0.55) * flex)} ${round2(my + (ny * 0.45 + ty * sign * 0.55) * flex)} ${round2(q.x)} ${round2(q.y)} `;
    }
  }
  return `${dStr}Z`;
}

/**
 * Menghitung geometri curl 3D diagonal dari pojok kanan bawah (`index.html:1016-1025`).
 */
export function computeCurlFrame(progress: number, width: number, height: number): CurlFrameGeometry {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const clamped = clamp01(progress);
  const zeroGrad: CurlGradientCoords = { x1: 0, y1: 0, x2: 0, y2: 0 };

  if (clamped <= 0.0005) {
    return {
      clamped,
      frontVisible: true,
      frontClipD: `M0,0 L${w},0 L${w},${h} L0,${h} Z`,
      rulerClipPath: "inset(100%)",
      flapD: "",
      flapOpacity: 0,
      shadowOpacity: 0,
      bendOpacity: 0,
      curlBackGrad: zeroGrad,
      greenBendGrad: zeroGrad,
    };
  }

  if (clamped >= 0.9995) {
    return {
      clamped,
      frontVisible: false,
      frontClipD: "M0,0 L0,0 L0,0 Z",
      rulerClipPath: "none",
      flapD: "",
      flapOpacity: 0,
      shadowOpacity: 0,
      bendOpacity: 0,
      curlBackGrad: zeroGrad,
      greenBendGrad: zeroGrad,
    };
  }

  const minDim = Math.min(w, h);
  const baseRadius = minDim * 0.07;
  const angle = (1 - clamped) * (Math.PI / 4);
  const nx = Math.sin(angle);
  const ny = Math.cos(angle);
  const maxDist = w * Math.sin(Math.PI / 4) + h * Math.cos(Math.PI / 4);
  const dist = maxDist * (1 - clamped);
  const midX = dist * nx;
  const midY = dist * ny;
  const distFn = (pt: CurlPoint) => pt.x * nx + pt.y * ny - dist;

  const corners: readonly CurlPoint[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  const frontPoly = clipPolygon(corners, distFn, true);
  const rollR = baseRadius * Math.sin(clamped * Math.PI);
  let frontClipD = "M0,0 L0,0 L0,0 Z";

  if (frontPoly.length >= 3) {
    let frontD = "";
    for (let i = 0; i < frontPoly.length; i++) {
      const a = frontPoly[i]!;
      const b = frontPoly[(i + 1) % frontPoly.length]!;
      if (i === 0) frontD += `M ${round2(a.x)} ${round2(a.y)} `;
      if (a.onCrease && b.onCrease) {
        const ctrlX = (a.x + b.x) * 0.5 + nx * (rollR * 0.85);
        const ctrlY = (a.y + b.y) * 0.5 + ny * (rollR * 0.85);
        frontD += `Q ${round2(ctrlX)} ${round2(ctrlY)} ${round2(b.x)} ${round2(b.y)} `;
      } else {
        frontD += `L ${round2(b.x)} ${round2(b.y)} `;
      }
    }
    frontClipD = `${frontD}Z`;
  }

  const peeledPoly = clipPolygon(corners, distFn, false);
  const rulerClipPath =
    peeledPoly.length >= 3
      ? `polygon(${peeledPoly.map((pt) => `${round2(pt.x)}px ${round2(pt.y)}px`).join(",")})`
      : "inset(100%)";

  if (peeledPoly.length < 3) {
    return {
      clamped,
      frontVisible: true,
      frontClipD,
      rulerClipPath,
      flapD: "",
      flapOpacity: 0,
      shadowOpacity: 0,
      bendOpacity: 0,
      curlBackGrad: zeroGrad,
      greenBendGrad: zeroGrad,
    };
  }

  let maxD = 0;
  const reflectedPoly = peeledPoly.map((pt) => {
    const d = Math.max(0, distFn(pt));
    if (d > maxD) maxD = d;
    return {
      x: pt.x - 2 * d * nx + nx * (rollR * 0.65),
      y: pt.y - 2 * d * ny + ny * (rollR * 0.65),
      onCrease: Boolean(pt.onCrease),
    };
  });

  const flapD = buildSmoothFlapPath(reflectedPoly, nx, ny, rollR, baseRadius);
  const fade = clamped < 0.06 ? clamped / 0.06 : clamped > 0.92 ? (1 - clamped) / 0.08 : 1;
  const gradSpan = Math.max(140, Math.min(maxD * 1.45, 560));
  const startX = midX + nx * (rollR * 0.85);
  const startY = midY + ny * (rollR * 0.85);

  return {
    clamped,
    frontVisible: true,
    frontClipD,
    rulerClipPath,
    flapD,
    flapOpacity: round2(fade),
    shadowOpacity: round2(fade * 0.85),
    bendOpacity: round2(fade * 0.9),
    curlBackGrad: {
      x1: round2(startX),
      y1: round2(startY),
      x2: round2(startX - nx * gradSpan),
      y2: round2(startY - ny * gradSpan),
    },
    greenBendGrad: {
      x1: round2(midX + nx * 12),
      y1: round2(midY + ny * 12),
      x2: round2(midX - nx * 240),
      y2: round2(midY - ny * 240),
    },
  };
}
