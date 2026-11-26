import { describe, expect, it } from "vitest";
import {
  PINCH_COOLDOWN_MS,
  PINCH_ENTER_FRAMES,
  PINCH_ENTER_R,
  PINCH_HOLD_R,
  PINCH_RELEASE_MIN_MS,
  createPinchDetector,
  isOpenHand,
  pinchRatio,
  pinchStrength,
  type Pt,
} from "@/src/nui/sources/hand";

function makeHand(opts: { pinchDistY?: number; pinchDistX?: number; extendedFingers?: number } = {}): Pt[] {
  const { pinchDistY = 0.12, pinchDistX = 0, extendedFingers = 4 } = opts;
  const lm: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.8 }; // wrist
  lm[9] = { x: 0.5, y: 0.6 }; // middle MCP (palm span dy = 0.2)

  // Finger PIP/tip pairs: index(6,8), middle(10,12), ring(14,16), pinky(18,20)
  const fingers: ReadonlyArray<readonly [number, number, number]> = [
    [6, 8, 0.46],
    [10, 12, 0.5],
    [14, 16, 0.54],
    [18, 20, 0.58],
  ];
  fingers.forEach(([pip, tip, x], idx) => {
    const ext = idx < extendedFingers;
    lm[pip] = { x, y: 0.5 };
    lm[tip] = ext ? { x, y: 0.35 } : { x, y: 0.65 };
  });

  // Position thumb tip relative to index tip
  const p8 = lm[8] as Pt;
  lm[4] = { x: p8.x + pinchDistX, y: p8.y + pinchDistY };
  return lm;
}

describe("pinch constants and pinchStrength", () => {
  it("matches Recipe R1 thresholds", () => {
    expect(PINCH_ENTER_R).toBe(0.3);
    expect(PINCH_HOLD_R).toBe(0.42);
    expect(PINCH_ENTER_FRAMES).toBe(2);
    expect(PINCH_RELEASE_MIN_MS).toBe(150);
    expect(PINCH_COOLDOWN_MS).toBe(250);
  });

  it("computes clamp01((0.50 - r) / 0.20) accurately", () => {
    expect(pinchStrength(0.7)).toBe(0);
    expect(pinchStrength(0.5)).toBe(0);
    expect(pinchStrength(0.4)).toBeCloseTo(0.5, 10);
    expect(pinchStrength(0.3)).toBeCloseTo(1, 10);
    expect(pinchStrength(0.1)).toBe(1);
    expect(pinchStrength(Number.NaN)).toBe(0);
  });
});

describe("pinchRatio and isOpenHand (aspect corrected)", () => {
  it("computes aspect-corrected |P4-P8| / |P0-P9| matching pixel Euclidean distance", () => {
    // Vertical palm P0->P9 has dy=0.2; horizontal pinch P4->P8 has dx=0.1
    // At aspect 16/9 (1280x720): palmPx = 0.2*720 = 144, pinchPx = 0.1*1280 = 128 => r = 128/144 = 8/9
    const lm = makeHand({ pinchDistX: 0.1, pinchDistY: 0 });
    const aspect = 16 / 9;
    const r = pinchRatio(lm, aspect);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo((0.1 * 1280) / (0.2 * 720), 6);

    // At aspect 1 (square), same landmarks yield 0.1 / 0.2 = 0.5
    expect(pinchRatio(lm, 1)).toBeCloseTo(0.5, 6);
  });

  it("returns null on incomplete landmarks, zero palm span, or invalid aspect", () => {
    expect(pinchRatio([], 16 / 9)).toBeNull();
    const zeroPalm = makeHand();
    zeroPalm[9] = { ...(zeroPalm[0] as Pt) };
    expect(pinchRatio(zeroPalm, 16 / 9)).toBeNull();
    expect(pinchRatio(makeHand(), 0)).toBeNull();
    expect(pinchRatio(makeHand(), Number.NaN)).toBeNull();
  });

  it("detects open hand only when >=3 fingers extended and not pinched (r >= 0.42)", () => {
    expect(isOpenHand(makeHand({ extendedFingers: 4, pinchDistY: 0.12 }), 16 / 9)).toBe(true);
    expect(isOpenHand(makeHand({ extendedFingers: 3, pinchDistY: 0.12 }), 16 / 9)).toBe(true);
    // Only 2 extended fingers -> not open
    expect(isOpenHand(makeHand({ extendedFingers: 2, pinchDistY: 0.12 }), 16 / 9)).toBe(false);
    // 4 extended fingers but tightly pinched (r = 0.04 / 0.20 = 0.20 < 0.42) -> not open
    expect(isOpenHand(makeHand({ extendedFingers: 4, pinchDistY: 0.04 }), 16 / 9)).toBe(false);
    expect(isOpenHand([], 16 / 9)).toBe(false);
    expect(isOpenHand(makeHand(), -1)).toBe(false);
  });
});

