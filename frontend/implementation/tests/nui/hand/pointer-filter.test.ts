import { describe, expect, it } from "vitest";
import {
  CONTROL_BOX,
  DISPLAY_TAU_MS,
  POINTER_BETA_PINCH,
  POINTER_COMPUTE_WIDTH,
  POINTER_DEADZONE_PX,
  POINTER_LANDMARK_INDEX,
  POINTER_ONE_EURO,
  chase,
  createPointerFilter,
  fromComputeSpace,
  mapControlBox,
  softDeadzone,
  toComputeSpace,
  type Viewport,
} from "@/src/nui/sources/hand";

const VP: Viewport = { w: 1280, h: 720 };
const ASPECT_16_9 = 16 / 9;

describe("pointer-filter constants (Plan §5.3.4 R1)", () => {
  it("matches exact Recipe R1 specification values", () => {
    expect(POINTER_LANDMARK_INDEX).toBe(5);
    expect(POINTER_COMPUTE_WIDTH).toBe(1280);
    expect(POINTER_ONE_EURO).toEqual({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0, maxGapMs: 500 });
    expect(POINTER_BETA_PINCH).toBe(0.05);
    expect(POINTER_DEADZONE_PX).toBe(4);
    expect(CONTROL_BOX).toEqual({ x0: 0.12, x1: 0.88, y0: 0.1, y1: 0.8 });
    expect(DISPLAY_TAU_MS).toBe(35);
  });
});

describe("toComputeSpace / fromComputeSpace", () => {
  it("mirrors X (1 - x) and scales Y by 1280 / aspect", () => {
    const c = toComputeSpace({ x: 0.25, y: 0.5 }, ASPECT_16_9);
    expect(c.x).toBeCloseTo(0.75 * 1280, 6);
    expect(c.y).toBeCloseTo((0.5 * 1280) / ASPECT_16_9, 6);

    const c43 = toComputeSpace({ x: 0.8, y: 0.5 }, 4 / 3);
    expect(c43.x).toBeCloseTo(0.2 * 1280, 6);
    expect(c43.y).toBeCloseTo(480, 6);

    const back = fromComputeSpace(c, ASPECT_16_9);
    expect(back.x).toBeCloseTo(0.75, 10);
    expect(back.y).toBeCloseTo(0.5, 10);
  });

  it("handles invalid aspect safely without Infinity or NaN", () => {
    const c = toComputeSpace({ x: 0.5, y: 0.5 }, 0);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    const back = fromComputeSpace(c, Number.NaN);
    expect(Number.isFinite(back.x)).toBe(true);
    expect(Number.isFinite(back.y)).toBe(true);
  });
});

describe("mapControlBox", () => {
  it("maps x in 0.12..0.88 and y in 0.10..0.80 to viewport px and clamps outside", () => {
    expect(mapControlBox({ x: 0.12, y: 0.1 }, VP)).toEqual({ x: 0, y: 0 });
    expect(mapControlBox({ x: 0.88, y: 0.8 }, VP)).toEqual({ x: 1280, y: 720 });

    const mid = mapControlBox({ x: 0.5, y: 0.45 }, VP);
    expect(mid.x).toBeCloseTo(640, 6);
    expect(mid.y).toBeCloseTo(360, 6);

    // Clamping beyond box edges
    expect(mapControlBox({ x: 0.0, y: 0.0 }, VP)).toEqual({ x: 0, y: 0 });
    expect(mapControlBox({ x: 1.0, y: 1.0 }, VP)).toEqual({ x: 1280, y: 720 });
    expect(mapControlBox({ x: 0.05, y: 0.95 }, VP)).toEqual({ x: 0, y: 720 });
  });
});

