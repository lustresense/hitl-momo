import { AudioPrefs } from "../prefs/AudioPrefs";
import { Diagnostics } from "../diag/Diagnostics";
import { SfxPlayer } from "../sfx/SfxPlayer";
import type {
  AudioApi,
  AudioPrefsState,
  DiagEvent,
  DiagSnapshot,
  DropReason,
  EmitParams,
  EngineState,
  EventRule,
  LoopHandle,
  LoopParams,
  MusicStatePatch,
  SceneConfig,
  VoiceHandle,
} from "../types";
import { BufferStore, type Catalog } from "./BufferStore";
import { MusicDirector } from "./MusicDirector";
import { Mixer } from "./Mixer";

/** A context that is still waking up from the unlock gesture may queue sounds for this long. */
const UNLOCK_GRACE_MS = 300;
const HIDE_SUSPEND_MS = 450;

interface DocLike {
  readonly hidden: boolean;
  addEventListener(type: string, l: () => void): void;
  removeEventListener(type: string, l: () => void): void;
}

export interface AudioEngineOptions {
  readonly events: Readonly<Record<string, EventRule>>;
  readonly scenes: Readonly<Record<string, SceneConfig>>;
  readonly catalog: Catalog;
  readonly createContext?: () => AudioContext | null;
  readonly fetchBuffer?: (url: string) => Promise<ArrayBuffer>;
  readonly storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** developer builds only: enables the recording tap */
  readonly devTools?: boolean;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly doc?: DocLike | null;
  readonly win?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  /** run a task when the main thread is idle (used for warm-up decoding) */
  readonly idle?: (fn: () => void) => void;
}

const NULL_LOOP: LoopHandle = { active: false, update: () => undefined, stop: () => undefined };

const defaultCreateContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
  } catch {
    try {
      return new Ctor({ latencyHint: "interactive" });
    } catch {
      return null;
    }
  }
};

const defaultFetch = async (url: string): Promise<ArrayBuffer> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.arrayBuffer();
};

const defaultIdle = (fn: () => void): void => {
  const w = typeof window !== "undefined" ? (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }) : undefined;
  if (w?.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 2500 });
  else setTimeout(fn, 400);
};

/**
 * The one audio engine. Lazy: no AudioContext exists until the first real user gesture (browser autoplay policy), and every
 * call before that is safe (sounds are dropped with reason "locked", the wanted scene is remembered and started on unlock).
 * Nothing here throws into game code.
 */
export class AudioEngine implements AudioApi {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private store: BufferStore | null = null;
  private sfx: SfxPlayer | null = null;
  private music: MusicDirector | null = null;
  private readonly diag: Diagnostics;
  private readonly prefs: AudioPrefs;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private wantedScene: string | null = null;
  private sceneRequested = false;
  private appliedScene: string | null | undefined = undefined;
  private hiddenFlag = false;
  private everRan = false;
  private unsupported = false;
  private unlockedAtMs = -Infinity;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly warned = new Set<string>();
  private readonly cleanups: Array<() => void> = [];
  private readonly doc: DocLike | null;
  private readonly idle: (fn: () => void) => void;

  constructor(private readonly opts: AudioEngineOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.diag = new Diagnostics();
    this.prefs = new AudioPrefs(opts.storage ?? null);
    this.doc = opts.doc === undefined ? (typeof document !== "undefined" ? document : null) : opts.doc;
    this.idle = opts.idle ?? defaultIdle;
    this.hiddenFlag = !!this.doc?.hidden;
    if (this.doc) {
      const onVis = (): void => this.onVisibility();
      this.doc.addEventListener("visibilitychange", onVis);
      this.cleanups.push(() => this.doc?.removeEventListener("visibilitychange", onVis));
    }
    const win = opts.win === undefined ? (typeof window !== "undefined" ? window : null) : opts.win;
    if (win) {
      const onHide = (): void => this.suspendNow();
      win.addEventListener("pagehide", onHide);
      this.cleanups.push(() => win.removeEventListener("pagehide", onHide));
    }
  }

  // ------------------------------------------------------------------ lifecycle
  state(): EngineState {
    if (this.unsupported) return "unsupported";
    if (!this.ctx) return "idle";
    if (this.hiddenFlag) return "suspended";
    if (this.ctx.state === "running") return "running";
    return this.everRan ? "suspended" : "locked";
  }

