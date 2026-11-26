/**
 * Rasterised stroke-shape collider for student creations (O-6 / P7b).
 * Ported from proto-html/r83/shared/level/shape.js:
 *  - Fits normalised strokes using the same fitInkToBox / inkInset / inkStrokeWidth as the SVG renderer.
 *  - Rotates fitted ink by creation angle (0 | 90 | 180 | 270) around the box centre.
 *  - Rasterises stroke thickness onto a fine grid and flood-fills from the border so
 *    closed loops (even multi-stroke) become solid inside while open hollows & empty corners stay empty.
 *  - Merges cells horizontally and vertically into minimal Rect[] in box-local [0..w] x [0..h] coords.
 *
 * Pure (no DOM, no KAPLAY). Falls back to box / hazardZone when strokes are absent or useShape=false.
 */
import type { WorldCreation } from "../creation-store";
import type { Rect } from "../stage-geometry";
import { fitInkToBox, inkInset, inkStrokeWidth } from "../sketch-renderer";
import { footprintOf } from "./creations";
import { hazardZone } from "./footprint";

/** Sandbox shape.js reference constants in stage source units (490x325 art grid). */
export const SHAPE_SOURCE_STROKE_WIDTH = 3.2;
export const SHAPE_SOURCE_CELL = 0.5;
const DEFAULT_CELL_WORLD = 1;
const MIN_CELL_WORLD = 0.5;

export interface ShapeRasterOptions {
  readonly cellSize?: number;
  readonly strokeWidth?: number;
}

export interface ShapeColliderResult {
  readonly rects: readonly Rect[];
  readonly bbox: Rect;
}

function rotatePoint(
  x: number,
  y: number,
  w0: number,
  h0: number,
  angle: 0 | 90 | 180 | 270,
): readonly [number, number] {
  const cx = w0 / 2;
  const cy = h0 / 2;
  const dx = x - cx;
  const dy = y - cy;
  switch (angle) {
    case 90:
      return [h0 / 2 - dy, w0 / 2 + dx];
    case 180:
      return [w0 / 2 - dx, h0 / 2 - dy];
    case 270:
      return [h0 / 2 + dy, w0 / 2 - dx];
    default:
      return [x, y];
  }
}

function stampSegment(
  grid: Uint8Array,
  cols: number,
  rows: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radCells: number,
): void {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radCells));
  const x1 = Math.min(cols - 1, Math.ceil(Math.max(ax, bx) + radCells));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radCells));
  const y1 = Math.min(rows - 1, Math.ceil(Math.max(ay, by) + radCells));
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const radSq = radCells * radCells;

  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const px = i + 0.5 - ax;
      const py = j + 0.5 - ay;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq)) : 0;
      const ex = px - t * dx;
      const ey = py - t * dy;
      if (ex * ex + ey * ey <= radSq) grid[j * cols + i] = 1;
    }
  }
}

function floodFillOutside(ink: Uint8Array, cols: number, rows: number): Uint8Array {
  const outside = new Uint8Array(cols * rows);
  const stack: number[] = [];
  const push = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return;
    const idx = j * cols + i;
    if (ink[idx] || outside[idx]) return;
    outside[idx] = 1;
    stack.push(i, j);
  };
  for (let i = 0; i < cols; i++) {
    push(i, 0);
    push(i, rows - 1);
  }
  for (let j = 0; j < rows; j++) {
    push(0, j);
    push(cols - 1, j);
  }
  while (stack.length > 0) {
    const j = stack.pop()!;
    const i = stack.pop()!;
    push(i + 1, j);
    push(i - 1, j);
    push(i, j + 1);
    push(i, j - 1);
  }
  return outside;
}

function mergeSolidRects(
  outside: Uint8Array,
  cols: number,
  rows: number,
  cell: number,
  padPx: number,
  boxW: number,
  boxH: number,
): Rect[] {
  const rects: Rect[] = [];
  let open = new Map<string, Rect>();

  for (let j = 0; j < rows; j++) {
    const next = new Map<string, Rect>();
    let i = 0;
    while (i < cols) {
      if (outside[j * cols + i]) {
        i++;
        continue;
      }
      const i0 = i;
      while (i < cols && !outside[j * cols + i]) i++;
      const x0 = Math.max(0, i0 * cell - padPx);
      const x1 = Math.min(boxW, i * cell - padPx);
      const y0 = Math.max(0, j * cell - padPx);
      const y1 = Math.min(boxH, (j + 1) * cell - padPx);
      if (x1 <= x0 || y1 <= y0) continue;

      const key = `${i0},${i}`;
      const existing = open.get(key);
      if (existing && Math.abs(existing.y + existing.h - y0) < 1e-6) {
        existing.h += y1 - y0;
        next.set(key, existing);
      } else {
        const nr: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        rects.push(nr);
        next.set(key, nr);
      }
    }
    open = next;
  }
  return rects;
}

