import { describe, expect, it } from "vitest";
import { R1_STICKY_HOVER_PAD_PX, TARGET_MIN_AGE_MS } from "@/src/nui/core";
import { makeHarness, rect } from "./harness";

describe("NuiEngine R1 parity: sticky hover 24px & mostHovered 400ms (BERAT-3)", () => {
  it("applies 24px sticky hover in Mode B non-canvas and turns magnet off in canvas mode", () => {
    const { engine, sample, advance } = makeHarness(1000);
    // Two 64x64 targets separated by a 24px gap: [100..164] and [188..252], midpoint x=176.
    const left = engine.register({ id: "t-left", getRect: () => rect(100, 100, 164, 164), holdMs: 1000 });
    const right = engine.register({ id: "t-right", getRect: () => rect(188, 100, 252, 164), holdMs: 1000 });
    const pointBtn = engine.register({
      id: "t-point",
      getRect: () => rect(400, 100, 480, 180),
      mode: "point",
      holdMs: 500,
    });
    expect(R1_STICKY_HOVER_PAD_PX).toBe(24);

    // 1) Hover over left -> left lights up
    engine.feed(sample({ x: 132, y: 132, inFrame: true }));
    advance(50);
    expect(left.state.lit).toBe(true);
    expect(right.state.lit).toBe(false);
    expect(engine.getLitTargetId()).toBe("t-left");

    // 2) Drift past midpoint (x=180, closer to right) but inside left + 24px (188) and outside right -> stays left!
    engine.feed(sample({ x: 180, y: 132, inFrame: true }));
    advance(50);
    expect(left.state.lit).toBe(true);
    expect(right.state.lit).toBe(false);
    expect(engine.hoverIdAt(180, 132)).toBe("t-left");

    // 3) Enter right's actual rect (x=188) -> switches cleanly to right
    engine.feed(sample({ x: 188, y: 132, inFrame: true }));
    advance(50);
    expect(left.state.lit).toBe(false);
    expect(right.state.lit).toBe(true);
    expect(engine.getLitTargetId()).toBe("t-right");

    // 4) Drift back into gap past midpoint (x=170) -> sticks to right!
    engine.feed(sample({ x: 170, y: 132, inFrame: true }));
    advance(50);
    expect(right.state.lit).toBe(true);
    expect(left.state.lit).toBe(false);

    // 5) Canvas mode turns magnet OFF completely: lit clears, hoverIdAt returns null, point target needs exact hit
    engine.setCanvasMode(true);
    expect(engine.getLitTargetId()).toBeNull();
    expect(engine.hoverIdAt(132, 132)).toBeNull();
    advance(50);
    expect(left.state.lit).toBe(false);
    expect(right.state.lit).toBe(false);

    // 10px outside pointBtn (within 24px pad!) must NOT lock in canvas mode
    engine.feed(sample({ x: 390, y: 140, pinch: true, source: "hand" }));
    advance(100);
    expect(pointBtn.state.holding).toBe(false);
    expect(left.state.holding).toBe(false);
    expect(right.state.holding).toBe(false);
  });

  it("prioritizes hand preferredHoverId (mostHovered 400ms) on Mode B PINCH_ON before nearestItem fallback", () => {
    const { engine, sample, advance } = makeHarness(1000);
    const a = engine.register({ id: "btn-a", getRect: () => rect(100, 100, 164, 164), holdMs: 500 });
    const b = engine.register({ id: "btn-b", getRect: () => rect(188, 100, 252, 164), holdMs: 500 });
    advance(50);

    // Hand pinch starts with clickPoint & x directly over btn-b, but preferredHoverId is btn-a -> btn-a wins!
    engine.feed(
      sample({
        x: 220,
        y: 132,
        clickPoint: { x: 210, y: 132 },
        preferredHoverId: "btn-a",
        pinch: true,
        source: "hand",
      }),
    );
    advance(100);
    expect(a.state.holding).toBe(true);
    expect(b.state.holding).toBe(false);
    engine.feed(sample({ x: 220, y: 132, pinch: false, source: "hand" }));
    advance(50);

    // Non-hand source ignores preferredHoverId and locks nearestItem (btn-b)
    engine.feed(
      sample({
        x: 220,
        y: 132,
        preferredHoverId: "btn-a",
        pinch: true,
        source: "mouse",
      }),
    );
    advance(100);
    expect(b.state.holding).toBe(true);
    expect(a.state.holding).toBe(false);
    engine.feed(sample({ x: 220, y: 132, pinch: false, source: "mouse" }));
    advance(50);

    // Unknown or stale/too-young preferredHoverId falls back cleanly to nearestItem
    const fresh = engine.register({ id: "btn-fresh", getRect: () => rect(400, 100, 464, 164), holdMs: 500 });
    advance(TARGET_MIN_AGE_MS, TARGET_MIN_AGE_MS);
    engine.feed(
      sample({
        x: 220,
        y: 132,
        preferredHoverId: "btn-fresh",
        pinch: true,
        source: "hand",
      }),
    );
    advance(100);
    expect(fresh.state.holding).toBe(false);
    expect(b.state.holding).toBe(true);
  });
});
