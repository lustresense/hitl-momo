import type { Diagnostics } from "../diag/Diagnostics";
import type { BufferStore } from "../engine/BufferStore";
import type { Mixer } from "../engine/Mixer";
import type { BusId, EmitParams, EventRule, LoopHandle, LoopParams, VoiceHandle } from "../types";

interface Voice {
  readonly id: number;
  readonly key: string;
  readonly asset: string;
  readonly priority: number;
  readonly sceneBound: boolean;
  readonly src: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly startedAtMs: number;
  stopping: boolean;
}

interface LoopVoice {
  readonly key: string;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
  wanted: boolean;
  baseGain: number;
  rate: number;
  sceneBound: boolean;
}

export interface SfxPlayerOptions {
  readonly maxVoices?: number;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly onDuck?: (db: number, holdMs: number) => void;
  /** a sound that had to wait for its file to load is dropped if it would start later than this */
  readonly staleMs?: number;
}

/**
 * One-shot and looping sound effects: variant round-robin, per-event cooldown and voice caps, global polyphony cap with
 * priority stealing, pitch jitter, scene-bound fade-outs. Never throws; a sound that cannot play is counted in diagnostics.
 */
export class SfxPlayer {
  private readonly voices = new Map<number, Voice>();
  private readonly loops = new Map<string, LoopVoice>();
  private readonly lastPlay = new Map<string, number>();
  private readonly lastVariant = new Map<string, number>();
  private nextId = 1;
  private readonly maxVoices: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly staleMs: number;

  constructor(
    private readonly ctx: AudioContext,
    private readonly mixer: Mixer,
    private readonly store: BufferStore,
    private readonly diag: Diagnostics,
    private readonly opts: SfxPlayerOptions = {},
  ) {
    this.maxVoices = opts.maxVoices ?? 28;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.staleMs = opts.staleMs ?? 300;
  }

  activeVoices(): number {
    return this.voices.size;
  }

  activeLoops(): number {
    let n = 0;
    for (const l of this.loops.values()) if (l.src) n++;
    return n;
  }

  private pickVariant(key: string, n: number, forced?: number): number {
    if (forced !== undefined) return ((forced % n) + n) % n;
    if (n === 1) return 0;
    const last = this.lastVariant.get(key);
    let idx = Math.floor(this.random() * n);
    if (idx === last) idx = (idx + 1) % n;
    this.lastVariant.set(key, idx);
    return idx;
  }

  play(key: string, rule: EventRule, params: EmitParams = {}): VoiceHandle | null {
    const t = this.now();
    const cd = rule.cooldownMs ?? 0;
    const last = this.lastPlay.get(key);
    if (cd > 0 && last !== undefined && t - last < cd) {
      this.diag.drop("cooldown", key);
      return null;
    }
    const n = rule.assets.length;
    if (n === 0) {
      this.diag.drop("missing-asset", key, "no assets in rule");
      return null;
    }
    const assetId = rule.assets[this.pickVariant(key, n, params.variant)];
    if (assetId === undefined) return null;
    this.lastPlay.set(key, t);
    const buf = this.store.get(assetId);
    if (buf) return this.start(key, assetId, buf, rule, params);
    // not decoded yet: load, then play only if it is still fresh
    void this.store.load(assetId).then((b) => {
      if (!b) return;
      if (this.now() - t > this.staleMs) {
        this.diag.drop("stale", key, assetId);
        return;
      }
      this.start(key, assetId, b, rule, params);
    });
    return null;
  }

  private start(key: string, assetId: string, buf: AudioBuffer, rule: EventRule, params: EmitParams): VoiceHandle | null {
    const priority = rule.priority ?? 5;
    // per-event voice cap: fade the oldest voice of this event
    if (rule.maxVoices !== undefined) {
      const same = [...this.voices.values()].filter((v) => v.key === key && !v.stopping).sort((a, b) => a.startedAtMs - b.startedAtMs);
      while (same.length >= rule.maxVoices) {
        const old = same.shift();
        if (old) this.fade(old, 40);
      }
    }
    // global polyphony cap with priority stealing
    if (this.voices.size >= this.maxVoices) {
      const candidates = [...this.voices.values()].filter((v) => !v.stopping && v.priority <= priority).sort((a, b) => a.priority - b.priority || a.startedAtMs - b.startedAtMs);
      const victim = candidates[0];
      if (!victim) {
        this.diag.drop("voice-cap", key);
        return null;
      }
      this.fade(victim, 25);
    }
    const bus: BusId = rule.bus ?? "sfx";
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const jitter = rule.pitchJitterCents ? (this.random() * 2 - 1) * rule.pitchJitterCents : 0;
    src.playbackRate.value = params.rate ?? 1;
    src.detune.value = jitter;
    const gain = this.ctx.createGain();
    gain.gain.value = (rule.gain ?? 1) * (params.gain ?? 1);
    src.connect(gain);
    const pan = params.pan ?? rule.pan ?? 0;
    if (pan !== 0 && typeof this.ctx.createStereoPanner === "function") {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      p.connect(this.mixer.buses[bus]);
    } else {
      gain.connect(this.mixer.buses[bus]);
    }
    const id = this.nextId++;
    const voice: Voice = { id, key, asset: assetId, priority, sceneBound: rule.sceneBound ?? false, src, gain, startedAtMs: this.now(), stopping: false };
    this.voices.set(id, voice);
    src.onended = () => {
      this.voices.delete(id);
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    const delay = (rule.delayMs ?? 0) / 1000;
    src.start(this.ctx.currentTime + delay);
    this.diag.count("played");
    this.diag.log("play", key, assetId);
    if (rule.duckMusicDb !== undefined && this.opts.onDuck) this.opts.onDuck(rule.duckMusicDb, rule.duckMs ?? Math.round(buf.duration * 1000));
    return { assetId, stop: (fadeMs = 30) => this.fade(voice, fadeMs) };
  }

  private fade(v: Voice, fadeMs: number): void {
    if (v.stopping) return;
    v.stopping = true;
    const t = this.ctx.currentTime;
    const f = Math.max(fadeMs, 5) / 1000;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + f);
    try {
      v.src.stop(t + f + 0.02);
    } catch {
      /* not started or already stopped */
    }
  }

