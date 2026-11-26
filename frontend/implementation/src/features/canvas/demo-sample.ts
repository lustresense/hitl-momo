import type { StrokePoint } from "@/src/domain/types";
import type { StrokeStore } from "@/src/input/types";
import type { CanvasSurfaceMetrics } from "./canvas-render";

export type DemoSampleKind = "plank" | "block";

const STEP_PX = 5;

function densify(points: readonly StrokePoint[]): StrokePoint[] {
  const out: StrokePoint[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const from = out[out.length - 1]!;
    const to = points[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP_PX));
    for (let k = 1; k <= n; k++) {
      out.push({ x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n });
    }
  }
  return out;
}

/**
 * Papan atau peti contoh untuk "Lewati" di kertas kosong (port `shared/level/canvas.js` `sample`).
 * Ukuran dihitung dalam piksel CSS lalu dipetakan ke piksel kanvas. Hanya untuk demo: percobaan yang
 * memakainya tidak pernah dikirim ke server.
 */
export function buildDemoSample(kind: DemoSampleKind, metrics: CanvasSurfaceMetrics): StrokePoint[][] {
  const width = metrics.rect.width > 0 ? metrics.rect.width : metrics.canvasWidth;
  const height = metrics.rect.height > 0 ? metrics.rect.height : metrics.canvasHeight;
  const sx = metrics.canvasWidth / width;
  const sy = metrics.canvasHeight / height;
  const line = (coords: readonly (readonly [number, number])[]) =>
    densify(coords.map(([x, y]) => ({ x, y }))).map((p) => ({ x: p.x * sx, y: p.y * sy }));
  const cx = width * 0.45;
  const cy = height * 0.56;
  if (kind === "plank") {
    const w = Math.min(190, width * 0.3);
    const h = 26;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const grain = [1, 2, 3, 4].map((k) => line([[x + (k * w) / 5, y], [x + (k * w) / 5 + 10, y + h]]));
    return [line([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]), ...grain];
  }
  const w = Math.min(96, width * 0.16);
  const x = cx - w / 2;
  const y = cy - w / 2;
  return [
    line([[x, y], [x + w, y], [x + w, y + w], [x, y + w], [x, y]]),
    line([[x, y], [x + w, y + w]]),
    line([[x + w, y], [x, y + w]]),
  ];
}

/** Memasukkan gambar contoh ke `StrokeStore` sebagai goresan biasa. */
export function addDemoSample(store: StrokeStore, kind: DemoSampleKind, metrics: CanvasSurfaceMetrics): void {
  for (const stroke of buildDemoSample(kind, metrics)) {
    store.beginStroke();
    for (const point of stroke) store.addPoint(point);
    store.endStroke();
  }
}
