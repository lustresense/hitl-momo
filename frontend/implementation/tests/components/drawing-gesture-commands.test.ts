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
