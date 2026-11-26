import {
  JOY_BASE,
  JOY_DEADZONE_PX,
  JOY_FLICK_COOLDOWN_MS,
  JOY_FLICK_UP_PX,
  JOY_FLICK_WINDOW_MS,
  JOY_GAIN,
  JOY_SPAN_PX,
  TAP_JUMP_MS,
  TAP_MAX_MOVE_PX,
} from "./constants";
import type { Point } from "./types";

export type JumpKind = "tap" | "flick";

export interface JoystickOptions {
  onJump?: (kind: JumpKind) => void;
  /** Tambahan syarat saat cubit mulai (hand.js `o.when`). */
  when?: () => boolean;
}

export interface Joystick {
  /** `ok` = false bila cubit mulai di chrome / area yang diabaikan. */
  down(x: number, y: number, t: number, ok?: boolean): void;
  move(x: number, y: number, t: number): void;
  up(t: number): void;
  /** -1..1; 0 di deadzone atau saat tidak aktif. */
  dir(): number;
  active(): boolean;
  origin(): Point | null;
  destroy(): void;
}

/** Port joystick hand.js:162-184 tanpa DOM. Titik cubit pertama = pusat. */
export function createJoystick(o: JoystickOptions = {}): Joystick {
  let a: { x: number; y: number; t: number; moved: boolean } | null = null;
  let hist: [number, number][] = [];
  let flickAt = Number.NEGATIVE_INFINITY;
  let dead = false;
  let curX = 0;

  return {
    down(x, y, t, ok = true) {
      curX = x;
      if (dead || !ok || (o.when && !o.when())) return;
      a = { x, y, t, moved: false };
      hist = [];
    },
    move(x, y, t) {
      curX = x;
      if (!a) return;
      if (Math.hypot(x - a.x, y - a.y) > TAP_MAX_MOVE_PX) a.moved = true;
      hist.push([t, y]);
      while (hist.length > 0 && t - (hist[0] as [number, number])[0] > JOY_FLICK_WINDOW_MS) hist.shift();
      const first = hist[0];
      if (hist.length > 1 && first && first[1] - y > JOY_FLICK_UP_PX && t - flickAt > JOY_FLICK_COOLDOWN_MS) {
        flickAt = t;
        hist = [];
        o.onJump?.("flick");
      }
    },
    up(t) {
      if (a && !a.moved && t - a.t < TAP_JUMP_MS) o.onJump?.("tap");
      a = null;
    },
    dir() {
      if (!a) return 0;
      const dx = curX - a.x;
      if (Math.abs(dx) < JOY_DEADZONE_PX) return 0;
      return Math.sign(dx) * Math.min(1, JOY_BASE + ((Math.abs(dx) - JOY_DEADZONE_PX) / JOY_SPAN_PX) * JOY_GAIN);
    },
    active: () => a !== null,
    origin: () => (a ? { x: a.x, y: a.y } : null),
    destroy() {
      dead = true;
      a = null;
    },
  };
}
