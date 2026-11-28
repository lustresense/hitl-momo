import type { Diagnostics } from "../diag/Diagnostics";
import type { BufferStore } from "./BufferStore";

/**
 * Per-track chain:  source -> lowpass (state) -> fade (crossfade curve only) -> trim (state gain / pause only) -> out
 * Fades and state changes live on different GainNodes so a state change can never cancel a running crossfade (that would click).
 */
interface Slot {
  readonly id: string;
  readonly src: AudioBufferSourceNode;
  readonly filter: BiquadFilterNode;
  readonly fade: GainNode;
  readonly trim: GainNode;
  readonly startedAt: number; // ctx time
  readonly offset: number; // seconds into the buffer when started
  readonly duration: number;
  fading: boolean;
}

export interface PlayOptions {
  readonly fadeInS?: number;
  readonly fadeOutS?: number;
  readonly resumeOffsetS?: number;
  /** state applied to the NEW track the moment it is created, so a scene change never touches the departing track */
  readonly gain?: number;
  readonly lowpassHz?: number;
}

const POINTS = 96;
const FADE_IN = new Float32Array(POINTS);
const FADE_OUT = new Float32Array(POINTS);
for (let i = 0; i < POINTS; i++) {
  const x = i / (POINTS - 1);
  FADE_IN[i] = Math.sin((x * Math.PI) / 2); // equal-power
  FADE_OUT[i] = Math.cos((x * Math.PI) / 2);
}

/**
 * Seamless looping player with equal-power crossfade between tracks. Used for music and ambience.
 * - at most ONE track is audible in steady state, two only during a crossfade (never duplicate BGM)
 * - rapid scene changes are safe: every `play` call carries a token and stale loads are discarded
 * - asking for the track that is already playing keeps it running (no restart); only state (gain/lowpass) is updated
 */
export class CrossfadeLoopPlayer {
  private slots: Slot[] = [];
  private token = 0;
  private currentId: string | null = null;
  private stateGain = 1;
  private stateLowpass = 20000;
  private paused = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly store: BufferStore,
    private readonly diag: Diagnostics,
    private readonly name: string,
    private readonly onRetire?: (id: string, atPositionS: number) => void,
  ) {}

  current(): string | null {
    return this.currentId;
  }

  slotCount(): number {
    return this.slots.length;
  }

  /** Playhead (seconds inside the loop) of the current track. */
  position(): number {
    const s = this.live();
    if (!s) return 0;
    return (s.offset + (this.ctx.currentTime - s.startedAt)) % s.duration;
  }

  private live(): Slot | undefined {
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s && !s.fading) return s;
    }
    return undefined;
  }

  async play(assetId: string | null, opts: PlayOptions = {}): Promise<boolean> {
    const my = ++this.token;
    if (assetId === this.currentId) {
      this.diag.log("music", this.name, `keep ${assetId ?? "silence"}`);
      if (assetId !== null) this.setState({ gain: opts.gain, lowpassHz: opts.lowpassHz, rampS: opts.fadeInS });
      return true;
    }
    const fadeInS = Math.max(opts.fadeInS ?? 1.6, 0.05);
    const fadeOutS = opts.fadeOutS ?? 1.6;
    if (assetId === null) {
      this.retireLive();
      this.fadeAllOut(fadeOutS);
      this.currentId = null;
      return true;
    }
    const buf = await this.store.load(assetId);
    if (my !== this.token) return false; // a newer request superseded this one
    if (!buf) return false;
    if (opts.gain !== undefined) this.stateGain = opts.gain;
    if (opts.lowpassHz !== undefined) this.stateLowpass = opts.lowpassHz;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.stateLowpass;
    filter.Q.value = 0.5;
    const fade = this.ctx.createGain();
    fade.gain.value = 0;
    const trim = this.ctx.createGain();
    trim.gain.value = this.paused ? 0 : this.stateGain;
    src.connect(filter);
    filter.connect(fade);
    fade.connect(trim);
    trim.connect(this.out);
    const offset = Math.max(0, (opts.resumeOffsetS ?? 0) % buf.duration);
    // crossfade: old slots fade out while the new one fades in (equal power)
    this.retireLive();
    this.fadeAllOut(fadeOutS);
    src.start(t, offset);
    fade.gain.setValueCurveAtTime(FADE_IN, t, fadeInS);
    this.slots.push({ id: assetId, src, filter, fade, trim, startedAt: t, offset, duration: buf.duration, fading: false });
    this.currentId = assetId;
    this.diag.count("music-switch");
    this.diag.log("music", this.name, `play ${assetId} @${offset.toFixed(1)}s in ${fadeInS}s`);
    return true;
  }

  /** Report where the departing track was, so the director can resume it later instead of restarting at bar 1. */
  private retireLive(): void {
    const s = this.live();
    if (s) this.onRetire?.(s.id, this.position());
  }

  private fadeAllOut(fadeS: number): void {
    const t = this.ctx.currentTime;
    const dur = Math.max(fadeS, 0.05);
    for (const s of this.slots) {
      if (s.fading) continue;
      s.fading = true;
      const g = s.fade.gain;
      const cur = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.setValueCurveAtTime(FADE_OUT.map((v) => v * cur), t, dur);
      try {
        s.src.stop(t + dur + 0.05);
      } catch {
        /* already stopped */
      }
      s.src.onended = () => {
        this.slots = this.slots.filter((x) => x !== s);
        try {
          s.src.disconnect();
          s.filter.disconnect();
          s.fade.disconnect();
          s.trim.disconnect();
        } catch {
          /* ignore */
        }
      };
    }
  }

  /** Smoothly change gain/lowpass of the current (and the next) track without restarting it. */
  setState(p: { gain?: number | undefined; lowpassHz?: number | undefined; rampS?: number | undefined }): void {
    if (p.gain !== undefined) this.stateGain = p.gain;
    if (p.lowpassHz !== undefined) this.stateLowpass = p.lowpassHz;
    const t = this.ctx.currentTime;
    const tc = Math.max((p.rampS ?? 0.6) / 3, 0.02);
    const live = this.live();
    if (!live) return;
    if (p.gain !== undefined && !this.paused) live.trim.gain.setTargetAtTime(this.stateGain, t, tc);
    if (p.lowpassHz !== undefined) live.filter.frequency.setTargetAtTime(this.stateLowpass, t, tc);
  }

  pause(fadeS = 0.4): void {
    this.paused = true;
    const t = this.ctx.currentTime;
    for (const s of this.slots) s.trim.gain.setTargetAtTime(0, t, Math.max(fadeS / 3, 0.02));
  }

  resume(fadeS = 0.6): void {
    this.paused = false;
    const t = this.ctx.currentTime;
    const live = this.live();
    if (live) live.trim.gain.setTargetAtTime(this.stateGain, t, Math.max(fadeS / 3, 0.02));
  }

  stopAll(fadeS = 0.4): void {
    this.token++;
    this.retireLive();
    this.fadeAllOut(fadeS);
    this.currentId = null;
  }
}
