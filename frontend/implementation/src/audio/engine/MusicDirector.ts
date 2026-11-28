import type { Diagnostics } from "../diag/Diagnostics";
import type { MusicStatePatch, SceneConfig } from "../types";
import type { BufferStore } from "./BufferStore";
import { CrossfadeLoopPlayer } from "./CrossfadeLoopPlayer";

/** A track the player left less than this long ago resumes where it was instead of restarting at bar 1. */
const RESUME_WINDOW_MS = 90_000;
/** At most this many music buffers stay decoded: the one playing and the one warmed for the next scene. */
const MAX_MUSIC_BUFFERS = 2;
const MAX_AMB_BUFFERS = 2;

export interface MusicDirectorDeps {
  readonly ctx: AudioContext;
  readonly musicOut: AudioNode;
  readonly ambOut: AudioNode;
  readonly store: BufferStore;
  readonly diag: Diagnostics;
  readonly scenes: Readonly<Record<string, SceneConfig>>;
  readonly now?: () => number;
  /** called with ids to decode in idle time (SceneConfig.warm). Defaults to store.load. */
  readonly warm?: (ids: readonly string[]) => void;
}

/**
 * Chooses music + ambience for a scene. One track plays at a time (two only during a crossfade); asking for the track that
 * already plays keeps it running; rapid scene changes are token-guarded in the players. A duck node lets short sounds dip the music.
 */
export class MusicDirector {
  private readonly music: CrossfadeLoopPlayer;
  private readonly amb: CrossfadeLoopPlayer;
  private readonly duckNode: GainNode;
  private readonly leftAt = new Map<string, { pos: number; at: number }>();
  private readonly musicLru: string[] = [];
  private readonly ambLru: string[] = [];
  private scene: string | null = null;
  private cfg: SceneConfig | null = null;
  private patchState: MusicStatePatch = {};
  private duckTarget = 1;
  private duckUntil = 0;
  private readonly now: () => number;

  constructor(private readonly deps: MusicDirectorDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.duckNode = deps.ctx.createGain();
    this.duckNode.connect(deps.musicOut);
    this.music = new CrossfadeLoopPlayer(deps.ctx, this.duckNode, deps.store, deps.diag, "music", (id, pos) => this.leftAt.set(id, { pos, at: this.now() }));
    this.amb = new CrossfadeLoopPlayer(deps.ctx, deps.ambOut, deps.store, deps.diag, "amb");
  }

  sceneId(): string | null {
    return this.scene;
  }

  track(): string | null {
    return this.music.current();
  }

  ambience(): string | null {
    return this.amb.current();
  }

  slots(): number {
    return this.music.slotCount();
  }

  position(): number {
    return this.music.position();
  }

  async setScene(id: string | null): Promise<void> {
    const cfg = id === null ? undefined : this.deps.scenes[id];
    if (id !== null && !cfg) {
      // unknown scene id: keep whatever plays (never cut the music because of a typo) but make it visible in diagnostics
      this.deps.diag.drop("unknown-event", `scene:${id}`);
      return;
    }
    this.scene = id;
    this.cfg = cfg ?? null;
    this.patchState = {};
    const track = cfg?.track ?? null;
    const fadeInS = cfg?.fadeInS ?? 1.8;
    const fadeOutS = cfg?.fadeOutS ?? 1.4;
    const left = track ? this.leftAt.get(track) : undefined;
    const resume = left && this.now() - left.at < RESUME_WINDOW_MS ? left.pos : 0;
    this.deps.diag.log("scene", id ?? "silence", track ?? "silence");
    const [okMusic] = await Promise.all([
      this.music.play(track, { fadeInS, fadeOutS, resumeOffsetS: resume, gain: cfg?.gain ?? 1, lowpassHz: cfg?.lowpassHz ?? 20000 }),
      this.amb.play(cfg?.amb ?? null, { fadeInS: Math.max(fadeInS, 2.2), fadeOutS: Math.max(fadeOutS, 1.8) }),
    ]);
    if (this.scene !== id) return; // superseded while loading
    if (track && okMusic) this.touch(this.musicLru, track, MAX_MUSIC_BUFFERS);
    if (cfg?.amb) this.touch(this.ambLru, cfg.amb, MAX_AMB_BUFFERS);
    if (cfg?.warm?.length) this.deps.warm?.(cfg.warm);
  }

  /** Remember a decoded buffer as recently used; drop the oldest beyond the cap (a fading source keeps its own reference). */
  touch(lru: string[], id: string, cap: number): void {
    const i = lru.indexOf(id);
    if (i >= 0) lru.splice(i, 1);
    lru.unshift(id);
    while (lru.length > cap) {
      const old = lru.pop();
      if (old && old !== this.music.current() && old !== this.amb.current()) this.deps.store.evict(old);
    }
  }

  /** Called by the engine when a music asset was warmed ahead of its scene. */
  noteWarmMusic(id: string): void {
    this.touch(this.musicLru, id, MAX_MUSIC_BUFFERS);
  }

  /** Adaptive intensity on top of the scene's own gain/lowpass (e.g. calmer while a student draws). */
  patch(p: MusicStatePatch): void {
    this.patchState = { ...this.patchState, ...p };
    const base = this.cfg?.gain ?? 1;
    this.music.setState({
      gain: base * (this.patchState.gain ?? 1),
      lowpassHz: this.patchState.lowpassHz ?? this.cfg?.lowpassHz ?? 20000,
      rampS: this.patchState.rampS ?? 0.8,
    });
  }

  /** Dip the music by `db` (negative) for `holdMs`; overlapping requests keep the deeper dip and the later release. */
  duck(db: number, holdMs: number): void {
    const t = this.deps.ctx.currentTime;
    const target = Math.pow(10, Math.min(db, 0) / 20);
    const holdS = Math.max(holdMs, 0) / 1000;
    if (t < this.duckUntil) {
      this.duckTarget = Math.min(this.duckTarget, target);
      this.duckUntil = Math.max(this.duckUntil, t + holdS);
    } else {
      this.duckTarget = target;
      this.duckUntil = t + holdS;
    }
    const g = this.duckNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(this.duckTarget, t, 0.03);
    g.setTargetAtTime(1, this.duckUntil, 0.22);
    this.deps.diag.log("duck", `${db}dB`, `${holdMs}ms`);
  }

  pause(fadeS = 0.3): void {
    this.music.pause(fadeS);
    this.amb.pause(fadeS);
  }

  resume(fadeS = 0.7): void {
    this.music.resume(fadeS);
    this.amb.resume(fadeS);
  }

  stop(fadeS = 0.5): void {
    this.music.stopAll(fadeS);
    this.amb.stopAll(fadeS);
    this.scene = null;
    this.cfg = null;
  }
}
