import { describe, expect, it } from "vitest";
import {
  CLICK_ROLLBACK_MS,
  HOVER_LOOKBACK_MS,
  ROLLBACK_WINDOW_MS,
  clickPointAt,
  createRollbackBuffer,
} from "@/src/nui/sources/hand";

describe("rollback-buffer constants (Plan §5.3.4 R1)", () => {
  it("matches 600ms window, 200ms click rollback, and 400ms hover lookback", () => {
    expect(ROLLBACK_WINDOW_MS).toBe(600);
    expect(CLICK_ROLLBACK_MS).toBe(200);
    expect(HOVER_LOOKBACK_MS).toBe(400);
  });
});

describe("createRollbackBuffer", () => {
  it("returns null / size 0 when empty and clears cleanly", () => {
    const buf = createRollbackBuffer();
    expect(buf.size()).toBe(0);
    expect(buf.pointAt(100)).toBeNull();
    expect(clickPointAt(buf, 300)).toBeNull();
    expect(buf.mostHovered(300)).toBeNull();

    buf.push({ x: 10, y: 20, t: 100, hoverId: "btn-1" });
    expect(buf.size()).toBe(1);
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.pointAt(100)).toBeNull();
  });

  it("evicts entries older than 600ms window while keeping at least one entry", () => {
    const buf = createRollbackBuffer();
    for (let t = 0; t <= 1000; t += 100) {
      buf.push({ x: t, y: 0, t });
    }
    // Window [400, 1000] => 7 entries: 400, 500, 600, 700, 800, 900, 1000
    expect(buf.size()).toBe(7);
    // Clamped to earliest retained point (t=400)
    expect(buf.pointAt(0)).toEqual({ x: 400, y: 0 });
    expect(buf.pointAt(400)).toEqual({ x: 400, y: 0 });
  });

  it("interpolates clickPoint at t(PINCH_ON) - 200ms and clamps out-of-range queries", () => {
    const buf = createRollbackBuffer();
    // Aim steady at (200, 300) until t=300, then finger dips down to (200, 360) by PINCH_ON at t=500
    buf.push({ x: 200, y: 300, t: 100 });
    buf.push({ x: 200, y: 300, t: 250 });
    buf.push({ x: 200, y: 320, t: 350 });
    buf.push({ x: 200, y: 360, t: 500 });

    // t(PINCH_ON) - 200ms = 300ms => midpoint between (t=250, y=300) and (t=350, y=320) => y=310
    const cp = clickPointAt(buf, 500);
    expect(cp).toEqual({ x: 200, y: 310 });
    expect(buf.pointAt(500 - CLICK_ROLLBACK_MS)).toEqual({ x: 200, y: 310 });

    // Clamping before first and after last
    expect(buf.pointAt(50)).toEqual({ x: 200, y: 300 });
    expect(buf.pointAt(900)).toEqual({ x: 200, y: 360 });
  });

  it("isolates internal state from external object mutations and ignores invalid/backward entries", () => {
    const buf = createRollbackBuffer();
    const entry = { x: 10, y: 20, t: 100 };
    buf.push(entry);
    entry.x = 999;

    const pt = buf.pointAt(100)!;
    expect(pt).toEqual({ x: 10, y: 20 });
    pt.x = -1;
    expect(buf.pointAt(100)).toEqual({ x: 10, y: 20 });

    // Backward timestamp and non-finite entries are ignored
    buf.push({ x: 50, y: 50, t: 50 });
    buf.push({ x: Number.NaN, y: 0, t: 200 });
    expect(buf.size()).toBe(1);
  });

  it("tracks majority hovered target within 400ms before PINCH_ON (Rule B)", () => {
    const buf = createRollbackBuffer();
    // Old target outside 400ms window before t=600 (t < 200)
    buf.push({ x: 0, y: 0, t: 50, hoverId: "old" });
    buf.push({ x: 0, y: 0, t: 100, hoverId: "old" });
    buf.push({ x: 0, y: 0, t: 150, hoverId: "old" });
    buf.push({ x: 0, y: 0, t: 199, hoverId: "old" });

    // Inside [200, 600]: 3x "target-A", 1x null, 2x "target-B" (flicker at end)
    buf.push({ x: 0, y: 0, t: 200, hoverId: "target-A" });
    buf.push({ x: 0, y: 0, t: 280, hoverId: "target-A" });
    buf.push({ x: 0, y: 0, t: 360, hoverId: "target-A" });
    buf.push({ x: 0, y: 0, t: 440, hoverId: null });
    buf.push({ x: 0, y: 0, t: 520, hoverId: "target-B" });
    buf.push({ x: 0, y: 0, t: 600, hoverId: "target-B" });

    expect(buf.mostHovered(600)).toBe("target-A");
    // Shorter custom lookback [450, 600] sees only "target-B"
    expect(buf.mostHovered(600, 150)).toBe("target-B");
  });

  it("breaks exact hover ties in favor of the more recently hovered target", () => {
    const buf = createRollbackBuffer();
    buf.push({ x: 0, y: 0, t: 200, hoverId: "A" });
    buf.push({ x: 0, y: 0, t: 250, hoverId: "A" });
    buf.push({ x: 0, y: 0, t: 300, hoverId: "B" });
    buf.push({ x: 0, y: 0, t: 350, hoverId: "B" });
    expect(buf.mostHovered(400)).toBe("B");
  });
});
