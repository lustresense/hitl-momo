import { describe, expect, it } from "vitest";
import { CanvasController } from "@/src/features/canvas";
import { DRAW_SOUND, DrawSoundDriver, mapPenSpeed, type DrawSoundClock, type InkEvent } from "@/src/features/canvas/draw-sound";
import type { InputSample } from "@/src/nui/core/types";

function rig() {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const clock: DrawSoundClock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const loops: Array<{ id: string; params: { gain?: number; rate?: number } | undefined; updates: Array<{ gain?: number; rate?: number }>; stops: Array<number | undefined> }> = [];
  const sink = {
    loop: (id: "draw.pencil" | "draw.eraser", params?: { gain?: number; rate?: number }) => {
      const rec = { id, params, updates: [] as Array<{ gain?: number; rate?: number }>, stops: [] as Array<number | undefined> };
      loops.push(rec);
      return { update: (p: { gain?: number; rate?: number }) => void rec.updates.push(p), stop: (f?: number) => void rec.stops.push(f) };
    },
  };
  const driver = new DrawSoundDriver(sink, clock);
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = end;
  };
  return { driver, loops, advance, timers, now: () => now };
}

const begin = (x: number, y: number, t: number, tool: "pencil" | "eraser" = "pencil", effective = true): InkEvent => ({ kind: "begin", tool, x, y, t, effective });
const move = (x: number, y: number, t: number, tool: "pencil" | "eraser" = "pencil", effective = true): InkEvent => ({ kind: "move", tool, x, y, t, effective });

describe("mapPenSpeed", () => {
  it("maps speed to gain 0.25..1 and rate 0.9..1.2, clamped and monotonic", () => {
    expect(mapPenSpeed(0)).toEqual({ gain: 0.25, rate: 0.9 });
    expect(mapPenSpeed(1e9).gain).toBeCloseTo(1);
    expect(mapPenSpeed(1e9).rate).toBeCloseTo(1.2);
    expect(mapPenSpeed(-5).gain).toBe(0.25);
    expect(mapPenSpeed(Number.NaN).gain).toBe(0.25);
    expect(mapPenSpeed(300).gain).toBeLessThan(mapPenSpeed(600).gain);
  });
});

describe("DrawSoundDriver", () => {
  it("never sounds on a bare pen-down or a tiny wiggle (< 3 points or < 10 px)", () => {
    const r = rig();
    r.driver.handle(begin(0, 0, 0));
    r.driver.handle(move(1, 0, 16));
    r.driver.handle(move(2, 0, 32)); // 3 points, 2 px
    r.driver.handle({ kind: "end" });
    expect(r.loops).toHaveLength(0);
  });

  it("starts after >= 3 points and >= 10 px, and stops with a 120 ms fade on stroke end", () => {
    const r = rig();
    r.driver.handle(begin(0, 0, 0));
    r.driver.handle(move(6, 0, 16));
    expect(r.loops).toHaveLength(0);
    r.driver.handle(move(12, 0, 32));
    expect(r.loops).toHaveLength(1);
    expect(r.loops[0]!.id).toBe("draw.pencil");
    r.driver.handle({ kind: "end" });
    expect(r.loops[0]!.stops).toEqual([DRAW_SOUND.STOP_FADE_MS]);
    expect(r.driver.sounding).toBe(false);
    expect(r.timers).toHaveLength(0);
  });

  it("throttles updates to <= 20/s and keeps gain/rate inside the mapped range", () => {
    const r = rig();
    r.driver.handle(begin(0, 0, 0));
    let x = 0;
    for (let i = 1; i <= 120; i++) {
      x += 8;
      r.advance(8); // 125 Hz samples
      r.driver.handle(move(x, 0, i * 8));
    }
    const rec = r.loops[0]!;
    expect(rec.updates.length).toBeLessThanOrEqual(20); // ~1 s of input
    expect(rec.updates.length).toBeGreaterThan(5);
    for (const u of [rec.params!, ...rec.updates]) {
      expect(u.gain!).toBeGreaterThanOrEqual(0.25);
      expect(u.gain!).toBeLessThanOrEqual(1);
      expect(u.rate!).toBeGreaterThanOrEqual(0.9);
      expect(u.rate!).toBeLessThanOrEqual(1.2);
    }
    r.driver.handle({ kind: "end" });
  });

  it("faster pen = louder and higher", () => {
    const slow = rig();
    slow.driver.handle(begin(0, 0, 0));
    for (let i = 1; i <= 10; i++) slow.driver.handle(move(i * 2, 0, i * 16));
    const fast = rig();
    fast.driver.handle(begin(0, 0, 0));
    for (let i = 1; i <= 10; i++) fast.driver.handle(move(i * 20, 0, i * 16));
    expect(fast.loops[0]!.params!.gain!).toBeGreaterThan(slow.loops[0]?.params?.gain ?? 0);
  });

  it("safety stop: a loop with no samples for ~250 ms is stopped, and must re-qualify to sound again", () => {
    const r = rig();
    r.driver.handle(begin(0, 0, 0));
    r.driver.handle(move(10, 0, 16));
    r.driver.handle(move(20, 0, 32));
    expect(r.driver.sounding).toBe(true);
    r.advance(100);
    r.driver.handle(move(30, 0, 132));
    r.advance(240);
    expect(r.driver.sounding).toBe(true); // still within 250 ms of the last sample
    r.advance(40);
    expect(r.driver.sounding).toBe(false);
    expect(r.loops[0]!.stops).toEqual([120]);
    // resuming: one point is not enough
    r.driver.handle(move(31, 0, 600));
    expect(r.loops).toHaveLength(1);
    r.driver.handle(move(45, 0, 616));
    r.driver.handle(move(60, 0, 632));
    expect(r.loops).toHaveLength(2);
    r.driver.handle({ kind: "end" });
  });

  it("a move without a begin, or after the tool switched, never sounds", () => {
    const r = rig();
    for (let i = 1; i <= 10; i++) r.driver.handle(move(i * 20, 0, i * 16));
    expect(r.loops).toHaveLength(0);
    r.driver.handle(begin(0, 0, 0, "pencil"));
    for (let i = 1; i <= 10; i++) r.driver.handle(move(i * 20, 0, i * 16, "eraser"));
    expect(r.loops).toHaveLength(0);
  });

  it("eraser: only effective erasing counts; touching nothing is silent and gives no keep-alive", () => {
    const r = rig();
    r.driver.handle(begin(0, 0, 0, "eraser", false));
    for (let i = 1; i <= 10; i++) r.driver.handle(move(i * 20, 0, i * 16, "eraser", false));
    expect(r.loops).toHaveLength(0);
    for (let i = 11; i <= 14; i++) r.driver.handle(move(i * 20, 0, i * 16, "eraser", true));
    expect(r.loops).toHaveLength(1);
    expect(r.loops[0]!.id).toBe("draw.eraser");
    r.driver.handle({ kind: "end" });
    expect(r.loops[0]!.stops).toEqual([120]);
  });

  it("a new begin stops a loop still running; dispose stops and ignores later events", () => {
    const r = rig();
    r.driver.handle(begin(0, 0, 0));
    for (let i = 1; i <= 5; i++) r.driver.handle(move(i * 20, 0, i * 16));
    r.driver.handle(begin(0, 50, 100));
    expect(r.loops[0]!.stops).toHaveLength(1);
    for (let i = 1; i <= 5; i++) r.driver.handle(move(i * 20, 50, 100 + i * 16));
    expect(r.loops).toHaveLength(2);
    r.driver.dispose();
    expect(r.loops[1]!.stops).toHaveLength(1);
    r.driver.handle(begin(0, 0, 0));
    for (let i = 1; i <= 5; i++) r.driver.handle(move(i * 20, 0, i * 16));
    expect(r.loops).toHaveLength(2);
    expect(r.timers).toHaveLength(0);
  });
});

