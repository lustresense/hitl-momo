/**
 * A stand-in for GSAP for jsdom tests that run under fake timers. Real GSAP keeps its own frame loop on the real
 * requestAnimationFrame, so under fake timers its timelines never finish. This stub finishes each timeline's
 * onComplete after the timeline's own length (its delay plus its last tween's end), on the fake clock.
 * Use it as: vi.mock("gsap", async () => { const { gsapClockStub } = await import("./gsap-clock-stub"); ... }).
 */
export function gsapClockStub() {
  const tween = {
    kill() {},
    pause() {},
    play() {},
    progress() { return 0; },
    timeScale() { return tween; },
    repeat() { return tween; },
    yoyo() { return tween; },
    duration() { return 0; },
    paused() { return false; },
  };

  class Timeline {
    /** Clock length (s) of the chain built so far. */
    private length = 0;
    private killed = false;
    private delay: number;
    private onComplete?: () => void;

    constructor(vars: { delay?: number; onComplete?: () => void } = {}) {
      this.delay = vars.delay ?? 0;
      this.onComplete = vars.onComplete;
      // The chain is built synchronously right after this call, so its length is known when this zero-delay
      // fake timer fires (a microtask would never run inside one synchronous test).
      setTimeout(() => {
        if (this.killed) return;
        setTimeout(() => {
          if (!this.killed) this.onComplete?.();
        }, (this.delay + this.length) * 1000);
      }, 0);
    }

    private add(vars: unknown, at?: number) {
      const v = typeof vars === "object" && vars !== null ? (vars as { duration?: number }) : {};
      const start = at ?? this.length;
      this.length = Math.max(this.length, start + (typeof v.duration === "number" ? v.duration : 0));
      return this;
    }
    to(_target: unknown, vars: unknown, at?: number) { return this.add(vars, at); }
    from(_target: unknown, vars: unknown, at?: number) { return this.add(vars, at); }
    fromTo(_target: unknown, _from: unknown, vars: unknown, at?: number) { return this.add(vars, at); }
    set(_target: unknown, vars: unknown, at?: number) { return this.add(vars, at); }
    call(_fn: unknown, _args?: unknown, at?: number) { return this.add({}, at); }
    timeScale() { return this; }
    kill() { this.killed = true; }
  }

  return {
    set() {},
    killTweensOf() {},
    timeline: (vars?: { delay?: number; onComplete?: () => void }) => new Timeline(vars),
    to: () => tween,
    from: () => tween,
    fromTo: () => tween,
    delayedCall: () => tween,
    ticker: { add() {}, remove() {} },
    core: { Timeline },
  };
}
