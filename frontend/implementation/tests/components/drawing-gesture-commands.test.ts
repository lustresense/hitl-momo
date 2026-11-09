import { describe, expect, it } from "vitest";
import { createGestureCommander, GESTURE_HOLD_MS } from "@/src/components/drawing/gesture-commands";
import type { HandPose } from "@/src/input/hand-gesture";

function run(seq: Array<[HandPose, number]>) {
  const c = createGestureCommander();
  const out: string[] = [];
  let t = 0;
  for (const [pose, ms] of seq) for (let i = 0; i <= ms; i += 33) { const a = c.feed(pose, t); if (a) out.push(a); t += 33; }
  return out;
}

describe("R12 gesture commands", () => {
  it("two fingers held fires one undo, split palm one redo", () => {
    expect(run([["two-fingers", 1500]])).toEqual(["undo"]);
    expect(run([["split-palm", 1500]])).toEqual(["redo"]);
  });
  it("a short flicker does not fire, and the pose must change before firing again", () => {
    expect(run([["two-fingers", GESTURE_HOLD_MS.undo - 100], ["none", 100]])).toEqual([]);
    expect(run([["two-fingers", 500], ["open-palm", 100], ["two-fingers", 500]])).toEqual(["undo", "undo"]);
  });
  it("fist is the held Hapus tool, never a one-shot command; pinch and thumb never fire", () => {
    expect(run([["fist", 2000], ["pinch", 2000], ["thumb-up", 2000]])).toEqual([]);
    const c = createGestureCommander();
    c.feed("fist", 0);
    expect(c.isErasing()).toBe(true);
    c.feed("pinch", 50);
    expect(c.isErasing()).toBe(false);
  });
});

describe("R12 hold and pause on a fake clock", () => {
  it("fires on the 300 ms mark, not before", () => {
    const c = createGestureCommander();
    expect(c.feed("two-fingers", 0)).toBeNull();
    expect(c.feed("two-fingers", 299)).toBeNull();
    expect(c.feed("two-fingers", 300)).toBe("undo");
  });

  it("after firing, the same pose held on fires nothing until it changes", () => {
    const c = createGestureCommander();
    c.feed("two-fingers", 0);
    expect(c.feed("two-fingers", 300)).toBe("undo");
    expect(c.feed("two-fingers", 1500)).toBeNull();
    c.feed("none", 1600);
    c.feed("two-fingers", 1700);
    expect(c.feed("two-fingers", 2000)).toBe("undo");
  });

  it("a split palm shown right after an undo needs its own full 300 ms hold", () => {
    const c = createGestureCommander();
    c.feed("two-fingers", 0);
    expect(c.feed("two-fingers", 300)).toBe("undo");
    expect(c.feed("split-palm", 310)).toBeNull();
    expect(c.feed("split-palm", 609)).toBeNull();
    expect(c.feed("split-palm", 610)).toBe("redo");
  });
});
