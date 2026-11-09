import type { DrawingInput, ObjectBehavior, StrokePoint } from "../domain/types";

export interface SketchRenderOptions {
  width: number;
  height: number;
  behavior: ObjectBehavior;
  label?: string;
  /** Raster supersampling for crisp rendering: width/height attributes scale, viewBox stays in box units. Default 1. */
  pixelScale?: number;
  /**
   * "card" (default) puts the paper cut-out behind the ink, as the entry popup shows it.
   * "none" draws only the student's ink, which is how an object looks in the world.
   */
  frame?: "card" | "none";
}

/**
 * Transforms normalized student strokes into an authentic tactile SVG sprite.
 *
 * Requirements (Mandat Section 2 & 7.1):
 * - Siswa harus merasa bahwa objek yang masuk ke dunia adalah HASIL GAMBAR MEREKA SENDIRI.
 * - Mempertahankan goresan asli siswa sepanjang transisi Draw -> World.
 * - Menggunakan raster/SVG transparan dengan texture coretan asli, sementara collider fisik tetap stabil.
 */

// Constants for validation and safe rendering
const MIN_DIMENSION = 1;
const MAX_DIMENSION = 2000;
const MAX_STROKES = 50;
const MAX_POINTS_PER_STROKE = 200;
const DOT_RADIUS = 2;
/** The ink colour of the drawing pad, so the world looks like the student's own page. */
const INK = "#23211d";
/** Extents below this (in normalised units) count as "no size": shown as a dot, never stretched to the box. */
const MIN_SPAN = 1e-3;
/** Ink thickness follows the box height, clamped so it reads on a thin plank and stays crisp on a big card. */
const INK_WIDTH_RATIO = 0.16;
const MIN_INK_WIDTH = 2.5;
const MAX_INK_WIDTH = 3.5;

function clampDimension(value: number): number {
  return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.round(value)));
}

function sanitizeStroke(stroke: StrokePoint[]): StrokePoint[] {
  return stroke
    .filter((pt) => typeof pt.x === "number" && typeof pt.y === "number" && Number.isFinite(pt.x) && Number.isFinite(pt.y))
    .map((pt) => ({
      x: Math.max(0, Math.min(1, pt.x)),
      y: Math.max(0, Math.min(1, pt.y)),
    }))
    .slice(0, MAX_POINTS_PER_STROKE);
}

/** One ink mark in box units: a polyline, or a single point that is drawn as a dot. */
export type InkMark = StrokePoint[];

/**
 * Fits the student's strokes into a box: one shared scale keeps the drawing's proportions and the
 * result is centred. Pure (no DOM, no KAPLAY), so the fit can be checked on exact numbers.
 *
 * `inset` keeps the ink away from the box edge (half a stroke plus a little), so a drawn line never
 * leaves the collision box it belongs to.
 */