/**
 * Rasterises a creation's normalised ink strokes into solid (or hazard) rectangles in box-local
 * `[0..rotBox.w] x [0..rotBox.h]` coords. Falls back to the full rotated box when strokes are empty.
 */
export function rasterizeCreationShape(
  item: Pick<WorldCreation, "w" | "h" | "angle" | "drawingInput">,
  options: ShapeRasterOptions = {},
): ShapeColliderResult {
  const rot = (item.angle ?? 0) as 0 | 90 | 180 | 270;
  const rotBox = footprintOf({ x: 0, y: 0, w: item.w, h: item.h, angle: rot });
  const fallback: ShapeColliderResult = {
    rects: [{ x: 0, y: 0, w: rotBox.w, h: rotBox.h }],
    bbox: { x: 0, y: 0, w: rotBox.w, h: rotBox.h },
  };
  if (rotBox.w <= 0 || rotBox.h <= 0 || !item.drawingInput?.strokes?.length) return fallback;

  const w0 = Math.max(1, Math.round(item.w));
  const h0 = Math.max(1, Math.round(item.h));
  const inset = inkInset(w0, h0);
  const marks = fitInkToBox(item.drawingInput.strokes, { w: item.w, h: item.h }, { inset });
  if (marks.length === 0) return fallback;

  const strokeWidth = Math.max(1, options.strokeWidth ?? inkStrokeWidth(h0));
  const cell = Math.max(MIN_CELL_WORLD, options.cellSize ?? DEFAULT_CELL_WORLD);
  const padPx = Math.ceil(strokeWidth / 2) + cell * 2;
  const cols = Math.ceil((rotBox.w + 2 * padPx) / cell) + 2;
  const rows = Math.ceil((rotBox.h + 2 * padPx) / cell) + 2;
  const grid = new Uint8Array(cols * rows);
  const radCells = strokeWidth / 2 / cell;

  for (const mark of marks) {
    if (mark.length === 0) continue;
    const [xA0, yA0] = rotatePoint(mark[0]!.x, mark[0]!.y, item.w, item.h, rot);
    let ax = (xA0 + padPx) / cell;
    let ay = (yA0 + padPx) / cell;
    if (mark.length === 1) {
      stampSegment(grid, cols, rows, ax, ay, ax, ay, radCells);
      continue;
    }
    for (let k = 1; k < mark.length; k++) {
      const [xB0, yB0] = rotatePoint(mark[k]!.x, mark[k]!.y, item.w, item.h, rot);
      const bx = (xB0 + padPx) / cell;
      const by = (yB0 + padPx) / cell;
      stampSegment(grid, cols, rows, ax, ay, bx, by, radCells);
      ax = bx;
      ay = by;
    }
  }

  const outside = floodFillOutside(grid, cols, rows);
  const rects = mergeSolidRects(outside, cols, rows, cell, padPx, rotBox.w, rotBox.h);
  if (rects.length === 0) return fallback;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { rects, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/**
 * Local collider rects for a committed creation relative to `(item.x, item.y)`.
 * When `useShape` is false or strokes are absent, keeps the exact legacy box / hazardZone path.
 */
export function shapeRectsForCreation(
  item: Pick<WorldCreation, "w" | "h" | "angle" | "behavior" | "drawingInput">,
  options: ShapeRasterOptions & { readonly useShape?: boolean } = {},
): readonly Rect[] {
  const box = footprintOf({ x: 0, y: 0, w: item.w, h: item.h, angle: item.angle });
  if (!options.useShape || !item.drawingInput?.strokes?.length) {
    return item.behavior === "danger"
      ? [hazardZone(box.w, box.h)]
      : [{ x: 0, y: 0, w: box.w, h: box.h }];
  }
  return rasterizeCreationShape(item, options).rects;
}

/** World-coordinate collider rects for a creation (`SU.shape.world(o)` equivalent). */
export function worldShapeRects(
  item: Pick<WorldCreation, "x" | "y" | "w" | "h" | "angle" | "behavior" | "drawingInput">,
  options: ShapeRasterOptions & { readonly useShape?: boolean } = {},
): readonly Rect[] {
  return shapeRectsForCreation(item, options).map((r) => ({
    x: item.x + r.x,
    y: item.y + r.y,
    w: r.w,
    h: r.h,
  }));
}
