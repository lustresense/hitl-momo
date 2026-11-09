// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createGestureCommander } from "@/src/components/drawing/gesture-commands";
import { DrawingSurface } from "@/src/input";
import { classifyHandPose, type HandPose } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";
import { makeHand } from "./hand-fixtures";

// The surface's hand hook is the same path the e2e harness drives; no camera or model is needed.
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn() },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

const W = 400;
const H = 300;
/** Frame clock at about 30 fps, starting at 1 s. */
const at = (i: number) => 1000 + i * 33;

function makeSurface(onPose?: (pose: HandPose, nowMs: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const rect = { left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON() {} } as DOMRect;
  canvas.getBoundingClientRect = () => rect;
  (canvas as unknown as { getContext: unknown }).getContext = () => new Proxy({}, { get: () => () => undefined, set: () => true });
  const surface = new DrawingSurface(canvas, null, { onPose });
  return { canvas, surface, store: surface.store };
}

// Hand builders. Camera-frame coordinates; the surface mirrors x itself.
const fist = (): Landmark[] => makeHand({ ratios: [0.5, 0.5, 0.5, 0.5] });
const none = (): Landmark[] => makeHand({ ratios: [1, 1, 1, 1] });
const thumbUp = (): Landmark[] =>
  makeHand({ ratios: [0.5, 0.5, 0.5, 0.5], thumbMcp: { x: 0.36, y: 0.7 }, thumbTip: { x: 0.36, y: 0.5 } });
const twoFingers = (): Landmark[] => makeHand({ ratios: [1.5, 1.5, 0.5, 0.5] });
const splitPalm = (): Landmark[] => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], tipX: [0.38, 0.42, 0.62, 0.66] });
const openPalm = (): Landmark[] => makeHand({ ratios: [1.5, 1.5, 1.5, 1.5] });
/** Thumb touching the index tip at camera point (x, y); `gap` moves the thumb to the right. */
const pinch = (x: number, y = 0.55, gap = 0.004): Landmark[] =>
  makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], indexTip: { x, y }, thumbTip: { x: x + gap, y } });

describe("hand stroke: start and release come from several frames, not one", () => {
  it("one pinch frame does not start a stroke", () => {
    const { surface, store } = makeSurface();
    surface.feedHandLandmarksForTest(pinch(0.4), at(0));
    expect(store.getStrokes().active).toBeNull();
    surface.feedHandLandmarksForTest(pinch(0.42), at(1));
    expect(store.getStrokes().active).not.toBeNull();
  });

  it("one folded frame inside a pinch does not split the stroke", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.02 * i), at(i));
    surface.feedHandLandmarksForTest(none(), at(5));
    for (let i = 6; i < 10; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.02 * i), at(i));
    for (let i = 10; i < 13; i++) surface.feedHandLandmarksForTest(none(), at(i));
    expect(store.getStrokes().completed).toHaveLength(1);
  });

  it("a stroke ends only after three non-pinch frames in the last five", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.02 * i), at(i));
    surface.feedHandLandmarksForTest(none(), at(5));
    surface.feedHandLandmarksForTest(none(), at(6));
    expect(store.getStrokes().active).not.toBeNull();
    surface.feedHandLandmarksForTest(none(), at(7));
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(1);
  });
});

describe("hand stroke: a brief tracking loss keeps the line (grace about 150 ms)", () => {
  it("a 100 ms tracking loss keeps the same stroke", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.002 * i), at(i));
    for (let i = 5; i < 8; i++) surface.feedHandLandmarksForTest(undefined, at(i));
    expect(store.getStrokes().active).not.toBeNull();
    for (let i = 8; i < 13; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.002 * i), at(i));
    for (let i = 13; i < 16; i++) surface.feedHandLandmarksForTest(none(), at(i));
    expect(store.getStrokes().completed).toHaveLength(1);
  });

  it("a loss longer than 150 ms ends the stroke", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.002 * i), at(i));
    // Last tracked frame is at(4); at(8) is 132 ms later (inside the grace), at(9) is 165 ms later.
    for (let i = 5; i <= 8; i++) surface.feedHandLandmarksForTest(undefined, at(i));
    expect(store.getStrokes().active).not.toBeNull();
    surface.feedHandLandmarksForTest(undefined, at(9));
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(1);
  });

  it("coming back far away after a short loss starts a new line instead of a long jump", () => {
    const { surface, store } = makeSurface();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(pinch(0.4), at(i));
    for (let i = 5; i < 7; i++) surface.feedHandLandmarksForTest(undefined, at(i));
    // Hand reappears 80 canvas px to the left of the old line end: beyond the jump limit.
    for (let i = 7; i < 10; i++) surface.feedHandLandmarksForTest(pinch(0.6, 0.55), at(i));
    for (let i = 10; i < 13; i++) surface.feedHandLandmarksForTest(none(), at(i));
    const { completed } = store.getStrokes();
    expect(completed).toHaveLength(2);
    // Smoothing restarts after a loss, so the new line starts exactly on the mirrored point (160, 165).
    expect(completed[1]![0]).toEqual({ x: 160, y: 165 });
  });
});