export function fitInkToBox(
  strokes: StrokePoint[][] | null | undefined,
  box: { w: number; h: number },
  options: { inset?: number } = {},
): InkMark[] {
  const cleaned = (strokes ?? []).slice(0, MAX_STROKES).map(sanitizeStroke).filter((st) => st.length > 0);
  if (cleaned.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const st of cleaned) {
    for (const pt of st) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const inset = Math.max(0, options.inset ?? 0);
  const drawW = Math.max(0, box.w - 2 * inset);
  const drawH = Math.max(0, box.h - 2 * inset);

  // An axis with no real extent collapses onto the centre line instead of blowing the drawing up.
  const fitX = spanX > MIN_SPAN ? drawW / spanX : Infinity;
  const fitY = spanY > MIN_SPAN ? drawH / spanY : Infinity;
  const fit = Math.min(fitX, fitY);
  const scale = Number.isFinite(fit) ? fit : 0;
  const kx = spanX > MIN_SPAN ? scale : 0;
  const ky = spanY > MIN_SPAN ? scale : 0;
  const x0 = inset + (drawW - spanX * kx) / 2;
  const y0 = inset + (drawH - spanY * ky) / 2;
  return cleaned.map((st) => st.map((pt) => ({ x: x0 + (pt.x - minX) * kx, y: y0 + (pt.y - minY) * ky })));
}

/** Two decimals and never negative: a "-0.00" coordinate would look like a bug in the markup. */
const fmt = (v: number) => Math.max(0, v).toFixed(2);

function inkMarkSvg(mark: InkMark, strokeWidth: number): string {
  if (mark.length === 1) {
    const pt = mark[0]!;
    return `<circle cx="${fmt(pt.x)}" cy="${fmt(pt.y)}" r="${DOT_RADIUS}" fill="${INK}" />`;
  }
  const d = mark.map((pt, i) => `${i === 0 ? "M" : "L"} ${fmt(pt.x)} ${fmt(pt.y)}`).join(" ");
  return `<path d="${d}" stroke="${INK}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
}

export function generateSketchSvg(
  input: DrawingInput | null,
  options: SketchRenderOptions,
): string {
  const { width, height, behavior } = options;
  const safeW = clampDimension(width);
  const safeH = clampDimension(height);
  const pixelScale = Math.max(1, Math.min(8, options.pixelScale ?? 1));
  const framed = options.frame !== "none";

  // Determine palette based on behavior
  const bgFill =
    behavior === "solid"
      ? "#edd9be" // Warm craft-paper / wood-cardboard tone
      : behavior === "danger"
        ? "#f8d5cb" // Caution red-tinted papercraft
        : "#e5e9ec"; // Neutral sketch gray

  const borderColor =
    behavior === "solid"
      ? "#8c6b45"
      : behavior === "danger"
        ? "#c0392b"
        : "#7f8c8d";

  const strokeWidth = Math.min(MAX_INK_WIDTH, Math.max(MIN_INK_WIDTH, safeH * INK_WIDTH_RATIO));
  // Keep the ink's outer edge inside the box; capped at a quarter of the box so tiny boxes stay drawable.
  const inset = Math.min(strokeWidth / 2 + 0.5, Math.min(safeW, safeH) / 4);
  const marks = fitInkToBox(input?.strokes, { w: safeW, h: safeH }, { inset });

  let strokesSvg: string;
  if (marks.length > 0) {
    strokesSvg = marks.map((mark) => inkMarkSvg(mark, strokeWidth)).join("\n    ");
  } else {
    // No usable ink: a dashed placeholder line, in the object's colour when there is no card around it.
    const midY = (safeH / 2).toFixed(1);
    const placeholderColour = framed ? INK : borderColor;
    strokesSvg = `<line x1="${(safeW * 0.2).toFixed(1)}" y1="${midY}" x2="${(safeW * 0.8).toFixed(1)}" y2="${midY}" stroke="${placeholderColour}" stroke-width="2.5" stroke-dasharray="4 2" />`;
  }

  const card = framed
    ? `
  <defs>
    <filter id="paper-shadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#111" flood-opacity="0.18" />
    </filter>
  </defs>
  <!-- Papercraft cutout backing -->
  <rect x="1" y="1" width="${safeW - 2}" height="${safeH - 2}" rx="3" ry="3" fill="${bgFill}" stroke="${borderColor}" stroke-width="1.8" filter="url(#paper-shadow)" />

  <!-- Subtle tactile texture lines -->
  <line x1="4" y1="${safeH - 3}" x2="${safeW - 4}" y2="${safeH - 3}" stroke="${borderColor}" stroke-width="0.8" stroke-opacity="0.4" stroke-dasharray="3 3" />`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeW * pixelScale}" height="${safeH * pixelScale}" viewBox="0 0 ${safeW} ${safeH}">${card}
  <!-- Student original hand-drawn ink strokes -->
  <g class="student-strokes">
    ${strokesSvg}
  </g>
</svg>`;
}

export function generateSketchDataUri(
  input: DrawingInput | null,
  options: SketchRenderOptions,
): string {
  const svg = generateSketchSvg(input, options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
