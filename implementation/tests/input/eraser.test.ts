// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { StrokeStore } from "@/src/input/types";
import { attachPointerDriver } from "@/src/input/pointer-input";

function line(store: StrokeStore, y: number) {
  store.beginStroke();
  for (let x = 0; x <= 200; x += 10) store.addPoint({ x, y });
  store.endStroke();
}

describe("eraser (PRD 0.0.16 R12 kepal = Hapus)", () => {
  it("erases points under the cursor and splits the stroke", () => {
    const s = new StrokeStore();
    line(s, 50);
    line(s, 300);
    s.beginErase();
    expect(s.eraseAt({ x: 100, y: 50 }, 28)).toBe(true);
    s.endErase();
    const { completed } = s.getStrokes();
    expect(completed).toHaveLength(3);
    expect(completed.flat().some((p) => p.y === 50 && Math.abs(p.x - 100) <= 28)).toBe(false);
    expect(completed[2]).toHaveLength(21); // far stroke untouched
  });

  it("one eraser pass is one undo step, redo re-applies it", () => {
    const s = new StrokeStore();
    line(s, 50);
    s.beginErase();
    for (let x = 0; x <= 200; x += 20) s.eraseAt({ x, y: 50 }, 28);
    s.endErase();
    expect(s.hasInk()).toBe(false);
    expect(s.undo()).toBe(true);
    expect(s.getStrokes().completed).toHaveLength(1);
    expect(s.redo()).toBe(true);
    expect(s.hasInk()).toBe(false);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true); // then the stroke itself
    expect(s.hasInk()).toBe(false);
    expect(s.redo()).toBe(true);
    expect(s.getStrokes().completed).toHaveLength(1);
  });

  it("a pass that erases nothing adds no undo step", () => {
    const s = new StrokeStore();
    line(s, 50);
    s.beginErase();
    s.eraseAt({ x: 100, y: 400 }, 28);
    s.endErase();
    expect(s.undo()).toBe(true);
    expect(s.hasInk()).toBe(false);
  });

  it("pointer drag erases when eraserMode is on", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const s = new StrokeStore();
    line(s, 50);
    const detach = attachPointerDriver(canvas, s, () => {});
    s.eraserMode = true;
    const ev = (type: string, x: number) => canvas.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: 50, pointerId: 1 }));
    ev("pointerdown", 0);
    for (let x = 0; x <= 200; x += 20) ev("pointermove", x);
    ev("pointerup", 200);
    expect(s.hasInk()).toBe(false);
    expect(s.isErasing()).toBe(false);
    expect(s.undo()).toBe(true);
    expect(s.hasInk()).toBe(true);
    s.eraserMode = false;
    ev("pointerdown", 10);
    ev("pointermove", 100);
    ev("pointerup", 100);
    expect(s.getStrokes().completed).toHaveLength(2);
    detach();
  });
});
