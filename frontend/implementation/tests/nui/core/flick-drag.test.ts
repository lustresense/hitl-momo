import { describe, expect, it, vi } from "vitest";
import {
  createDragRelative,
  createFlick,
  DRAG_START_PX,
  STICKER_FLICK_UP_PX,
  STICKER_FLICK_WINDOW_MS,
} from "@/src/nui/core";

describe("createFlick (sticker throw, hand.js:186-193)", () => {
  it("fires once on upward flick > 50 px within 160 ms, then disarms until next down", () => {
    const onThrow = vi.fn();
    const flick = createFlick(onThrow);

    flick.down();
    flick.move(400, 1000);
    flick.move(400 - (STICKER_FLICK_UP_PX + 1), 1000 + STICKER_FLICK_WINDOW_MS);
    expect(onThrow).toHaveBeenCalledTimes(1);

    // Continued upward motion while still holding does not re-fire
    flick.move(250, 1200);
    expect(onThrow).toHaveBeenCalledTimes(1);

    // Next pinch re-arms
    flick.up();
    flick.down();
    flick.move(400, 2000);
    flick.move(320, 2050);
    expect(onThrow).toHaveBeenCalledTimes(2);
  });

  it("does NOT fire for 45 px or 50 px upward move, slow move (>160 ms), or downward move", () => {
    const onThrow = vi.fn();
    const flick = createFlick(onThrow);

    // 45 px (PLAN §9.1 explicit negative test)
    flick.down();
    flick.move(300, 1000);
    flick.move(255, 1080);
    expect(onThrow).not.toHaveBeenCalled();
    flick.up();

    // Exactly 50 px (not > 50)
    flick.down();
    flick.move(300, 2000);
    flick.move(250, 2080);
    expect(onThrow).not.toHaveBeenCalled();
    flick.up();

    // 60 px over 161 ms (> STICKER_FLICK_WINDOW_MS)
    flick.down();
    flick.move(300, 3000);
    flick.move(240, 3000 + STICKER_FLICK_WINDOW_MS + 1);
    expect(onThrow).not.toHaveBeenCalled();
    flick.up();

    // Downward move of 100 px
    flick.down();
    flick.move(300, 4000);
    flick.move(400, 4050);
    expect(onThrow).not.toHaveBeenCalled();
  });

  it("ignores moves when down(false) or after up()", () => {
    const onThrow = vi.fn();
    const flick = createFlick(onThrow);

    flick.down(false);
    flick.move(300, 1000);
    flick.move(200, 1050);
    expect(onThrow).not.toHaveBeenCalled();

    flick.down(true);
    flick.move(300, 2000);
    flick.up();
    flick.move(200, 2050);
    expect(onThrow).not.toHaveBeenCalled();
  });
});

describe("createDragRelative (place.js:76-89)", () => {
  it("stays idle below 12 px and starts dragging at >= 12 px with relative deltas", () => {
    const onStart = vi.fn();
    const moves: [number, number][] = [];
    const onEnd = vi.fn();
    const drag = createDragRelative({
      onStart,
      onMove: (dx, dy) => moves.push([dx, dy]),
      onEnd,
    });

    drag.down(200, 300);
    expect(drag.dragging()).toBe(false);

    // 11.9 px (< DRAG_START_PX = 12) does not start
    drag.move(211.9, 300);
    expect(drag.dragging()).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
    expect(moves).toEqual([]);

    // Exactly 12 px starts and reports relative delta from grab origin
    drag.move(200 + DRAG_START_PX, 300);
    expect(drag.dragging()).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(moves).toEqual([[12, 0]]);

    // Further moves report delta from grab origin (not absolute coords) and do not re-trigger onStart
    drag.move(245, 270);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(moves).toEqual([
      [12, 0],
      [45, -30],
    ]);

    drag.up();
    expect(drag.dragging()).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("does not fire onEnd on release if drag threshold was never reached", () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const drag = createDragRelative({ onStart, onEnd });

    drag.down(100, 100);
    drag.move(105, 105); // hypot(5,5) ~ 7.07 < 12
    drag.up();

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(drag.dragging()).toBe(false);
  });

  it("ignores gestures started with ok=false and honors custom threshold", () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const drag = createDragRelative({ onStart, onMove, threshold: 20 });

    drag.down(100, 100, false);
    drag.move(150, 150);
    expect(drag.dragging()).toBe(false);
    expect(onStart).not.toHaveBeenCalled();

    drag.down(100, 100, true);
    drag.move(119, 100);
    expect(drag.dragging()).toBe(false);
    drag.move(120, 100);
    expect(drag.dragging()).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(20, 0);
  });
});
