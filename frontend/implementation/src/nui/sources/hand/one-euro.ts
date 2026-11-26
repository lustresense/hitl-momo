/** One Euro filter 1D (Casiez 2012), variable dt in ms. Logic copied from nui-lab/bench/one-euro.ts. */
export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  /** Gap (ms) beyond which state resets. */
  maxGapMs: number;
}

export function oneEuroAlpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(1e-4, cutoffHz));
  return 1 / (1 + tau / Math.max(1e-6, dtSec));
}

export class OneEuro1D {
  private prev: number | null = null;
  private dPrev = 0;
  private lastT: number | null = null;
  constructor(public params: OneEuroParams) {}

  reset(): void {
    this.prev = null;
    this.dPrev = 0;
    this.lastT = null;
  }

  filter(value: number, tMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(tMs)) {
      this.reset();
      return value;
    }
    if (this.prev === null || this.lastT === null || tMs - this.lastT > this.params.maxGapMs) {
      this.prev = value;
      this.dPrev = 0;
      this.lastT = tMs;
      return value;
    }
    const rawDt = (tMs - this.lastT) / 1000;
    if (rawDt <= 0) return this.prev;
    const dt = Math.max(1e-4, rawDt);
    this.lastT = tMs;
    const dx = (value - this.prev) / dt;
    const aD = oneEuroAlpha(this.params.dCutoff, dt);
    this.dPrev = aD * dx + (1 - aD) * this.dPrev;
    const a = oneEuroAlpha(this.params.minCutoff + this.params.beta * Math.abs(this.dPrev), dt);
    this.prev = a * value + (1 - a) * this.prev;
    return this.prev;
  }
}
