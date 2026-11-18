import { describe, expect, it } from "vitest";
import { LAB_PINCH_ENTER, LAB_PINCH_EXIT, PINCH_ENTER, PINCH_EXIT, classifyHandPose } from "@/src/input/hand-gesture";
import { ASPECT, FPS, closing, frame, hold, inkPoints, make, releasing } from "./pinch-sweep";

/**
 * NUI-R17-05 (REV4): ink appeared although the thumb and the index finger were not touching.
 * Cause found in source: the baseline enters a pinch at thumb-index gap / hand span < 0.42 and measures that gap in
 * raw MediaPipe x/width, y/height units. On a 16:9 stream a horizontal gap is drawn 0.5625 as long, so a gap of
 * about 0.6 spans already reads as 0.34 and draws. The lab gate measures in true image proportions and enters at 0.30.
 * Evidence class: UNIT_ONLY (real class-median hands, synthetic sweeps). Webcam NOT_TESTED; Owner must confirm.
 */
describe("the reproduced false start (baseline) and the lab gate on the same frames", () => {
  for (const gap of [0.4, 0.5, 0.6]) {
    it(`thumb hovering ${gap} span from the index tip: the baseline draws, the lab does not`, () => {
      expect(hold("baseline", gap)).toBeGreaterThan(0);
      expect(hold("lab", gap)).toBe(0);
    });
  }

  it("a clearly open hand (gap 0.8 and wider) never draws in either mode", () => {
    for (const gap of [0.8, 1.0, 1.4]) {
      expect(hold("baseline", gap)).toBe(0);
      expect(hold("lab", gap)).toBe(0);
    }
  });

  it("the near-pinch band (0.30 to 0.42 span) shows the cursor 'near' state but starts no stroke in the lab", () => {
    const { store, pipe } = make("lab");
    let state = "";
    for (let i = 0; i < 20; i++) state = pipe.feed(frame(0.38, i * 0.0005), 1000 + (i * 1000) / FPS).cursor?.state ?? "";
    expect(state).toBe("near");
    expect(inkPoints(store)).toBe(0);
  });
});

describe("a deliberate pinch still draws fast, and ink coordinates are untouched", () => {
  for (const speed of [0.7, 1.5, 3]) {
    it(`closing at ${speed} spans/s: ink starts at or before contact + 2 frames, from a gap no wider than ${LAB_PINCH_ENTER}`, () => {
      const lab = closing("lab", speed);
      const base = closing("baseline", speed);
      expect(lab.started).toBe(true);
      expect(lab.lagFrames!).toBeLessThanOrEqual(2);
      expect(lab.inkAtGap!).toBeLessThanOrEqual(LAB_PINCH_ENTER + speed / FPS + 1e-9);
      // The baseline began earlier than the lab: that earlier part is the false start.
      expect(base.inkAtGap!).toBeGreaterThan(lab.inkAtGap!);
    });
  }

  it("a touching pinch moved across the frame gives the SAME ink points in baseline and lab (smoothing untouched)", () => {
    const run = (mode: "baseline" | "lab") => {
      const { store, pipe } = make(mode);
      for (let i = 0; i < 40; i++) pipe.feed(frame(0.05, i * 0.004), 1000 + (i * 1000) / FPS);
      pipe.feed(undefined, 5000);
      pipe.feed(undefined, 5300);
      return store.getStrokes().completed;
    };
    const base = run("baseline");
    const lab = run("lab");
    expect(base.length).toBeGreaterThan(0);
    expect(lab).toEqual(base);
  });

  it("a held touch with fingertip jitter never drops the ink (hysteresis keeps one stroke)", () => {
    const { store, pipe } = make("lab");
    for (let i = 0; i < 60; i++) pipe.feed(frame(0.06 + 0.05 * Math.sin(i), i * 0.001), 1000 + (i * 1000) / FPS);
    const g = store.getStrokes();
    expect(g.completed.length + (g.active ? 1 : 0)).toBe(1);
  });
});

describe("release: the ink tail after the fingers open is shorter in the lab", () => {
  for (const speed of [0.7, 1.5, 3]) {
    it(`opening at ${speed} spans/s: fewer late ink points and an earlier last point than the baseline`, () => {
      const base = releasing("baseline", speed);
      const lab = releasing("lab", speed);
      expect(lab.tailPoints).toBeLessThan(base.tailPoints);
      expect(lab.lastInkGap ?? 0).toBeLessThanOrEqual(base.lastInkGap ?? 0);
    });
  }
});

describe("pure classifier: baseline numbers are untouched, lab numbers are the candidates", () => {
  it("the constants", () => {
    expect([PINCH_ENTER, PINCH_EXIT]).toEqual([0.42, 0.55]);
    expect([LAB_PINCH_ENTER, LAB_PINCH_EXIT]).toEqual([0.3, 0.42]);
  });

  it("without options the classifier reads a 0.5-span horizontal gap as no pinch and a 0.6 one as a pinch (raw geometry, as before)", () => {
    const at = (gap: number) => classifyHandPose(frame(gap));
    expect(at(0.6)).toBe("pinch");
    expect(at(1.0)).not.toBe("pinch");
  });

  it("with the lab options the same 0.6 gap is no pinch and a touching gap is", () => {
    const lab = { experimentalRobust: true as const, aspect: ASPECT };
    expect(classifyHandPose(frame(0.6), lab)).not.toBe("pinch");
    expect(classifyHandPose(frame(0.05), lab)).toBe("pinch");
  });
});
