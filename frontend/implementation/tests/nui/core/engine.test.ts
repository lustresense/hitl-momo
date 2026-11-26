import { describe, expect, it, vi } from "vitest";
import {
  MOVE_CANCEL_PX,
  NuiEngine,
  RING_DRAIN_RATIO,
  TARGET_MIN_AGE_MS,
  type Point,
} from "@/src/nui/core";
import { makeHarness, rect } from "./harness";

describe("NuiEngine rules A/B/C/D and latch (port hand.js)", () => {
  it("Rule A: single any target lights up anywhere, fills on pinch anywhere, and fires onFire", async () => {
    const { engine, sample, advance, getNow } = makeHarness(1000);
    const onFire = vi.fn();
    const h = engine.register({ getRect: () => rect(400, 400, 500, 500), label: "Ayo", onFire });

    advance(50);
    expect(h.state.kind).toBe("A");
    expect(h.state.lit).toBe(true);

    // Pinch far outside target rect
    engine.feed(sample({ x: 10, y: 10, pinch: true }));
    advance(500);
    expect(h.state.holding).toBe(true);
    expect(h.state.p).toBeCloseTo(0.5, 6);
    expect(onFire).not.toHaveBeenCalled();

    advance(500);
    expect(h.state.p).toBe(1);
    expect(h.state.done).toBe(true);
    expect(h.state.holding).toBe(false);
    expect(h.state.lit).toBe(false);
    expect(h.state.firedAt).toBe(getNow());

    await Promise.resolve();
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("Rule B: lights nearest target, locks on pinch start, ignores wobble, switches after release", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const a = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 1000 });
    const b = engine.register({ getRect: () => rect(300, 0, 400, 100), holdMs: 1000 });

    // Out of frame -> neither lit
    engine.feed(sample({ x: 50, y: 50, inFrame: false }));
    advance(50);
    expect(a.state.kind).toBe("B");
    expect(a.state.lit).toBe(false);
    expect(b.state.lit).toBe(false);

    // Hover near A -> A lit
    engine.feed(sample({ x: 60, y: 50, inFrame: true }));
    advance(50);
    expect(a.state.lit).toBe(true);
    expect(b.state.lit).toBe(false);

    // Pinch near A -> A locks; wobble 20 px toward B keeps A locked
    engine.feed(sample({ x: 60, y: 50, pinch: true }));
    advance(100);
    engine.feed(sample({ x: 80, y: 50, pinch: true }));
    advance(100);
    expect(a.state.lit).toBe(true);
    expect(a.state.holding).toBe(true);
    expect(b.state.lit).toBe(false);

    // Release -> move near B -> B lights up and locks on next pinch
    engine.feed(sample({ x: 350, y: 50, pinch: false }));
    advance(50);
    expect(a.state.lit).toBe(false);
    expect(b.state.lit).toBe(true);

    engine.feed(sample({ x: 350, y: 50, pinch: true }));
    advance(100);
    expect(b.state.holding).toBe(true);
    expect(a.state.holding).toBe(false);
  });

  it("Rule B with hand clickPoint rollback locks rolled-back target without false 26px cancel on frame 0", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const a = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 1000 });
    const b = engine.register({ getRect: () => rect(220, 0, 320, 100), holdMs: 1000 });
    advance(50);

    // Hand drifted 40 px right during pinch close; clickPoint (200 ms ago) was over A.
    const clickPoint: Point = { x: 80, y: 50 };
    engine.feed(sample({ x: 120, y: 50, pinch: true, clickPoint, source: "hand" }));
    advance(100);
    expect(a.state.holding).toBe(true);
    expect(b.state.holding).toBe(false);
    expect(engine.pointer().moved).toBe(false);
  });

  it("Rule D with a hand locks the point target under the palm-center cursor first (same spot where the ring is drawn), nib only as fallback", () => {
    const { engine, sample, advance } = makeHarness(1000);
    engine.setCanvasMode(true);
    const upper = engine.register({ getRect: () => rect(300, 0, 400, 100), mode: "point", holdMs: 1000 });
    const lower = engine.register({ getRect: () => rect(300, 120, 400, 220), mode: "point", holdMs: 1000 });
    advance(500);

    // Palm-center cursor (x, y) is over the lower button (where the ring is shown); nib drifted to the upper one.
    engine.feed(sample({ x: 350, y: 170, nib: { x: 350, y: 50 }, pinch: true, source: "hand" }));
    advance(100);
    expect(lower.state.holding).toBe(true);
    expect(upper.state.holding).toBe(false);
  });

  it("Rule C: moving <= 26 px keeps filling; moving > 26 px cancels hold until release", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const h = engine.register({ getRect: () => rect(100, 100, 200, 200), holdMs: 1000 });
    advance(50);

    engine.feed(sample({ x: 150, y: 150, pinch: true }));
    advance(200);
    expect(h.state.p).toBeCloseTo(0.2, 6);

    // Exactly 26 px: still holding
    engine.feed(sample({ x: 150 + MOVE_CANCEL_PX, y: 150, pinch: true }));
    advance(100);
    expect(h.state.holding).toBe(true);
    expect(h.state.p).toBeCloseTo(0.3, 6);

    // 27 px (> 26): cancels hold and drains even if moving back to origin while still pinching
    engine.feed(sample({ x: 150 + MOVE_CANCEL_PX + 1, y: 150, pinch: true }));
    advance(100);
    expect(h.state.holding).toBe(false);
    expect(engine.pointer().moved).toBe(true);
    expect(h.state.p).toBeCloseTo(0.3 - 0.1 * RING_DRAIN_RATIO, 6);

    engine.feed(sample({ x: 150, y: 150, pinch: true }));
    advance(100);
    expect(h.state.holding).toBe(false);
  });

  it("Rule C (hand non-canvas): tolerates 40 px mid-air palm sway (cancels only > 56 px), while mouse stays 26 px", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const h = engine.register({ getRect: () => rect(100, 100, 200, 200), holdMs: 1000 });
    advance(50);

    // Hand non-canvas pinch start at (150, 150)
    engine.feed(sample({ x: 150, y: 150, pinch: true, source: "hand" }));
    advance(200);
    expect(h.state.holding).toBe(true);
    expect(h.state.p).toBeCloseTo(0.2, 6);

    // 40 px sway (> 26 px mouse threshold, <= 56 px hand threshold): keeps holding & filling!
    engine.feed(sample({ x: 190, y: 150, pinch: true, source: "hand" }));
    advance(200);
    expect(h.state.holding).toBe(true);
    expect(engine.pointer().moved).toBe(false);
    expect(h.state.p).toBeCloseTo(0.4, 6);

    // Exactly 56 px sway: still holding
    engine.feed(sample({ x: 206, y: 150, pinch: true, source: "hand" }));
    advance(100);
    expect(h.state.holding).toBe(true);
    expect(h.state.p).toBeCloseTo(0.5, 6);

    // 57 px sway (> 56 px): cancels hold
    engine.feed(sample({ x: 207, y: 150, pinch: true, source: "hand" }));
    advance(100);
    expect(h.state.holding).toBe(false);
    expect(engine.pointer().moved).toBe(true);

    // Release and confirm mouse non-canvas still cancels at > 26 px
    engine.feed(sample({ x: 150, y: 150, pinch: false, source: "mouse" }));
    advance(50);
    engine.feed(sample({ x: 150, y: 150, pinch: true, source: "mouse" }));
    advance(100);
    expect(h.state.holding).toBe(true);
    engine.feed(sample({ x: 150 + MOVE_CANCEL_PX + 1, y: 150, pinch: true, source: "mouse" }));
    advance(100);
    expect(h.state.holding).toBe(false);
    expect(engine.pointer().moved).toBe(true);
  });

  it("Rule D: canvasMode disables A/B and only permits point targets when pinch starts inside", async () => {
    const { engine, sample, advance } = makeHarness(1000);
    const onPointFire = vi.fn();
    const anyTarget = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 1000 });
    const pointTarget = engine.register({
      getRect: () => rect(300, 300, 400, 400),
      mode: "point",
      holdMs: 500,
      onFire: onPointFire,
    });

    engine.setCanvasMode(true);
    expect(engine.getCanvasMode()).toBe(true);
    advance(50);
    expect(anyTarget.state.kind).toBe("D");
    expect(anyTarget.state.lit).toBe(false);
    expect(pointTarget.state.kind).toBe("D");
    expect(pointTarget.state.lit).toBe(false);

    // Pinch inside anyTarget -> blocked in canvasMode
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(200);
    expect(anyTarget.state.holding).toBe(false);
    expect(pointTarget.state.holding).toBe(false);
    engine.feed(sample({ x: 50, y: 50, pinch: false }));

    // Pinch outside pointTarget -> blocked
    engine.feed(sample({ x: 250, y: 350, pinch: true }));
    advance(200);
    expect(pointTarget.state.holding).toBe(false);
    engine.feed(sample({ x: 250, y: 350, pinch: false }));

    // Pinch inside pointTarget -> fills exactly to 1 over 500 ms and fires
    engine.feed(sample({ x: 350, y: 350, pinch: true }));
    advance(500);
    expect(pointTarget.state.p).toBe(1);
    expect(pointTarget.state.done).toBe(true);
    await Promise.resolve();
    expect(onPointFire).toHaveBeenCalledTimes(1);
  });

  it("Rule D: point targets honor custom contains() and stay outside A/B pool when canvasMode is off", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const anyTarget = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 1000 });
    const circle = engine.register({
      getRect: () => rect(200, 200, 300, 300),
      mode: "point",
      holdMs: 500,
      contains: (x, y) => Math.hypot(x - 250, y - 250) <= 40,
    });

    advance(50);
    // Only 1 target in pool -> Rule A for anyTarget, Rule D for circle
    expect(anyTarget.state.kind).toBe("A");
    expect(anyTarget.state.lit).toBe(true);
    expect(circle.state.kind).toBe("D");
    expect(circle.state.lit).toBe(false);

    // Corner of bounding box (205, 205) is outside radius 40 -> falls through to Rule A target
    engine.feed(sample({ x: 205, y: 205, pinch: true }));
    advance(100);
    expect(circle.state.holding).toBe(false);
    expect(anyTarget.state.holding).toBe(true);
    engine.feed(sample({ x: 205, y: 205, pinch: false }));

    // Inside custom circle -> locks point target instead of Rule A target
    engine.feed(sample({ x: 250, y: 250, pinch: true }));
    advance(100);
    expect(circle.state.holding).toBe(true);
    expect(anyTarget.state.holding).toBe(false);
  });

  it("Latch: targets appearing during an active pinch, inside onFire, or <= 30 ms old wait for a fresh pinch", async () => {
    const { engine, sample, advance } = makeHarness(1000);

    // Case 1: pinch starts before target exists -> target registered mid-pinch must wait
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(50);
    let second: ReturnType<NuiEngine["register"]> | null = null;
    const first = engine.register({
      getRect: () => rect(0, 0, 100, 100),
      holdMs: 200,
      onFire: () => {
        second = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 200 });
      },
    });
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(400);
    expect(first.state.holding).toBe(false);
    expect(first.state.p).toBe(0);

    // Release and fresh pinch -> first fires and registers second while pinch stays held
    engine.feed(sample({ x: 50, y: 50, pinch: false }));
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(200);
    await Promise.resolve();
    expect(first.state.done).toBe(true);
    expect(second).not.toBeNull();

    // Case 2: pinch still held -> second must NOT fill
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(300);
    expect(second!.state.holding).toBe(false);
    expect(second!.state.p).toBe(0);

    // Case 3: fresh target <= TARGET_MIN_AGE_MS (30 ms) old is not locked on immediate pinch
    engine.feed(sample({ x: 50, y: 50, pinch: false }));
    const fresh = engine.register({ getRect: () => rect(200, 0, 300, 100), holdMs: 200 });
    second!.remove();
    advance(TARGET_MIN_AGE_MS, TARGET_MIN_AGE_MS);
    engine.feed(sample({ x: 250, y: 50, pinch: true }));
    advance(300);
    expect(fresh.state.holding).toBe(false);

    // Release + fresh pinch now that age > 30 ms -> locks and fills
    engine.feed(sample({ x: 250, y: 50, pinch: false }));
    engine.feed(sample({ x: 250, y: 50, pinch: true }));
    advance(200);
    expect(fresh.state.done).toBe(true);
  });
});
