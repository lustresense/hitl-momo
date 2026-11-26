import { describe, expect, it } from "vitest";
import { StrokeStore, type RawStroke } from "@/src/input/types";

function pushStroke(store: StrokeStore, pts: RawStroke): void {
  store.beginStroke();
  for (const p of pts) store.addPoint(p);
  store.endStroke();
}

describe("StrokeStore.wipe() (r8.3 Bersihkan)", () => {
  it("returns false when the paper is empty and creates no history", () => {
    const store = new StrokeStore();
    expect(store.wipe()).toBe(false);
    expect(store.hasInk()).toBe(false);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it("returns false after an empty beginStroke() with no points", () => {
    const store = new StrokeStore();
    store.beginStroke();
    expect(store.wipe()).toBe(false);
    expect(store.hasActiveStroke()).toBe(false);
    expect(store.undo()).toBe(false);
  });

  it("wipes all strokes as one undoable step; undo restores all strokes and redo wipes again", () => {
    const store = new StrokeStore();
    const s1: RawStroke = [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
    ];
    const s2: RawStroke = [
      { x: 30, y: 40 },
      { x: 80, y: 90 },
    ];
    pushStroke(store, s1);
    pushStroke(store, s2);
    expect(store.getStrokes().completed).toHaveLength(2);

    expect(store.wipe()).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(store.hasInk()).toBe(false);

    // Single undo restores both strokes intact.
    expect(store.undo()).toBe(true);
    expect(store.getStrokes().completed).toEqual([s1, s2]);
    expect(store.hasInk()).toBe(true);

    // Redo wipes both strokes again.
    expect(store.redo()).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(store.hasInk()).toBe(false);

    // Undoing twice after wipe walks back into the original strokes.
    expect(store.undo()).toBe(true);
    expect(store.getStrokes().completed).toEqual([s1, s2]);
    expect(store.undo()).toBe(true);
    expect(store.getStrokes().completed).toEqual([s1]);
  });

  it("closes an open stroke or erase pass before wiping and clears redo history", () => {
    const store = new StrokeStore();
    pushStroke(store, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    pushStroke(store, [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
    // Undoing leaves 1 item in redo stack.
    expect(store.undo()).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(1);

    // Open a new stroke without calling endStroke() yet, then wipe().
    store.beginStroke();
    store.addPoint({ x: 10, y: 80 });
    store.addPoint({ x: 60, y: 80 });

    expect(store.wipe()).toBe(true);
    expect(store.hasActiveStroke()).toBe(false);
    expect(store.getStrokes().completed).toHaveLength(0);
    // Wipe is a new action, so prior redo history is cleared.
    expect(store.redo()).toBe(false);

    // Undo restores both strokes (the earlier completed one and the closed active one).
    expect(store.undo()).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(2);
  });

  it("closes an open erase pass and still returns false if that erase pass emptied the paper", () => {
    const store = new StrokeStore();
    pushStroke(store, [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);
    store.beginErase();
    expect(store.eraseAt({ x: 15, y: 10 }, 20)).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(0);

    // Paper is already empty after the erase pass closes, so wipe() returns false.
    expect(store.wipe()).toBe(false);
    expect(store.isErasing()).toBe(false);
    // Undo still restores from the closed erase pass.
    expect(store.undo()).toBe(true);
    expect(store.getStrokes().completed).toHaveLength(1);
  });

  it("preserves legacy clear() behavior 100% unchanged", () => {
    const store = new StrokeStore();
    const s1: RawStroke = [
      { x: 10, y: 10 },
      { x: 40, y: 40 },
    ];
    const s2: RawStroke = [
      { x: 20, y: 20 },
      { x: 60, y: 60 },
    ];
    pushStroke(store, s1);
    pushStroke(store, s2);

    store.clear();
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(store.hasActiveStroke()).toBe(false);
    // Legacy clear() wipes ops so undo() returns false, while pushing strokes to undone/redoOps.
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.getStrokes().completed).toEqual([s2]);
    expect(store.redo()).toBe(true);
    expect(store.getStrokes().completed).toEqual([s2, s1]);
  });
});
