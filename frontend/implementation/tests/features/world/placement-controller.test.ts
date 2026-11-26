import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORLD_BOUNDS,
  PLACE_RING_HOLD_MS,
  clampPlacementToBounds,
  createPlacementController,
  screenDeltaToWorldDelta,
  type PlacementState,
} from "@/src/features/world/placement-controller";
import { DRAG_START_PX, HOLD_MS_PLACE, PLACE_RING_DELAY_MS } from "@/src/nui/core/constants";

describe("placement-controller (pure, no DOM)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches sandbox parity constants (DRAG_START_PX=12, PLACE_RING_DELAY_MS=700, hold=1500)", () => {
    expect(DRAG_START_PX).toBe(12);
    expect(PLACE_RING_DELAY_MS).toBe(700);
    expect(PLACE_RING_HOLD_MS).toBe(HOLD_MS_PLACE);
    expect(PLACE_RING_HOLD_MS).toBe(1500);
  });

  it("clamps placement inside stage bounds and converts screen delta to world delta", () => {
    expect(clampPlacementToBounds(-20, -10, { w: 100, h: 20 }, DEFAULT_WORLD_BOUNDS)).toEqual({ x: 0, y: 0 });
    expect(clampPlacementToBounds(750, 440, { w: 100, h: 20 }, DEFAULT_WORLD_BOUNDS)).toEqual({ x: 700, y: 430 });
    expect(screenDeltaToWorldDelta(160, -90, { width: 1600, height: 900 }, DEFAULT_WORLD_BOUNDS)).toEqual({
      dx: 80,
      dy: -45,
    });
  });

  it("opens 'Taruh di sini' ring 700 ms after resting, closes immediately on drag, and re-arms on release", () => {
    vi.useFakeTimers();
    const states: PlacementState[] = [];
    const ctrl = createPlacementController({
      initial: { x: 200, y: 120 },
      box: { w: 80, h: 20 },
      bounds: DEFAULT_WORLD_BOUNDS,
    });
    const unsub = ctrl.subscribe((s) => states.push(s));

    // Falling -> ring not open
    expect(ctrl.getState().resting).toBe(false);
    expect(ctrl.getState().ringVisible).toBe(false);

    // Landed -> starts 700 ms idle timer
    ctrl.markLanded(210, 140);
    expect(ctrl.getState().resting).toBe(true);
    expect(ctrl.getState().ringVisible).toBe(false);

    vi.advanceTimersByTime(PLACE_RING_DELAY_MS - 1);
    expect(ctrl.getState().ringVisible).toBe(false);

    vi.advanceTimersByTime(1);
    expect(ctrl.getState().ringVisible).toBe(true);

    // Start dragging -> ring closes at once, position follows relative delta clamped to stage bounds
    ctrl.beginDrag();
    expect(ctrl.getState().dragging).toBe(true);
    expect(ctrl.getState().ringVisible).toBe(false);

    ctrl.moveByDelta(95, -50);
    expect(ctrl.getState().position).toEqual({ x: 305, y: 90 });

    // Drag past right/bottom edges -> clamped to [0, 720] x [0, 430]
    ctrl.moveByDelta(700, 500);
    expect(ctrl.getState().position).toEqual({ x: 720, y: 430 });

    ctrl.endDrag();
    expect(ctrl.getState().dragging).toBe(false);
    expect(ctrl.getState().resting).toBe(true);
    expect(ctrl.getState().ringVisible).toBe(false);

    vi.advanceTimersByTime(PLACE_RING_DELAY_MS);
    expect(ctrl.getState().ringVisible).toBe(true);

    // Rotation hides ring and restarts the 700 ms timer
    ctrl.notifyRotated({ x: 700, y: 360 }, { w: 20, h: 80 });
    expect(ctrl.getState().ringVisible).toBe(false);
    vi.advanceTimersByTime(PLACE_RING_DELAY_MS);
    expect(ctrl.getState().ringVisible).toBe(true);

    expect(states.length).toBeGreaterThan(0);
    unsub();
    ctrl.dispose();
  });

  it("cancels pending idle timer on dispose", () => {
    vi.useFakeTimers();
    const ctrl = createPlacementController({ initial: { x: 100, y: 100 }, box: { w: 60, h: 16 } });
    ctrl.markLanded(100, 100);
    ctrl.dispose();
    vi.advanceTimersByTime(PLACE_RING_DELAY_MS + 100);
    expect(ctrl.getState().ringVisible).toBe(false);
  });
});