  private notify(): void {
    for (const l of [...this.listeners]) l();
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    const mixer = new Mixer(ctx);
    mixer.applyPrefs(this.prefs.get(), 0);
    const store = new BufferStore(ctx, this.opts.catalog, this.opts.fetchBuffer ?? defaultFetch, this.diag, this.now);
    const music = new MusicDirector({
      ctx,
      musicOut: mixer.buses.music,
      ambOut: mixer.buses.amb,
      store,
      diag: this.diag,
      scenes: this.opts.scenes,
      now: this.now,
      warm: (ids) => this.warm(ids),
    });
    this.mixer = mixer;
    this.store = store;
    this.music = music;
    this.sfx = new SfxPlayer(ctx, mixer, store, this.diag, {
      now: this.now,
      ...(this.opts.random ? { random: this.opts.random } : {}),
      onDuck: (db, ms) => music.duck(db, ms),
    });
    ctx.addEventListener("statechange", () => {
      if (ctx.state === "running") this.everRan = true;
      this.diag.log("ctx", ctx.state);
      if (ctx.state === "running") this.applyScene();
      this.notify();
    });
  }

  async unlock(): Promise<boolean> {
    if (this.unsupported) return false;
    if (this.ctx?.state === "running") return true;
    if (!this.ctx) {
      const ctx = (this.opts.createContext ?? defaultCreateContext)();
      if (!ctx) {
        this.unsupported = true;
        this.notify();
        return false;
      }
      this.build(ctx);
    }
    const ctx = this.ctx;
    if (!ctx) return false;
    this.unlockedAtMs = this.now();
    if (!this.hiddenFlag) {
      try {
        await ctx.resume();
      } catch {
        /* blocked: stay locked, the next gesture retries */
      }
    }
    if (ctx.state === "running") {
      this.everRan = true;
      this.applyScene();
    }
    this.notify();
    return ctx.state === "running";
  }

  installUnlock(target: EventTarget): () => void {
    const handler = (): void => {
      if (this.state() !== "running" && !this.hiddenFlag) void this.unlock();
    };
    const types = ["pointerdown", "pointerup", "keydown", "touchend", "click"] as const;
    for (const t of types) target.addEventListener(t, handler, { capture: true, passive: true });
    const off = (): void => {
      for (const t of types) target.removeEventListener(t, handler, { capture: true });
    };
    this.cleanups.push(off);
    return off;
  }

  private onVisibility(): void {
    const hidden = !!this.doc?.hidden;
    if (hidden === this.hiddenFlag) return;
    if (hidden) this.suspendNow();
    else this.resumeFromHidden();
  }