describe("createPinchDetector", () => {
  it("requires 2 unique frames with r < 0.30 to enter and holds across hysteresis band [0.30, 0.42)", () => {
    const det = createPinchDetector();

    // Frame 1 unique below 0.30 -> pending, not yet on
    expect(det.update(0.25, 0, true)).toEqual({ pinch: false, strength: 1, event: null });
    // Duplicate frame must NOT confirm onset
    expect(det.update(0.25, 16, false)).toEqual({ pinch: false, strength: 1, event: null });
    // Frame 2 unique below 0.30 -> ON!
    expect(det.update(0.25, 33, true)).toEqual({ pinch: true, strength: 1, event: "on" });

    // Inside hysteresis zone [0.30, 0.42): stays pinched indefinitely
    for (let i = 2; i <= 20; i++) {
      const res = det.update(0.38, i * 33, true);
      expect(res.pinch).toBe(true);
      expect(res.event).toBeNull();
      expect(res.strength).toBeCloseTo((0.5 - 0.38) / 0.2, 6);
    }
  });

  it("resets onset count if r >= 0.30 interrupts a 1-frame spike", () => {
    const det = createPinchDetector();
    expect(det.update(0.2, 0, true).pinch).toBe(false);
    expect(det.update(0.3, 33, true).pinch).toBe(false); // exact 0.30 is not < 0.30
    expect(det.update(0.2, 66, true).pinch).toBe(false); // count back to 1
    expect(det.update(0.2, 99, true)).toEqual({ pinch: true, strength: 1, event: "on" });
  });

  it("releases after max(150ms, 2*dt) at dt=33ms (150ms) and bridges brief <150ms flicker", () => {
    const det = createPinchDetector();
    det.update(0.2, 0, true);
    det.update(0.2, 33, true); // ON

    // Brief 99 ms open flicker (< 150 ms) then back to hold -> never drops!
    expect(det.update(0.5, 66, true).pinch).toBe(true); // relStart = 66
    expect(det.update(0.5, 99, true).pinch).toBe(true); // 33 ms
    expect(det.update(0.5, 132, true).pinch).toBe(true); // 66 ms
    expect(det.update(0.5, 165, true).pinch).toBe(true); // 99 ms
    expect(det.update(0.35, 198, true).pinch).toBe(true); // recovered!

    // Now sustained release: 150 ms from t=231 => releases at t >= 381 (first frame 396)
    expect(det.update(0.42, 231, true).pinch).toBe(true); // relStart = 231 (0 ms)
    expect(det.update(0.5, 264, true).pinch).toBe(true); // 33 ms
    expect(det.update(0.5, 297, true).pinch).toBe(true); // 66 ms
    expect(det.update(0.5, 330, true).pinch).toBe(true); // 99 ms
    expect(det.update(0.5, 363, true).pinch).toBe(true); // 132 ms (< 150 ms)
    const off = det.update(0.5, 396, true); // 165 ms >= 150 ms
    expect(off).toEqual({ pinch: false, strength: 0, event: "off" });
  });

  it("releases after max(150ms, 2*dt) = 280ms at dt=140ms even with interleaved duplicate rAF frames", () => {
    const det = createPinchDetector();
    det.update(0.2, 0, true);
    expect(det.update(0.2, 140, true).event).toBe("on"); // frameDt = 140 -> 2*dt = 280 ms

    // First release frame at t=280 (relStart = 280)
    expect(det.update(0.5, 280, true).pinch).toBe(true);
    // Duplicate rAF frames at 16ms intervals must NOT clobber frameDt or trigger release at 150ms!
    for (let t = 296; t < 420; t += 16) {
      expect(det.update(0.5, t, false).pinch).toBe(true);
    }
    // Second unique frame at t=420 (elapsed 140 ms < 280 ms) -> STILL held
    expect(det.update(0.5, 420, true).pinch).toBe(true);
    for (let t = 436; t < 560; t += 16) {
      expect(det.update(0.5, t, false).pinch).toBe(true);
    }
    // Third unique frame at t=560 (elapsed 280 ms >= 280 ms) -> OFF!
    expect(det.update(0.5, 560, true)).toEqual({ pinch: false, strength: 0, event: "off" });
  });

  it("enforces 250ms post-click cooldown and clears state cleanly on reset()", () => {
    const det = createPinchDetector();
    det.update(0.2, 0, true);
    det.update(0.2, 33, true); // ON
    // Steady 33ms frames until release completes (>= 150ms from t=66 => off at t=231)
    for (const t of [66, 99, 132, 165, 198]) {
      expect(det.update(0.5, t, true).pinch).toBe(true);
    }
    expect(det.update(0.5, 231, true)).toEqual({ pinch: false, strength: 0, event: "off" });

    // During cooldown [231, 481), repeated r < 0.30 frames cannot re-trigger
    expect(det.update(0.15, 264, true).pinch).toBe(false);
    expect(det.update(0.15, 360, true).pinch).toBe(false);
    expect(det.update(0.15, 480, true).pinch).toBe(false);

    // At t=481 cooldown ends -> needs 2 unique frames
    expect(det.update(0.15, 481, true).pinch).toBe(false); // count = 1
    expect(det.update(0.15, 514, true)).toEqual({ pinch: true, strength: 1, event: "on" });

    // reset() drops pinch silently and clears cooldown for fresh session timestamps
    det.reset();
    expect(det.update(0.15, 0, true).pinch).toBe(false);
    expect(det.update(0.15, 33, true)).toEqual({ pinch: true, strength: 1, event: "on" });
  });

  it("never triggers false pinch on NaN ratio", () => {
    const det = createPinchDetector();
    expect(det.update(Number.NaN, 0, true)).toEqual({ pinch: false, strength: 0, event: null });
    expect(det.update(Number.NaN, 33, true)).toEqual({ pinch: false, strength: 0, event: null });
    expect(det.update(Number.NaN, 66, true)).toEqual({ pinch: false, strength: 0, event: null });
  });
});