describe("softDeadzone (4 px rope)", () => {
  it("holds anchor stationary within radius and drags continuously beyond radius", () => {
    const anchor = { x: 100, y: 200 };
    // Inside and on boundary
    expect(softDeadzone(anchor, { x: 102, y: 202 }, 4)).toBe(anchor);
    expect(softDeadzone(anchor, { x: 104, y: 200 }, 4)).toBe(anchor);

    // Beyond radius along X: pulled to exactly radius away from target
    const movedX = softDeadzone(anchor, { x: 110, y: 200 }, 4);
    expect(movedX.x).toBeCloseTo(106, 10);
    expect(movedX.y).toBeCloseTo(200, 10);

    // Beyond radius diagonally (3-4-5 triangle * 2 => dist 10)
    const targetDiag = { x: 106, y: 208 };
    const movedDiag = softDeadzone(anchor, targetDiag, 4);
    expect(Math.hypot(targetDiag.x - movedDiag.x, targetDiag.y - movedDiag.y)).toBeCloseTo(4, 10);
    // Zero-jump continuity near boundary
    const tinyStep = softDeadzone(anchor, { x: 104.01, y: 200 }, 4);
    expect(tinyStep.x - anchor.x).toBeCloseTo(0.01, 6);
  });

  it("returns target directly when radius <= 0", () => {
    expect(softDeadzone({ x: 0, y: 0 }, { x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
  });
});

describe("chase (display smoothing tau=35ms, no extrapolation)", () => {
  it("approaches target exponentially with tau=35ms and never overshoots", () => {
    const start = { x: 0, y: 0 };
    const target = { x: 100, y: 200 };

    expect(chase(start, target, 0)).toEqual(start);
    expect(chase(start, target, -10)).toEqual(start);

    const oneTau = chase(start, target, DISPLAY_TAU_MS);
    const k = 1 - Math.exp(-1);
    expect(oneTau.x).toBeCloseTo(100 * k, 6);
    expect(oneTau.y).toBeCloseTo(200 * k, 6);

    // Iterative rAF ticks never overshoot
    let cur = start;
    for (let i = 0; i < 30; i++) {
      const next = chase(cur, target, 16.67);
      expect(next.x).toBeGreaterThanOrEqual(cur.x);
      expect(next.x).toBeLessThanOrEqual(target.x);
      expect(next.y).toBeGreaterThanOrEqual(cur.y);
      expect(next.y).toBeLessThanOrEqual(target.y);
      cur = next;
    }
    expect(cur.x).toBeGreaterThan(99.9);

    // Huge dt still does not extrapolate past target
    const huge = chase(start, target, 100_000);
    expect(huge.x).toBeLessThanOrEqual(target.x);
    expect(huge.y).toBeLessThanOrEqual(target.y);

    // Non-positive tau snaps cleanly
    expect(chase(start, target, 16, 0)).toEqual(target);
  });
});

describe("createPointerFilter", () => {
  it("mirrors raw MCP5, suppresses <=4px compute-space jitter, and maps via control box", () => {
    const pf = createPointerFilter();
    // Raw x = 0.2 -> mirrored x = 0.8; raw y = 0.45 -> ny = 0.5
    const p0 = pf.update({ x: 0.2, y: 0.45 }, 0, false, ASPECT_16_9, VP);
    expect(p0.x).toBeCloseTo(((0.8 - 0.12) / 0.76) * 1280, 4);
    expect(p0.y).toBeCloseTo(360, 4);

    // 2 px compute-space jitter (2 / 1280 = 0.0015625) stays completely frozen by 4px deadzone
    const jitter = 2 / POINTER_COMPUTE_WIDTH;
    for (let i = 1; i <= 10; i++) {
      const p = pf.update({ x: 0.2 + (i % 2 ? jitter : -jitter), y: 0.45 }, i * 33, false, ASPECT_16_9, VP);
      expect(p.x).toBeCloseTo(p0.x, 6);
      expect(p.y).toBeCloseTo(p0.y, 6);
    }
  });

  it("uses higher beta (0.05) while pinching than while hovering (0.01)", () => {
    const hover = createPointerFilter();
    const pinch = createPointerFilter();
    hover.update({ x: 0.5, y: 0.45 }, 0, false, ASPECT_16_9, VP);
    pinch.update({ x: 0.5, y: 0.45 }, 0, true, ASPECT_16_9, VP);

    let pHover = { x: 0, y: 0 };
    let pPinch = { x: 0, y: 0 };
    // Rapid sweep left (raw x decreasing => mirrored x increasing)
    for (let i = 1; i <= 6; i++) {
      const raw = { x: 0.5 - i * 0.04, y: 0.45 };
      pHover = hover.update(raw, i * 33, false, ASPECT_16_9, VP);
      pPinch = pinch.update(raw, i * 33, true, ASPECT_16_9, VP);
    }
    expect(pPinch.x).toBeGreaterThan(pHover.x);
  });

  it("resets both filter and deadzone anchor after gap > maxGapMs or explicit reset()", () => {
    const pf = createPointerFilter();
    pf.update({ x: 0.88, y: 0.1 }, 0, false, ASPECT_16_9, VP); // maps to (0, 0)

    // After >500 ms gap, jumps cleanly to exact center without 4px stale rope lag
    const afterGap = pf.update({ x: 0.5, y: 0.45 }, 600, false, ASPECT_16_9, VP);
    expect(afterGap.x).toBeCloseTo(640, 4);
    expect(afterGap.y).toBeCloseTo(360, 4);

    // Explicit reset also snaps cleanly
    pf.reset();
    const afterReset = pf.update({ x: 0.12, y: 0.8 }, 633, false, ASPECT_16_9, VP);
    expect(afterReset.x).toBeCloseTo(1280, 4);
    expect(afterReset.y).toBeCloseTo(720, 4);
  });

  it("recovers safely from non-finite coordinates", () => {
    const pf = createPointerFilter();
    const bad = pf.update({ x: Number.NaN, y: 0.5 }, 0, false, ASPECT_16_9, VP);
    expect(Number.isFinite(bad.x)).toBe(true);
    expect(Number.isFinite(bad.y)).toBe(true);
    const next = pf.update({ x: 0.5, y: 0.45 }, 33, false, ASPECT_16_9, VP);
    expect(next.x).toBeCloseTo(640, 4);
    expect(next.y).toBeCloseTo(360, 4);
  });
});