  private suspendNow(): void {
    this.hiddenFlag = true;
    if (!this.ctx) {
      this.notify();
      return;
    }
    this.music?.pause(0.25);
    this.sfx?.stopAll(60);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.hiddenFlag) void this.ctx?.suspend().catch(() => undefined);
    }, HIDE_SUSPEND_MS);
    this.diag.log("ctx", "hidden");
    this.notify();
  }

  private resumeFromHidden(): void {
    this.hiddenFlag = false;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx) {
      this.notify();
      return;
    }
    this.unlockedAtMs = this.now();
    void ctx
      .resume()
      .catch(() => undefined)
      .then(() => {
        if (ctx.state === "running") this.music?.resume(0.8);
        this.notify();
      });
    this.diag.log("ctx", "visible");
    this.notify();
  }

  // ------------------------------------------------------------------ gate
  private ready(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === "running") return true;
    return ctx.state === "suspended" && this.now() - this.unlockedAtMs < UNLOCK_GRACE_MS;
  }

  private gate(rule: EventRule): DropReason | null {
    if (!this.sfx || !this.ready()) return "locked";
    if (this.hiddenFlag) return "hidden";
    const p = this.prefs.get();
    const bus = rule.bus ?? "sfx";
    const level = bus === "music" || bus === "amb" ? p.music : p.sfx;
    if (p.muted || p.master <= 0 || level <= 0) return "muted";
    return null;
  }

  // ------------------------------------------------------------------ SFX
  emit(id: string, params?: EmitParams): VoiceHandle | null {
    this.diag.count("emit");
    this.diag.log("emit", id);
    const rule = this.opts.events[id];
    if (!rule) {
      this.diag.drop("unknown-event", id);
      if (!this.warned.has(id)) {
        this.warned.add(id);
        if (this.opts.devTools && typeof console !== "undefined") console.warn(`[audio] unknown event "${id}"`);
      }
      return null;
    }
    const why = this.gate(rule);
    if (why) {
      this.diag.drop(why, id);
      return null;
    }
    try {
      return this.sfx?.play(id, rule, params) ?? null;
    } catch (e) {
      this.diag.drop("no-context", id, e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  loop(id: string, params: LoopParams = {}): LoopHandle {
    const rule = this.opts.events[id];
    const asset = rule?.assets[0];
    if (!rule || !asset) {
      this.diag.drop("unknown-event", id);
      return NULL_LOOP;
    }
    const why = this.gate(rule);
    if (why || !this.sfx) {
      this.diag.drop(why ?? "locked", id);
      return NULL_LOOP;
    }
    return this.sfx.startLoop(id, asset, {
      ...params,
      bus: params.bus ?? rule.bus ?? "sfx",
      gain: (rule.gain ?? 1) * (params.gain ?? 1),
    });
  }

  interrupt(): void {
    this.sfx?.stopSceneBound(60);
  }

  duck(db: number, holdMs = 800): void {
    this.music?.duck(db, holdMs);
  }

  // ------------------------------------------------------------------ scene + music
  scene(id: string | null): void {
    if (this.sceneRequested && id === this.wantedScene) return;
    this.sceneRequested = true;
    this.wantedScene = id;
    this.diag.log("scene", id ?? "silence", "request");
    this.sfx?.stopSceneBound(180);
    this.applyScene();
  }

  currentScene(): string | null {
    return this.wantedScene;
  }

  private applyScene(): void {
    if (!this.music || !this.ready() || this.hiddenFlag) return;
    if (this.appliedScene === this.wantedScene) return;
    this.appliedScene = this.wantedScene;
    void this.music.setScene(this.wantedScene).catch(() => undefined);
  }

  musicPatch(p: MusicStatePatch): void {
    this.music?.patch(p);
  }

  warm(ids: readonly string[]): void {
    const store = this.store;
    if (!store) return;
    const expanded: string[] = [];
    for (const id of ids) {
      if (id.startsWith("group:")) {
        const g = id.slice(6);
        for (const [aid, e] of Object.entries(this.opts.catalog)) if (e.group === g && !store.has(aid)) expanded.push(aid);
      } else if (!store.has(id)) expanded.push(id);
    }
    if (expanded.length === 0) return;
    this.idle(() => {
      void (async () => {
        // small batches so decoding never monopolises the main thread
        for (let i = 0; i < expanded.length; i += 3) {
          await Promise.all(
            expanded.slice(i, i + 3).map(async (id) => {
              const ok = await store.load(id);
              if (ok && this.opts.catalog[id]?.kind === "music") this.music?.noteWarmMusic(id);
            }),
          );
        }
      })();
    });
  }

  // ------------------------------------------------------------------ prefs
  getPrefs(): AudioPrefsState {
    return this.prefs.get();
  }

  setPrefs(patch: Partial<AudioPrefsState>): void {
    const next = this.prefs.set(patch);
    this.mixer?.applyPrefs(next);
    this.diag.log("ctx", "prefs", JSON.stringify(next));
    this.notify();
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  // ------------------------------------------------------------------ diagnostics
  snapshot(): DiagSnapshot {
    const ctx = this.ctx;
    const store = this.store;
    return {
      state: this.state(),
      sampleRate: ctx?.sampleRate ?? null,
      baseLatencyMs: ctx && typeof ctx.baseLatency === "number" ? Math.round(ctx.baseLatency * 1000 * 10) / 10 : null,
      outputLatencyMs: ctx && typeof ctx.outputLatency === "number" ? Math.round(ctx.outputLatency * 1000 * 10) / 10 : null,
      activeVoices: this.sfx?.activeVoices() ?? 0,
      activeLoops: this.sfx?.activeLoops() ?? 0,
      counters: { ...this.diag.counters },
      dropped: { ...this.diag.dropped },
      loadedBuffers: store?.list() ?? [],
      failedLoads: store ? [...store.failed.entries()].map(([id, f]) => ({ id, error: f.error, attempts: f.attempts })) : [],
      music: { track: this.music?.track() ?? null, scene: this.wantedScene, slots: this.music?.slots() ?? 0, positionS: Math.round((this.music?.position() ?? 0) * 10) / 10 },
      ambience: { track: this.music?.ambience() ?? null },
      prefs: this.prefs.get(),
      bufferMemoryMB: Math.round(((store?.memoryBytes() ?? 0) / 1048576) * 10) / 10,
    };
  }

  setLogging(on: boolean): void {
    this.diag.logging = on;
  }

  events(): readonly DiagEvent[] {
    return this.diag.events();
  }

  subscribeDiag(l: (e: DiagEvent) => void): () => void {
    return this.diag.subscribe(l);
  }

  recordingTap(): MediaStream | null {
    if (!this.opts.devTools || !this.mixer) return null;
    return this.mixer.tap().stream;
  }

  dispose(): void {
    for (const c of this.cleanups.splice(0)) c();
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.sfx?.stopAll(10);
    this.music?.stop(0.05);
    this.mixer?.dispose();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.listeners.clear();
  }
}
