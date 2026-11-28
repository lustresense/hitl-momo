import { DEFAULT_PREFS, type AudioPrefsState } from "../types";

export const AUDIO_PREFS_KEY = "sketchbook.audio.prefs.v1";

type Listener = (p: AudioPrefsState) => void;

const clamp01 = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** Local audio preferences (master, music, sfx, mute). Safe when storage is missing or throws (private mode, SSR). */
export class AudioPrefs {
  private state: AudioPrefsState = DEFAULT_PREFS;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null = null) {
    this.state = this.read();
  }

  private read(): AudioPrefsState {
    try {
      const raw = this.storage?.getItem(AUDIO_PREFS_KEY);
      if (!raw) return DEFAULT_PREFS;
      const j = JSON.parse(raw) as Record<string, unknown>;
      return {
        master: clamp01(j.master, DEFAULT_PREFS.master),
        music: clamp01(j.music, DEFAULT_PREFS.music),
        sfx: clamp01(j.sfx, DEFAULT_PREFS.sfx),
        muted: typeof j.muted === "boolean" ? j.muted : DEFAULT_PREFS.muted,
      };
    } catch {
      return DEFAULT_PREFS;
    }
  }

  get(): AudioPrefsState {
    return this.state;
  }

  set(patch: Partial<AudioPrefsState>): AudioPrefsState {
    const next: AudioPrefsState = {
      master: clamp01(patch.master ?? this.state.master, this.state.master),
      music: clamp01(patch.music ?? this.state.music, this.state.music),
      sfx: clamp01(patch.sfx ?? this.state.sfx, this.state.sfx),
      muted: patch.muted ?? this.state.muted,
    };
    this.state = next;
    try {
      this.storage?.setItem(AUDIO_PREFS_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: keep the in-memory value */
    }
    for (const l of this.listeners) l(next);
    return next;
  }

  /** Re-read storage (another tab changed it). */
  reload(): void {
    this.state = this.read();
    for (const l of this.listeners) l(this.state);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
