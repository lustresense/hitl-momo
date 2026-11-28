import type { AudioPrefsState, BusId } from "../types";

/** Base gain of every bus before user preferences. SFX sit above music; ambience is a quiet bed. */
export const BUS_BASE: Readonly<Record<BusId, number>> = { music: 0.55, sfx: 0.9, ui: 0.75, amb: 0.5 };

/** Perceptual volume curve: slider position -> linear gain. */
export const curve = (v: number): number => v * v;

/**
 * Bus graph: [music | sfx | ui | amb] -> master -> safety limiter -> destination.
 * The limiter is a DynamicsCompressor tuned as a transparent peak catcher so stacked sounds never clip.
 */
export class Mixer {
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly buses: Readonly<Record<BusId, GainNode>>;
  private tapNode: MediaStreamAudioDestinationNode | null = null;

  constructor(private readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    const make = (): GainNode => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { music: make(), sfx: make(), ui: make(), amb: make() };
  }

  /** rampS <= 0 applies the values instantly (used once while the graph is built, before anything can sound). */
  applyPrefs(p: AudioPrefsState, rampS = 0.08): void {
    const t = this.ctx.currentTime;
    const tc = Math.max(rampS / 3, 0.005);
    const set = (g: GainNode, v: number): void => {
      g.gain.cancelScheduledValues(t);
      if (rampS <= 0) g.gain.value = v;
      else g.gain.setTargetAtTime(v, t, tc);
    };
    set(this.master, p.muted ? 0 : curve(p.master));
    set(this.buses.music, BUS_BASE.music * curve(p.music));
    set(this.buses.amb, BUS_BASE.amb * curve(p.music));
    set(this.buses.sfx, BUS_BASE.sfx * curve(p.sfx));
    set(this.buses.ui, BUS_BASE.ui * curve(p.sfx));
  }

  /** Dev/recording only: a MediaStream carrying exactly what the player hears (post limiter). Created on demand. */
  tap(): MediaStreamAudioDestinationNode {
    if (!this.tapNode) {
      this.tapNode = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.tapNode);
    }
    return this.tapNode;
  }

  dispose(): void {
    this.master.disconnect();
    this.limiter.disconnect();
    for (const b of Object.values(this.buses)) b.disconnect();
    this.tapNode?.disconnect();
  }
}
