import { describe, expect, it } from "vitest";
import { StrokeStore, type RawStroke } from "@/src/input/types";

/**
 * NUI-R17-02 (REV4), G-04: the point-only eraser let a fast stroke slip through the eraser circle because the cut was
 * decided on sample points, not on the line between them. NUI Lab opts into segment cutting; the game keeps the default.
 */
const R = 32;
const sparse = (): RawStroke => [
  { x: 100, y: 300 },
  { x: 300, y: 300 }, // 200 px gap: no sample point lies near x = 200
  { x: 500, y: 300 },
];
const make = (segments: boolean) => {
  const s = new StrokeStore();
  s.eraseSegments = segments;
  s.beginStroke();
  for (const p of sparse()) s.addPoint(p);
  s.endStroke();
  return s;
};
const pts = (s: StrokeStore) => s.getStrokes().completed.reduce((n, st) => n + st.length, 0);

describe("segment-aware eraser (opt-in)", () => {
  it("the default is off, so the game keeps the point-only eraser", () => {
    expect(new StrokeStore().eraseSegments).toBe(false);
  });

  it("default: a circle in the middle of a 200 px gap does not touch the stroke (the reproduced G-04 miss)", () => {
    const s = make(false);
    expect(s.eraseAt({ x: 200, y: 300 }, R)).toBe(false);
    expect(s.getStrokes().completed).toHaveLength(1);
    expect(pts(s)).toBe(3);
  });

  it("segment mode: the same circle cuts the stroke in two, with new end points on the circle edge", () => {
    const s = make(true);
    expect(s.eraseAt({ x: 200, y: 300 }, R)).toBe(true);
    const done = s.getStrokes().completed;
    expect(done).toHaveLength(2);
    const [left, right] = done as [RawStroke, RawStroke];
    expect(left[0]).toEqual({ x: 100, y: 300 });
    expect(right[right.length - 1]).toEqual({ x: 500, y: 300 });
    expect(left[left.length - 1]!.x).toBeCloseTo(200 - R, 6);
    expect(right[0]!.x).toBeCloseTo(200 + R, 6);
    // The 64 px under the circle is gone, nothing else is.
    expect(left[left.length - 1]!.y).toBe(300);
  });

  it("segment mode: a circle that misses the line by more than its radius cuts nothing", () => {
    const s = make(true);
    expect(s.eraseAt({ x: 200, y: 300 + R + 5 }, R)).toBe(false);
    expect(s.getStrokes().completed).toHaveLength(1);
    expect(pts(s)).toBe(3);
  });

  it("segment mode: a circle that covers a vertex behaves like the point-only eraser there", () => {
    const s = make(true);
    expect(s.eraseAt({ x: 300, y: 300 }, R)).toBe(true);
    const done = s.getStrokes().completed;
    expect(done).toHaveLength(2);
    expect(done.flat().every((p) => Math.hypot(p.x - 300, p.y - 300) >= R - 1e-6)).toBe(true);
  });

  it("segment mode: a diagonal segment is cut at the circle edge, not at its midpoint", () => {
    const s = new StrokeStore();
    s.eraseSegments = true;
    s.beginStroke();
    s.addPoint({ x: 0, y: 0 });
    s.addPoint({ x: 400, y: 400 });
    s.endStroke();
    expect(s.eraseAt({ x: 200, y: 200 }, 40)).toBe(true);
    const [a, b] = s.getStrokes().completed as [RawStroke, RawStroke];
    expect(Math.hypot(a[a.length - 1]!.x - 200, a[a.length - 1]!.y - 200)).toBeCloseTo(40, 6);
    expect(Math.hypot(b[0]!.x - 200, b[0]!.y - 200)).toBeCloseTo(40, 6);
  });

  it("one erase pass is one undo step that restores the original stroke; redo re-applies the cut", () => {
    const s = make(true);
    const original = s.getStrokes().completed.map((st) => st.map((p) => ({ ...p })));
    s.beginErase();
    s.eraseAt({ x: 200, y: 300 }, R);
    s.eraseAt({ x: 400, y: 300 }, R);
    s.endErase();
    expect(s.getStrokes().completed).toHaveLength(3);
    expect(s.undo()).toBe(true);
    expect(s.getStrokes().completed).toEqual(original);
    expect(s.redo()).toBe(true);
    expect(s.getStrokes().completed).toHaveLength(3);
  });

  it("a pass over empty canvas changes nothing and adds no history", () => {
    const s = make(true);
    s.beginErase();
    expect(s.eraseAt({ x: 900, y: 650 }, R)).toBe(false);
    s.endErase();
    expect(s.undo()).toBe(true); // this undoes the stroke, not a phantom erase step
    expect(s.getStrokes().completed).toHaveLength(0);
  });

  it("a single-point stroke is removed only when its point is inside the circle", () => {
    const s = new StrokeStore();
    s.eraseSegments = true;
    s.beginStroke();
    s.addPoint({ x: 50, y: 50 });
    s.endStroke();
    expect(s.eraseAt({ x: 50 + R + 1, y: 50 }, R)).toBe(false);
    expect(s.eraseAt({ x: 50 + R - 1, y: 50 }, R)).toBe(true);
    expect(s.getStrokes().completed).toHaveLength(0);
  });
});