describe("CanvasController observers (no behaviour change)", () => {
  const sample = (x: number, y: number, pinch: boolean, t: number, extra: Partial<InputSample> = {}): InputSample => ({
    t, x, y, inFrame: true, pinch, pinchStrength: pinch ? 1 : 0, source: "mouse", ...extra,
  });
  const make = () => {
    const ink: InkEvent[] = [];
    const tools: string[] = [];
    const ctrl = new CanvasController({
      onInk: (e) => ink.push(e),
      onToolAction: (t) => tools.push(t),
      getMetrics: () => ({ rect: { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }, canvasWidth: 1000, canvasHeight: 600, dpr: 1 }),
    });
    return { ctrl, ink, tools };
  };

  it("reports begin / move / end for a stroke, and end on tracking loss", () => {
    const { ctrl, ink } = make();
    ctrl.feedSample(sample(100, 100, true, 0));
    ctrl.feedSample(sample(150, 120, true, 16));
    ctrl.feedSample(sample(150, 120, false, 32));
    expect(ink.map((e) => e.kind)).toEqual(["begin", "move", "end"]);
    ctrl.feedSample(sample(100, 100, false, 40));
    ctrl.feedSample(sample(100, 100, true, 48));
    ctrl.feedSample(sample(100, 100, true, 56, { inFrame: false }));
    expect(ink.map((e) => e.kind)).toEqual(["begin", "move", "end", "begin", "end"]);
  });

  it("a pen-down outside the paper or in chrome never begins; ink disabled ends the stroke", () => {
    const { ctrl, ink } = make();
    ctrl.feedSample(sample(2000, 100, true, 0)); // outside the paper
    ctrl.feedSample(sample(100, 100, false, 8));
    ctrl.feedSample(sample(100, 100, true, 16), true); // chrome
    expect(ink).toEqual([]);
    ctrl.feedSample(sample(100, 100, false, 20));
    ctrl.feedSample(sample(100, 100, true, 24));
    ctrl.setInkEnabled(false);
    expect(ink.map((e) => e.kind)).toEqual(["begin", "end"]);
  });

  it("tool actions fire only on a real change", () => {
    const { ctrl, tools } = make();
    ctrl.selectTool("pencil"); // already pencil
    ctrl.selectTool("undo"); // nothing to undo
    ctrl.selectTool("clear"); // nothing to clear
    ctrl.selectTool("eraser");
    ctrl.selectTool("eraser");
    ctrl.selectTool("pencil");
    ctrl.feedSample(sample(100, 100, true, 0));
    ctrl.feedSample(sample(150, 120, true, 16));
    ctrl.feedSample(sample(150, 120, false, 32));
    ctrl.selectTool("undo");
    ctrl.selectTool("redo");
    ctrl.selectTool("redo");
    ctrl.selectTool("clear");
    expect(tools).toEqual(["eraser", "pencil", "undo", "redo", "clear"]);
  });

  it("dispose ends any open stroke sound", () => {
    const { ctrl, ink } = make();
    ctrl.dispose();
    expect(ink.at(-1)).toEqual({ kind: "end" });
  });
});
