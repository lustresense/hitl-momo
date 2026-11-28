/**
 * Sketchbook Universe audio system: shared types.
 *
 * Design rules (see docs/audio/AUDIO_ARCHITECTURE.md):
 * - ONE audio engine for the whole app (React, GSAP and KAPLAY all call into it; nobody else creates an AudioContext/Audio element).
 * - Momo has NO voice: no speech, TTS, STT or dialogue-like sounds. Only physical, non-vocal sounds exist.
 * - Sound is never the only feedback; every sound mirrors a visual state change that already exists.
 */

/** Mixer buses. `ui` follows the SFX preference, `amb` follows the music preference. */
export type BusId = "music" | "sfx" | "ui" | "amb";

export type EngineState = "idle" | "locked" | "running" | "suspended" | "unsupported";

export interface AudioPrefsState {
  readonly master: number; // 0..1 (perceptual: gain = value^2)
  readonly music: number;
  readonly sfx: number;
  readonly muted: boolean;
}

export const DEFAULT_PREFS: AudioPrefsState = { master: 0.8, music: 0.6, sfx: 0.9, muted: false };

export type DropReason =
  | "locked"
  | "muted"
  | "cooldown"
  | "voice-cap"
  | "missing-asset"
  | "load-failed"
  | "unknown-event"
  | "no-context"
  | "hidden"
  | "stale";

/** Playback rule for one audio event. Several `assets` are variants (round-robin, never the same twice in a row). */
export interface EventRule {
  readonly assets: readonly string[];
  readonly bus?: BusId; // default: asset bus
  readonly gain?: number; // linear, default 1
  readonly pitchJitterCents?: number; // random +- detune per play, default 0
  readonly cooldownMs?: number; // minimum gap between two plays of this event
  readonly maxVoices?: number; // max simultaneous voices of this event (oldest is faded out)
  readonly priority?: number; // 0..10, used for voice stealing (default 5)
  readonly duckMusicDb?: number; // dip music by this many dB while the sound plays (negative number)
  readonly duckMs?: number; // hold time of the duck (default: asset duration)
  readonly sceneBound?: boolean; // faded out when the scene changes (default false; long sounds should set true)
  readonly delayMs?: number;
  readonly pan?: number; // -1..1
  readonly note?: string; // documentation only
}

export interface EmitParams {
  readonly gain?: number; // extra linear multiplier (e.g. intensity 0..1)
  readonly rate?: number; // playbackRate multiplier
  readonly pan?: number;
  readonly variant?: number; // force a specific variant index
}

export interface VoiceHandle {
  readonly assetId: string;
  stop(fadeMs?: number): void;
}

export interface LoopParams {
  readonly gain?: number;
  readonly rate?: number;
  readonly fadeInMs?: number;
  readonly bus?: BusId;
  /** stopped automatically when the scene changes (default true) */
  readonly sceneBound?: boolean;
}

export interface LoopHandle {
  readonly active: boolean;
  update(p: { gain?: number; rate?: number; rampMs?: number }): void;
  stop(fadeMs?: number): void;
}

/** Scene to music/ambience mapping entry. */
export interface SceneConfig {
  readonly track: string | null; // music asset id or null (silence)
  readonly amb?: string | null; // ambience asset id
  readonly fadeInS?: number;
  readonly fadeOutS?: number;
  readonly gain?: number; // linear trim for this scene
  readonly lowpassHz?: number; // optional dulling for calm scenes
  /** asset ids (or `group:<name>`) decoded in idle time after the scene started, so the next scene starts without a stall */
  readonly warm?: readonly string[];
}

export interface MusicStatePatch {
  readonly gain?: number; // linear multiplier applied on top of the scene gain
  readonly lowpassHz?: number;
  readonly rampS?: number;
}

export interface DiagEvent {
  readonly t: number; // ms since engine start
  readonly kind: "emit" | "play" | "drop" | "scene" | "music" | "loop" | "load" | "ctx" | "duck";
  readonly id: string;
  readonly detail?: string;
}

export interface DiagSnapshot {
  readonly state: EngineState;
  readonly sampleRate: number | null;
  readonly baseLatencyMs: number | null;
  readonly outputLatencyMs: number | null;
  readonly activeVoices: number;
  readonly activeLoops: number;
  readonly counters: Readonly<Record<string, number>>;
  readonly dropped: Readonly<Record<string, number>>;
  readonly loadedBuffers: ReadonlyArray<{ id: string; bytesEstimate: number; seconds: number }>;
  readonly failedLoads: ReadonlyArray<{ id: string; error: string; attempts: number }>;
  readonly music: { track: string | null; scene: string | null; slots: number; positionS: number };
  readonly ambience: { track: string | null };
  readonly prefs: AudioPrefsState;
  readonly bufferMemoryMB: number;
}

/** Public facade used by the app (React, GSAP, KAPLAY callbacks). The server/unsupported implementation is a silent no-op. */
export interface AudioApi {
  state(): EngineState;
  /** Create/resume the AudioContext. Must run inside a real user gesture (the global unlock listener does this). */
  unlock(): Promise<boolean>;
  emit(id: string, params?: EmitParams): VoiceHandle | null;
  loop(id: string, params?: LoopParams): LoopHandle;
  /** Declare the current scene (idempotent). Fades out scene-bound sounds, crossfades the music. `null` = silence. */
  scene(id: string | null): void;
  currentScene(): string | null;
  duck(db: number, holdMs?: number): void;
  musicPatch(p: MusicStatePatch): void;
  warm(ids: readonly string[]): void;
  getPrefs(): AudioPrefsState;
  setPrefs(patch: Partial<AudioPrefsState>): void;
  /** notified on prefs and state changes (useSyncExternalStore) */
  subscribe(l: () => void): () => void;
  snapshot(): DiagSnapshot;
  setLogging(on: boolean): void;
  events(): readonly DiagEvent[];
  subscribeDiag(l: (e: DiagEvent) => void): () => void;
  /** dev/recording only: the mixed output as a MediaStream (null unless devTools) */
  recordingTap(): MediaStream | null;
  installUnlock(target: EventTarget): () => void;
  dispose(): void;
}
