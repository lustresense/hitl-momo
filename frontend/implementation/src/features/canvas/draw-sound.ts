import type { ActiveBrushTool } from "./tools";

/**
 * Drawing-sound observer (audio only; no effect on drawing).
 *
 * `CanvasController` reports pen activity through `onInk`; this driver decides when the pencil/eraser loop
 * may sound. Only a real, valid stroke makes sound: at least `MIN_POINTS` effective points and `MIN_TRAVEL_PX`
 * of travel (never a bare pen-down), gain/rate follow a smoothed pen speed, updates are throttled, and the loop
 * is stopped on stroke end / cancel / tool switch / tracking loss / panel change / unmount, plus a safety stop
 * when no effective sample arrived for `IDLE_STOP_MS`.
 */

export type InkEvent =
  | { readonly kind: "begin"; readonly tool: ActiveBrushTool; readonly x: number; readonly y: number; readonly t: number; readonly effective: boolean }
  | { readonly kind: "move"; readonly tool: ActiveBrushTool; readonly x: number; readonly y: number; readonly t: number; readonly effective: boolean }
  | { readonly kind: "end" };

/** Minimal slice of the audio API the driver needs (the real `audio` satisfies it). */
export interface DrawLoopHandle {
  update(p: { gain?: number; rate?: number; rampMs?: number }): void;
  stop(fadeMs?: number): void;
}
export interface DrawSoundSink {
  loop(id: "draw.pencil" | "draw.eraser", params?: { gain?: number; rate?: number }): DrawLoopHandle;
}
export interface DrawSoundClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const DRAW_SOUND = {
  MIN_POINTS: 3,
  MIN_TRAVEL_PX: 10,
  /** Pen speed (px/s) that maps to full gain / top rate. */
  FULL_SPEED_PX_S: 1200,
  GAIN_MIN: 0.25,
  GAIN_MAX: 1,
  RATE_MIN: 0.9,
  RATE_MAX: 1.2,
  /** <= 20 loop updates per second. */
  UPDATE_MIN_GAP_MS: 50,
  RAMP_MS: 70,
  SMOOTHING: 0.35,
  IDLE_STOP_MS: 250,
  STOP_FADE_MS: 120,
} as const;

/** Pure mapping from (smoothed) pen speed in px/s to loop gain and playback rate. */
export function mapPenSpeed(speedPxPerS: number): { gain: number; rate: number } {
  const n = Math.min(1, Math.max(0, Number.isFinite(speedPxPerS) ? speedPxPerS / DRAW_SOUND.FULL_SPEED_PX_S : 0));
  return {
    gain: DRAW_SOUND.GAIN_MIN + (DRAW_SOUND.GAIN_MAX - DRAW_SOUND.GAIN_MIN) * n,
    rate: DRAW_SOUND.RATE_MIN + (DRAW_SOUND.RATE_MAX - DRAW_SOUND.RATE_MIN) * n,
  };
}

const REAL_CLOCK: DrawSoundClock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class DrawSoundDriver {
  private loop: DrawLoopHandle | null = null;
  private tool: ActiveBrushTool | null = null;
  private points = 0;
  private travel = 0;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private speed = 0;
  private lastUpdateAt = 0;
  private lastSampleAt = 0;
  private watchdog: unknown = null;
  private disposed = false;

  constructor(
    private readonly sink: DrawSoundSink,
    private readonly clock: DrawSoundClock = REAL_CLOCK,
  ) {}

  /** True while a loop is sounding (tests). */
  get sounding(): boolean {
    return this.loop !== null;
  }

  handle(e: InkEvent): void {
    if (this.disposed) return;
    if (e.kind === "end") {
      this.reset();
      return;
    }
    if (e.kind === "begin") {
      this.reset();
      this.tool = e.tool;
      this.lastX = e.x;
      this.lastY = e.y;
      this.lastT = e.t;
      this.points = e.effective ? 1 : 0;
      return;
    }
    if (this.tool !== e.tool) return; // a move without a matching begin (or after a tool switch) never sounds
    const dx = e.x - this.lastX;
    const dy = e.y - this.lastY;
    const dt = Math.max(1, e.t - this.lastT);
    this.lastX = e.x;
    this.lastY = e.y;
    this.lastT = e.t;
    if (!e.effective) return; // e.g. the eraser touched nothing: no activity, no keep-alive
    const dist = Math.hypot(dx, dy);
    this.travel += dist;
    this.points += 1;
    this.speed += DRAW_SOUND.SMOOTHING * ((dist / dt) * 1000 - this.speed);
    const now = this.clock.now();
    this.lastSampleAt = now;
    if (!this.loop) {
      if (this.points >= DRAW_SOUND.MIN_POINTS && this.travel >= DRAW_SOUND.MIN_TRAVEL_PX) this.start(e.tool, now);
      return;
    }
    if (now - this.lastUpdateAt >= DRAW_SOUND.UPDATE_MIN_GAP_MS) {
      this.lastUpdateAt = now;
      this.loop.update({ ...mapPenSpeed(this.speed), rampMs: DRAW_SOUND.RAMP_MS });
    }
  }

  /** Stop everything (unmount). The driver ignores events afterwards. */
  dispose(): void {
    this.reset();
    this.disposed = true;
  }

  private start(tool: ActiveBrushTool, now: number): void {
    this.loop = this.sink.loop(tool === "eraser" ? "draw.eraser" : "draw.pencil", mapPenSpeed(this.speed));
    this.lastUpdateAt = now;
    this.armWatchdog(DRAW_SOUND.IDLE_STOP_MS + 1);
  }

  private armWatchdog(delayMs: number): void {
    if (this.watchdog !== null) return;
    this.watchdog = this.clock.setTimeout(() => {
      this.watchdog = null;
      if (!this.loop) return;
      const remaining = DRAW_SOUND.IDLE_STOP_MS - (this.clock.now() - this.lastSampleAt);
      if (remaining > 0) {
        this.armWatchdog(remaining + 1);
        return;
      }
      // Pen held still: silence now, and the stroke has to re-qualify (3 points, 10 px) to sound again.
      this.stopLoop();
      this.points = 0;
      this.travel = 0;
      this.speed = 0;
    }, delayMs);
  }

  private stopLoop(): void {
    if (this.watchdog !== null) {
      this.clock.clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    const l = this.loop;
    this.loop = null;
    if (l) l.stop(DRAW_SOUND.STOP_FADE_MS);
  }

  private reset(): void {
    this.stopLoop();
    this.tool = null;
    this.points = 0;
    this.travel = 0;
    this.speed = 0;
  }
}
