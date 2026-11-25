/** R8.3 A/B/D target selection. Coordinates are CSS pixels, not camera pixels. */
export type TargetMode = "any" | "point";
export interface Point { x: number; y: number }
export interface Bounds { left: number; right: number; top: number; bottom: number; width: number; height: number }
export interface Candidate<T> { id: T; mode: TargetMode; rect: Bounds }
export const MOVE_CANCEL_PX = 26;
export const RING_DRAIN = 1.5;
export const within = (r: Bounds, p: Point) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
export function nearest<T>(items: Candidate<T>[], p: Point): T | null {
  let best: T | null = null, score = Infinity;
  for (const { id, rect: r } of items) {
    const d = Math.hypot(Math.max(r.left-p.x,0,p.x-r.right), Math.max(r.top-p.y,0,p.y-r.bottom))
      + .001 * Math.hypot(r.left+r.width/2-p.x,r.top+r.height/2-p.y);
    if (d < score) { best=id; score=d; }
  }
  return best;
}
export function chooseTarget<T>(items: Candidate<T>[], p: Point): T | null {
  const pointed = items.filter(t => t.mode === "point" && within(t.rect,p));
  if (pointed.length) return nearest(pointed,p);
  const any = items.filter(t => t.mode === "any");
  return any.length === 1 ? any[0].id : nearest(any,p);
}
export function isDrag(origin: Point, p: Point): boolean {
  return Math.hypot(p.x-origin.x,p.y-origin.y) > MOVE_CANCEL_PX;
}