  /** Fade out every voice flagged sceneBound (called on scene change so nothing lingers from the previous scene). */
  stopSceneBound(fadeMs = 120): void {
    for (const v of this.voices.values()) if (v.sceneBound) this.fade(v, fadeMs);
    for (const [k, l] of [...this.loops.entries()]) if (l.sceneBound) this.stopLoop(k, fadeMs);
  }

  stopAll(fadeMs = 60): void {
    for (const v of this.voices.values()) this.fade(v, fadeMs);
    for (const k of [...this.loops.keys()]) this.stopLoop(k, fadeMs);
  }

  // ---------------------------------------------------------------- continuous loops (pencil scratch, ring hum, ...)
  startLoop(key: string, assetId: string, params: LoopParams = {}): LoopHandle {
    let lv = this.loops.get(key);
    if (lv?.src) {
      this.updateLoop(key, { gain: params.gain, rate: params.rate, rampMs: 60 });
      return this.handle(key);
    }
    lv = { key, src: null, gain: null, wanted: true, baseGain: params.gain ?? 1, rate: params.rate ?? 1, sceneBound: params.sceneBound ?? true };
    this.loops.set(key, lv);
    const begin = (buf: AudioBuffer): void => {
      const cur = this.loops.get(key);
      if (!cur || !cur.wanted || cur.src) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = cur.rate;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(cur.baseGain, t + (params.fadeInMs ?? 60) / 1000);
      src.connect(g);
      g.connect(this.mixer.buses[params.bus ?? "sfx"]);
      src.start(t);
      cur.src = src;
      cur.gain = g;
      this.diag.log("loop", key, `start ${assetId}`);
    };
    const buf = this.store.get(assetId);
    if (buf) begin(buf);
    else void this.store.load(assetId).then((b) => b && begin(b));
    return this.handle(key);
  }

  private handle(key: string): LoopHandle {
    const isActive = (): boolean => this.isLoopActive(key);
    return {
      get active(): boolean {
        return isActive();
      },
      update: (p) => this.updateLoop(key, p),
      stop: (f) => this.stopLoop(key, f),
    };
  }

  updateLoop(key: string, p: { gain?: number | undefined; rate?: number | undefined; rampMs?: number | undefined }): void {
    const lv = this.loops.get(key);
    if (!lv) return;
    const t = this.ctx.currentTime;
    const ramp = Math.max(p.rampMs ?? 40, 5) / 1000;
    if (p.gain !== undefined) {
      lv.baseGain = p.gain;
      if (lv.gain) {
        lv.gain.gain.cancelScheduledValues(t);
        lv.gain.gain.setValueAtTime(lv.gain.gain.value, t);
        lv.gain.gain.linearRampToValueAtTime(p.gain, t + ramp);
      }
    }
    if (p.rate !== undefined) {
      lv.rate = p.rate;
      if (lv.src) {
        lv.src.playbackRate.cancelScheduledValues(t);
        lv.src.playbackRate.linearRampToValueAtTime(p.rate, t + ramp);
      }
    }
  }

  stopLoop(key: string, fadeMs = 120): void {
    const lv = this.loops.get(key);
    if (!lv) return;
    lv.wanted = false;
    this.loops.delete(key);
    const { src, gain } = lv;
    if (!src || !gain) return;
    const t = this.ctx.currentTime;
    const f = Math.max(fadeMs, 5) / 1000;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + f);
    try {
      src.stop(t + f + 0.02);
    } catch {
      /* already stopped */
    }
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    this.diag.log("loop", key, "stop");
  }

  isLoopActive(key: string): boolean {
    const lv = this.loops.get(key);
    return !!lv && lv.wanted;
  }
}