describe("hand stroke: pinch hysteresis while drawing", () => {
  it("a stroke keeps drawing while the thumb gap drifts between 0.42 and 0.55 of the span", () => {
    // Gap ratios: 0.30 (start), 0.48 (held, above the 0.42 entry), 0.60 (released).
    const { surface, store } = makeSurface();
    const gapAt = (i: number) => (i < 3 ? 0.06 : i < 9 ? 0.096 : 0.12);
    for (let i = 0; i < 12; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.02 * i, 0.55, gapAt(i)), at(i));
    const { completed, active } = store.getStrokes();
    expect(active).toBeNull();
    expect(completed).toHaveLength(1);
    // Frames 1..8 each add one point: the stroke starts on the second pinch frame and survives the 0.48 frames.
    expect(completed[0]).toHaveLength(8);
  });
});

describe("hand stroke: smoothing follows the hand", () => {
  it("the drawn point stays within 20 px of a steadily moving pinch", () => {
    // Bug: the 1-euro filter had beta 0.015 on 0..1 coordinates, so points trailed by about 50 px.
    const { surface, store } = makeSurface();
    for (let i = 0; i < 10; i++) surface.feedHandLandmarksForTest(pinch(0.4 + 0.02 * i), at(i));
    const last = store.getStrokes().active!.at(-1)!;
    const rawX = (1 - (0.4 + 0.02 * 9)) * W;
    expect(Math.abs(last.x - rawX)).toBeLessThanOrEqual(20);
  });
});

