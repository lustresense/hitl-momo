import { describe, expect, it, vi } from "vitest";
import {
  createJoystick,
  JOY_BASE,
  JOY_DEADZONE_PX,
  JOY_FLICK_COOLDOWN_MS,
  JOY_FLICK_UP_PX,
  JOY_FLICK_WINDOW_MS,
  JOY_GAIN,
  JOY_SPAN_PX,
  TAP_JUMP_MS,
  TAP_MAX_MOVE_PX,
  type JumpKind,
} from "@/src/nui/core";

describe("createJoystick (port hand.js:162-184)", () => {
  it("reports inactive state before down and after up", () => {
    const joy = createJoystick();
    expect(joy.active()).toBe(false);
    expect(joy.origin()).toBeNull();
    expect(joy.dir()).toBe(0);

    joy.down(200, 300, 1000);
    expect(joy.active()).toBe(true);
    expect(joy.origin()).toEqual({ x: 200, y: 300 });
    expect(joy.dir()).toBe(0);

    joy.move(300, 300, 1020);
    expect(joy.dir()).toBeGreaterThan(0);

    joy.up(1300);
    expect(joy.active()).toBe(false);
    expect(joy.origin()).toBeNull();
    expect(joy.dir()).toBe(0);
  });

  it("matches exact axis formula at all PLAN §9.1 test points (dx = 13, 14, 15, 69, 124, 200, -200)", () => {
    const joy = createJoystick();
    const ox = 500;
    const oy = 300;
    joy.down(ox, oy, 1000);

    const cases: readonly (readonly [number, number])[] = [
      [13, 0],
      [14, JOY_BASE],
      [15, JOY_BASE + ((15 - JOY_DEADZONE_PX) / JOY_SPAN_PX) * JOY_GAIN],
      [69, 0.675],
      [124, 1],
      [200, 1],
      [-200, -1],
      [-13, 0],
      [-14, -JOY_BASE],
      [-69, -0.675],
      [-124, -1],
    ];

    let t = 1010;
    for (const [dx, expected] of cases) {
      joy.move(ox + dx, oy, t);
      t += 16;
      expect(joy.dir()).toBeCloseTo(expected, 10);
    }
  });

  it("ignores down when ok=false or when() returns false", () => {
    const onJump = vi.fn();
    let allowed = false;
    const joy = createJoystick({ onJump, when: () => allowed });

    joy.down(100, 100, 100, false);
    expect(joy.active()).toBe(false);

    joy.down(100, 100, 100, true);
    expect(joy.active()).toBe(false);

    allowed = true;
    joy.down(100, 100, 200, true);
    expect(joy.active()).toBe(true);
    joy.up(250);
    expect(onJump).toHaveBeenCalledWith("tap");
  });

  describe("tap jump (<230 ms and move <= 10 px)", () => {
    it("fires tap jump for short pinch with move <= 10 px", () => {
      const jumps: JumpKind[] = [];
      const joy = createJoystick({ onJump: (k) => jumps.push(k) });

      // 0 px move, 229 ms
      joy.down(100, 100, 1000);
      joy.up(1000 + TAP_JUMP_MS - 1);
      expect(jumps).toEqual(["tap"]);

      // Exactly 10 px move (hypot(6, 8) = 10), 100 ms
      joy.down(100, 100, 2000);
      joy.move(106, 108, 2050);
      joy.up(2100);
      expect(jumps).toEqual(["tap", "tap"]);
    });

    it("does NOT fire tap jump when movement reaches 11 px or duration reaches 230 ms", () => {
      const jumps: JumpKind[] = [];
      const joy = createJoystick({ onJump: (k) => jumps.push(k) });

      // 11 px move (> TAP_MAX_MOVE_PX = 10)
      joy.down(100, 100, 1000);
      joy.move(100 + TAP_MAX_MOVE_PX + 1, 100, 1050);
      joy.up(1100);
      expect(jumps).toEqual([]);

      // 11 px then return back to origin: moved stays true
      joy.down(100, 100, 2000);
      joy.move(111, 100, 2020);
      joy.move(100, 100, 2040);
      joy.up(2100);
      expect(jumps).toEqual([]);

      // Duration exactly 230 ms (not < 230)
      joy.down(100, 100, 3000);
      joy.up(3000 + TAP_JUMP_MS);
      expect(jumps).toEqual([]);
    });
  });

  describe("flick up jump (>40 px in 140 ms + 420 ms cooldown)", () => {
    it("fires flick jump when moving up > 40 px within 140 ms and does not double-fire tap", () => {
      const jumps: JumpKind[] = [];
      const joy = createJoystick({ onJump: (k) => jumps.push(k) });

      joy.down(200, 300, 1000);
      joy.move(200, 300, 1020);
      joy.move(200, 300 - (JOY_FLICK_UP_PX + 1), 1020 + JOY_FLICK_WINDOW_MS);
      expect(jumps).toEqual(["flick"]);

      // Quick release after flick must NOT fire tap (because moved > 10 px)
      joy.up(1180);
      expect(jumps).toEqual(["flick"]);
    });

    it("ignores <= 40 px upward move, downward move, or upward move slower than 140 ms", () => {
      const jumps: JumpKind[] = [];
      const joy = createJoystick({ onJump: (k) => jumps.push(k) });

      // Exactly 40 px up (not > 40)
      joy.down(200, 300, 1000);
      joy.move(200, 300, 1010);
      joy.move(200, 300 - JOY_FLICK_UP_PX, 1100);
      expect(jumps).toEqual([]);

      // Downward move of 80 px
      joy.move(200, 380, 1150);
      expect(jumps).toEqual([]);

      // 45 px up across 141 ms (> JOY_FLICK_WINDOW_MS)
      joy.up(1500);
      joy.down(200, 300, 2000);
      joy.move(200, 300, 2000);
      joy.move(200, 255, 2000 + JOY_FLICK_WINDOW_MS + 1);
      expect(jumps).toEqual([]);
    });

    it("enforces 420 ms cooldown between flick jumps", () => {
      const jumps: JumpKind[] = [];
      const joy = createJoystick({ onJump: (k) => jumps.push(k) });

      joy.down(200, 400, 1000);
      joy.move(200, 400, 1010);
      joy.move(200, 350, 1050); // flick #1 at t=1050
      expect(jumps).toEqual(["flick"]);

      // Second flick at t = 1050 + 420 = 1470 (not > 420) -> ignored
      joy.move(200, 350, 1400);
      joy.move(200, 290, 1050 + JOY_FLICK_COOLDOWN_MS);
      expect(jumps).toEqual(["flick"]);

      // Third flick at t = 1050 + 421 = 1471 (> 420) -> fires
      joy.move(200, 290, 1460);
      joy.move(200, 240, 1050 + JOY_FLICK_COOLDOWN_MS + 1);
      expect(jumps).toEqual(["flick", "flick"]);
    });
  });

  it("stops responding after destroy()", () => {
    const onJump = vi.fn();
    const joy = createJoystick({ onJump });

    joy.down(100, 100, 1000);
    joy.move(160, 100, 1020);
    expect(joy.active()).toBe(true);

    joy.destroy();
    expect(joy.active()).toBe(false);
    expect(joy.origin()).toBeNull();
    expect(joy.dir()).toBe(0);

    joy.down(100, 100, 1100);
    joy.move(100, 20, 1120);
    joy.up(1150);
    expect(joy.active()).toBe(false);
    expect(onJump).not.toHaveBeenCalled();
  });
});
