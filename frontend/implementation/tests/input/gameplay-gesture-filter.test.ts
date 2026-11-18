import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_PINCH_CONFIRM_FRAMES,
  GAMEPLAY_REACQUIRE_FRAMES,
  GameplayGestureFilter,
} from "@/src/input/gameplay-gesture";
import type { Landmark } from "@/src/input/types";
import { pointingHand } from "./gameplay-fixtures";

/** Feed N identical frames and return the last output. */
function feed(f: GameplayGestureFilter, lm: Landmark[] | undefined, n = 1, t0 = 0) {
  let out = f.update(lm, t0);
  for (let i = 1; i < n; i++) out = f.update(lm, t0 + i * 33);
  return out;
}
const STABLE = GAMEPLAY_REACQUIRE_FRAMES;
const NONE = { left: false, right: false, jump: false };
const OPEN = 1.0;
const PINCH = 0.2;

describe("GameplayGestureFilter: steering on landmark fixtures", () => {
  it("walk right, walk left, jump up and stop from the finger angle", () => {
    expect(feed(new GameplayGestureFilter(), pointingHand(10), STABLE).input).toEqual({ left: false, right: true, jump: false });
    expect(feed(new GameplayGestureFilter(), pointingHand(170), STABLE).input).toEqual({ left: true, right: false, jump: false });
    expect(feed(new GameplayGestureFilter(), pointingHand(90), STABLE).input).toEqual({ left: false, right: false, jump: true });
    expect(feed(new GameplayGestureFilter(), pointingHand(-60), STABLE).input).toEqual(NONE);
  });

  it("reports the raw angle with every tracked frame", () => {
    expect(feed(new GameplayGestureFilter(), pointingHand(60), STABLE).angle).toBeCloseTo(60, 6);
  });

  it("mirroring: a finger the camera sees on its left is the student's right", () => {
    const lm = pointingHand(0);
    expect(lm[8]!.x).toBeLessThan(0.5);
    expect(feed(new GameplayGestureFilter(), lm, STABLE).input).toEqual({ left: false, right: true, jump: false });
  });
});

describe("GameplayGestureFilter: hysteresis on the steering zone", () => {
  it("walking right does not chatter at 30 degrees: it stays right until the finger is past 35", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(10), STABLE);
    expect(f.update(pointingHand(33), 1000).input).toEqual({ left: false, right: true, jump: false });
    expect(f.update(pointingHand(36), 1033).input).toEqual(NONE);
    // entering the walk again needs the plain boundary
    expect(f.update(pointingHand(33), 1066).input).toEqual(NONE);
  });

  it("a direct swing from walking left to walking right goes through stop, never both", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(170), STABLE);
    const seen: string[] = [];
    for (const deg of [150, 120, 100, 60, 10]) {
      const i = f.update(pointingHand(deg), 2000 + deg * 10).input;
      expect(i.left && i.right).toBe(false);
      seen.push(i.left ? "L" : i.right ? "R" : "-");
    }
    expect(seen[seen.length - 1]).toBe("R");
    expect(seen).toContain("-");
  });
});

describe("GameplayGestureFilter: debounce + tracking-lost pause", () => {
  it("tracking loss is an INSTANT neutral", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(10), STABLE + 2);
    const lost = f.update(undefined, 5000);
    expect(lost).toEqual({ tracked: false, cursor: null, pinched: false, angle: null, input: NONE });
  });

  it("after re-acquiring, input stays neutral for the first frames (pause) then resumes", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(10), STABLE + 1);
    f.update(undefined, 5000);
    for (let i = 0; i < STABLE - 1; i++) {
      const o = f.update(pointingHand(10), 5033 + i * 33);
      expect(o.tracked).toBe(true);
      expect(o.input).toEqual(NONE);
    }
    expect(f.update(pointingHand(10), 6000).input.right).toBe(true);
  });

  it("a single dropped frame mid-walk resets the filter (does not keep walking on a stale hand)", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(170), STABLE + 1);
    expect(f.update(pointingHand(170), 3000).input.left).toBe(true);
    expect(f.update(undefined, 3033).input.left).toBe(false);
    expect(f.update(pointingHand(170), 3066).input.left).toBe(false); // paused
  });

  it("incomplete / NaN landmarks are treated as lost", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(170), STABLE);
    const bad = pointingHand(170);
    bad[8] = { x: NaN, y: 0.4 };
    expect(f.update(bad, 100).tracked).toBe(false);
    expect(f.update([{ x: 0, y: 0 }], 133).tracked).toBe(false);
  });

  it("a finger with no direction is tracked but steers nothing", () => {
    const f = new GameplayGestureFilter();
    const flat = pointingHand(90);
    flat[8] = { ...flat[5]! };
    const o = feed(f, flat, STABLE);
    expect(o.tracked).toBe(true);
    expect(o.angle).toBeNull();
    expect(o.input).toEqual(NONE);
  });
});

describe("GameplayGestureFilter: pinch (placement grab)", () => {
  it("pinch needs consecutive confirm frames and releases only above the release ratio", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(-60, { pinchGap: OPEN }), STABLE);
    expect(GAMEPLAY_PINCH_CONFIRM_FRAMES).toBe(2);
    expect(f.update(pointingHand(-60, { pinchGap: PINCH }), 1000).pinched).toBe(false); // 1-frame flicker rejected
    expect(f.update(pointingHand(-60, { pinchGap: OPEN }), 1033).pinched).toBe(false);
    f.update(pointingHand(-60, { pinchGap: PINCH }), 1066);
    expect(f.update(pointingHand(-60, { pinchGap: PINCH }), 1099).pinched).toBe(true);
    // gap 0.46 is above the 0.42 engage ratio but below the 0.50 release ratio: stays pinched
    expect(f.update(pointingHand(-60, { pinchGap: 0.46 }), 1132).pinched).toBe(true);
    expect(f.update(pointingHand(-60, { pinchGap: 0.55 }), 1165).pinched).toBe(false);
  });

  it("a pinch never jumps by default (placement uses pinch to grab)", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(-60, { pinchGap: PINCH }), STABLE + 3);
    const o = f.update(pointingHand(-60, { pinchGap: PINCH }), 9999);
    expect(o.pinched).toBe(true);
    expect(o.input.jump).toBe(false);
  });

  it("legacy enableJump option: a held pinch also jumps, combined with the direction", () => {
    const f = new GameplayGestureFilter({ enableJump: true });
    feed(f, pointingHand(10, { pinchGap: PINCH }), STABLE + 3);
    const o = f.update(pointingHand(10, { pinchGap: PINCH }), 9999);
    expect(o.input).toEqual({ left: false, right: true, jump: true });
    expect(f.update(pointingHand(10, { pinchGap: OPEN + 1 }), 10033).input.jump).toBe(false);
  });

  it("the reported placement cursor is smoothed (jitter damped) but stays in 0..1", () => {
    const f = new GameplayGestureFilter();
    feed(f, pointingHand(90), STABLE);
    const a = f.update(pointingHand(90), 2000).cursor!;
    const b = f.update(pointingHand(60), 2033).cursor!;
    // raw mirrored tip moves from x 0.5 to 0.6; the smoothed cursor moves toward it but lags
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.x).toBeLessThan(0.6 + 1e-9);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(1);
  });
});