describe("fist (Hapus): erases at the knuckles, one undo per pass", () => {
  it("a fist erases at the knuckle centre, not at the folded fingertip", () => {
    const { surface, store } = makeSurface();
    const eraseSpy = vi.spyOn(store, "eraseAt");
    for (let i = 0; i < 4; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    expect(eraseSpy).toHaveBeenCalled();
    const [point, radius] = eraseSpy.mock.calls[0]!;
    // Knuckle centre (0.47, 0.70) mirrored onto the 400 x 300 canvas; the folded index tip is at (224, 229).
    expect(point).toEqual({ x: 188, y: 210 });
    expect(radius).toBe(28);
  });

  it("a fist cuts a line in place, and one undo restores the whole line", () => {
    const { surface, store } = makeSurface();
    store.beginStroke();
    for (let x = 5; x <= 395; x += 10) store.addPoint({ x, y: 210 });
    store.endStroke();
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    for (let i = 5; i < 8; i++) surface.feedHandLandmarksForTest(none(), at(i));
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([16, 18]);
    expect(surface.undo()).toBe(true);
    expect(store.getStrokes().completed.map((s) => s.length)).toEqual([40]);
  });

  it("a one-frame flicker inside a fist keeps the reported pose", () => {
    const poses: HandPose[] = [];
    const { surface } = makeSurface((pose) => poses.push(pose));
    for (let i = 0; i < 5; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    surface.feedHandLandmarksForTest(none(), at(5));
    for (let i = 6; i < 9; i++) surface.feedHandLandmarksForTest(fist(), at(i));
    expect(poses.slice(2)).toEqual(["fist", "fist", "fist", "fist", "fist", "fist", "fist"]);
  });

  it("a thumb-up never starts a stroke or erases", () => {
    const poses: HandPose[] = [];
    const { surface, store } = makeSurface((pose) => poses.push(pose));
    const eraseSpy = vi.spyOn(store, "eraseAt");
    for (let i = 0; i < 10; i++) surface.feedHandLandmarksForTest(thumbUp(), at(i));
    expect(store.getStrokes().active).toBeNull();
    expect(store.getStrokes().completed).toHaveLength(0);
    expect(eraseSpy).not.toHaveBeenCalled();
    expect(poses[poses.length - 1]).toBe("thumb-up");
  });
});

describe("gesture commands on the real surface", () => {
  it("a two-finger hold with a one-frame flicker still fires exactly one undo", () => {
    // Bug: a single folded frame restarted the 300 ms hold, so the undo never fired.
    const commander = createGestureCommander();
    let undos = 0;
    const { surface } = makeSurface((pose, nowMs) => {
      if (commander.feed(pose, nowMs) === "undo") undos++;
    });
    for (let i = 0; i <= 12; i++) surface.feedHandLandmarksForTest(i === 7 ? none() : twoFingers(), at(i));
    expect(undos).toBe(1);
  });

  const matrix: Array<{ name: string; hand: () => Landmark[]; undo: number; redo: number; erases: boolean; ink: boolean }> = [
    { name: "pinch", hand: () => pinch(0.5), undo: 0, redo: 0, erases: false, ink: true },
    { name: "fist", hand: fist, undo: 0, redo: 0, erases: true, ink: false },
    { name: "two fingers", hand: twoFingers, undo: 1, redo: 0, erases: false, ink: false },
    { name: "split palm", hand: splitPalm, undo: 0, redo: 1, erases: false, ink: false },
    { name: "open palm", hand: openPalm, undo: 0, redo: 0, erases: false, ink: false },
    { name: "thumb-up", hand: thumbUp, undo: 0, redo: 0, erases: false, ink: false },
    { name: "no hand pose", hand: none, undo: 0, redo: 0, erases: false, ink: false },
  ];
  for (const row of matrix) {
    it(`${row.name} triggers only its own action`, () => {
      const commander = createGestureCommander();
      const counts = { undo: 0, redo: 0 };
      const { surface, store } = makeSurface((pose, nowMs) => {
        const action = commander.feed(pose, nowMs);
        if (action) counts[action]++;
      });
      const eraseSpy = vi.spyOn(store, "eraseAt");
      for (let i = 0; i < 60; i++) surface.feedHandLandmarksForTest(row.hand(), at(i));
      const { completed, active } = store.getStrokes();
      expect(counts.undo).toBe(row.undo);
      expect(counts.redo).toBe(row.redo);
      expect(eraseSpy.mock.calls.length > 0).toBe(row.erases);
      expect(completed.length > 0 || active !== null).toBe(row.ink);
    });
  }
});

describe("pose classes used above stay exclusive on these hands", () => {
  it("the fixtures classify as the poses they are named after", () => {
    expect(classifyHandPose(fist())).toBe("fist");
    expect(classifyHandPose(twoFingers())).toBe("two-fingers");
    expect(classifyHandPose(splitPalm())).toBe("split-palm");
    expect(classifyHandPose(openPalm())).toBe("open-palm");
    expect(classifyHandPose(thumbUp())).toBe("thumb-up");
    expect(classifyHandPose(pinch(0.5))).toBe("pinch");
  });
});

describe("Hapus tool on: command poses never erase", () => {
  const commands: Array<[string, () => Landmark[]]> = [
    ["thumbs-up", thumbUp],
    ["two fingers", twoFingers],
    ["split palm", splitPalm],
  ];
  for (const [name, hand] of commands) {
    it(`a ${name} under the eraser tool neither erases nor draws`, () => {
      const { surface, store } = makeSurface();
      store.beginStroke();
      for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: 229 }); // on the thumbs-up index tip
      store.endStroke();
      surface.setErasing(true);
      const eraseSpy = vi.spyOn(store, "eraseAt");
      for (let i = 0; i < 10; i++) surface.feedHandLandmarksForTest(hand(), at(i));
      expect(eraseSpy).not.toHaveBeenCalled();
      expect(store.getStrokes().completed.map((s) => s.length)).toEqual([41]);
      expect(store.getStrokes().active).toBeNull();
    });
  }

  it("a pinch drag under the eraser tool still erases", () => {
    const { surface, store } = makeSurface();
    store.beginStroke();
    for (let x = 0; x <= 400; x += 10) store.addPoint({ x, y: 165 });
    store.endStroke();
    surface.setErasing(true);
    // Camera x 0.5 mirrors to canvas x 200; the line passes right under it.
    for (let i = 0; i < 4; i++) surface.feedHandLandmarksForTest(pinch(0.5, 0.55), at(i));
    expect(store.getStrokes().completed.flat().some((p) => p.y === 165 && Math.abs(p.x - 200) <= 28)).toBe(false);
  });
});
