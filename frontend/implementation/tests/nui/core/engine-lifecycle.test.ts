import { describe, expect, it, vi } from "vitest";
import { RING_DRAIN_RATIO, RING_DT_CAP_MS, TARGET_MIN_AGE_MS } from "@/src/nui/core";
import { makeHarness, rect } from "./harness";

describe("NuiEngine timing, chrome, keyboard, and lifecycle", () => {
  it("suppresses quick clicks without hold, drains at 0.5x, caps dt at 50 ms, and clamps negative dt", async () => {
    const { engine, sample, advance, setNow, getNow } = makeHarness(1000);
    const onFire = vi.fn();
    const h = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 1000, onFire });
    advance(50);

    // Quick click: 100 ms pinch then release -> never fires
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(100);
    expect(h.state.p).toBeCloseTo(0.1, 6);
    engine.feed(sample({ x: 50, y: 50, pinch: false }));
    advance(100);
    // Drain 0.5x: 0.1 - (100/1000)*0.5 = 0.05
    expect(h.state.p).toBeCloseTo(0.1 - 0.1 * RING_DRAIN_RATIO, 6);
    advance(200);
    expect(h.state.p).toBe(0);
    await Promise.resolve();
    expect(onFire).not.toHaveBeenCalled();

    // dt cap at 50 ms on a 900 ms frame jump
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    const before = getNow();
    setNow(before + 900);
    engine.tick(before + 900);
    expect(h.state.p).toBeCloseTo(RING_DT_CAP_MS / 1000, 6);

    // Out-of-order timestamp (tnow < last) clamps dt = 0
    engine.tick(before + 800);
    expect(h.state.p).toBeCloseTo(RING_DT_CAP_MS / 1000, 6);
  });

  it("ignores chrome pinches and prevents mid-pinch lock after dragging off chrome", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const h = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 500 });
    advance(50);

    engine.feed(sample({ x: 50, y: 50, pinch: true }), true);
    advance(100);
    expect(h.state.holding).toBe(false);
    expect(engine.pointer().down).toBe(false);

    // Dragging off chrome while still pinching stays unlocked
    engine.feed(sample({ x: 60, y: 50, pinch: true }), false);
    advance(200);
    expect(h.state.holding).toBe(false);

    expect(engine.isChrome({ closest: () => ({ id: "gate" }) })).toBe(true);
    expect(engine.isChrome({ closest: () => null })).toBe(false);
  });

  it("supports keyboard Enter/Space hold, works after drag-release, enforces repeat latch, and coexists with pointer", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const a = engine.register({ getRect: () => rect(0, 0, 100, 100), holdMs: 200 });
    const b = engine.register({ getRect: () => rect(300, 0, 400, 100), holdMs: 200 });
    advance(50);

    // Drag > 26 px then release (must clear P.moved so subsequent keyboard hold works)
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    engine.feed(sample({ x: 100, y: 50, pinch: true }));
    expect(engine.pointer().moved).toBe(true);
    engine.feed(sample({ x: 350, y: 50, pinch: false }));
    expect(engine.pointer().moved).toBe(false);
    advance(50);
    expect(b.state.lit).toBe(true);

    // Hold Enter/Space -> locks lit target B and fires
    expect(engine.keyDown()).toBe(true);
    advance(200);
    expect(b.state.done).toBe(true);

    // Auto-repeat keyDown while key still held must NOT immediately lock remaining target A
    expect(engine.keyDown()).toBe(false);
    advance(200);
    expect(a.state.holding).toBe(false);

    // Release key then hold pointer + key; keyUp while pointer stays down keeps pointer lock
    engine.keyUp();
    advance(50);
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    expect(engine.keyDown()).toBe(true);
    advance(100);
    engine.keyUp();
    advance(100);
    expect(a.state.done).toBe(true);
  });

  it("handles blur(), remove(), reset() latch age, and hidden target rects cleanly", () => {
    const { engine, sample, advance } = makeHarness(1000);
    let visible = true;
    const h = engine.register({
      getRect: () => (visible ? rect(0, 0, 100, 100) : null),
      holdMs: 200,
    });
    advance(50);

    // Blur releases both pointer and keyboard locks
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    engine.keyDown();
    advance(100);
    expect(h.state.holding).toBe(true);
    engine.blur();
    advance(50);
    expect(h.state.holding).toBe(false);
    expect(engine.pointer().down).toBe(false);
    expect(engine.pointer().key).toBe(false);

    // Hidden target clears lit and holding
    visible = false;
    advance(50);
    expect(h.state.lit).toBe(false);
    expect(h.state.holding).toBe(false);

    // Show, fire, then reset -> refreshes since and enforces TARGET_MIN_AGE_MS again
    visible = true;
    advance(50);
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(200);
    expect(h.state.done).toBe(true);

    engine.feed(sample({ x: 50, y: 50, pinch: false }));
    h.reset();
    expect(h.state.p).toBe(0);
    expect(h.state.done).toBe(false);
    expect(h.state.firedAt).toBe(0);

    // Pinching immediately after reset (age <= 30 ms) does not lock
    advance(TARGET_MIN_AGE_MS, TARGET_MIN_AGE_MS);
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(100);
    expect(h.state.holding).toBe(false);

    // Release and pinch after > 30 ms locks; remove() clears lock and flags
    engine.feed(sample({ x: 50, y: 50, pinch: false }));
    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(50);
    expect(h.state.holding).toBe(true);
    h.remove();
    expect(h.state.lit).toBe(false);
    expect(h.state.holding).toBe(false);
  });

  it("uses holdMs(label) when opts.holdMs is omitted or non-positive", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const place = engine.register({ getRect: () => rect(0, 0, 100, 100), label: "Taruh di sini" });
    advance(50);

    engine.feed(sample({ x: 50, y: 50, pinch: true }));
    advance(750);
    expect(place.state.p).toBeCloseTo(0.5, 6);
    advance(750);
    expect(place.state.done).toBe(true);
  });
});
