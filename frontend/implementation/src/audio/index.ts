import { devTools, env } from "@/src/config/env";
import { AudioEngine } from "./engine/AudioEngine";
import { AUDIO_ASSETS } from "./registry/assets.generated";
import { AUDIO_EVENTS, type AudioEventId } from "./registry/events";
import { AUDIO_SCENES, type AudioSceneId } from "./registry/scenes";
import { DEFAULT_PREFS, type AudioApi, type EmitParams, type LoopHandle, type LoopParams, type VoiceHandle } from "./types";

export { AUDIO_EVENTS, PENTATONIC_RATES } from "./registry/events";
export { AUDIO_SCENES } from "./registry/scenes";
export type { AudioEventId } from "./registry/events";
export type { AudioSceneId } from "./registry/scenes";
export type { AudioApi } from "./types";

/** The app-facing API: event and scene ids are checked at compile time. */
export interface TypedAudio extends Omit<AudioApi, "emit" | "loop" | "scene"> {
  emit(id: AudioEventId, params?: EmitParams): VoiceHandle | null;
  loop(id: AudioEventId, params?: LoopParams): LoopHandle;
  scene(id: AudioSceneId | null): void;
}

const NULL_LOOP: LoopHandle = { active: false, update: () => undefined, stop: () => undefined };

/** Silent implementation for the server render, tests without Web Audio, and unsupported browsers. */
const NULL_AUDIO: AudioApi = {
  state: () => "unsupported",
  unlock: () => Promise.resolve(false),
  emit: () => null,
  loop: () => NULL_LOOP,
  scene: () => undefined,
  currentScene: () => null,
  duck: () => undefined,
  musicPatch: () => undefined,
  warm: () => undefined,
  getPrefs: () => DEFAULT_PREFS,
  setPrefs: () => undefined,
  subscribe: () => () => undefined,
  snapshot: () => ({
    state: "unsupported",
    sampleRate: null,
    baseLatencyMs: null,
    outputLatencyMs: null,
    activeVoices: 0,
    activeLoops: 0,
    counters: {},
    dropped: {},
    loadedBuffers: [],
    failedLoads: [],
    music: { track: null, scene: null, slots: 0, positionS: 0 },
    ambience: { track: null },
    prefs: DEFAULT_PREFS,
    bufferMemoryMB: 0,
  }),
  setLogging: () => undefined,
  events: () => [],
  subscribeDiag: () => () => undefined,
  recordingTap: () => null,
  installUnlock: () => () => undefined,
  dispose: () => undefined,
};

type Holder = { __sketchbookAudio?: AudioEngine };

/** One engine per page (survives React StrictMode double effects and Fast Refresh). */
export function getAudio(): AudioApi {
  if (typeof window === "undefined") return NULL_AUDIO;
  const g = globalThis as unknown as Holder;
  if (!g.__sketchbookAudio) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    const dev = devTools();
    const engine = new AudioEngine({ events: AUDIO_EVENTS, scenes: AUDIO_SCENES, catalog: AUDIO_ASSETS, storage, devTools: dev });
    if (dev) engine.setLogging(true);
    g.__sketchbookAudio = engine;
    if (env.testHooksEnabled || dev) (window as unknown as { __audioDiag?: AudioApi }).__audioDiag = engine;
  }
  return g.__sketchbookAudio;
}

/** Stable delegate: safe to import anywhere (module scope included); resolves the engine lazily on each call. */
export const audio: TypedAudio = {
  state: () => getAudio().state(),
  unlock: () => getAudio().unlock(),
  emit: (id, params) => getAudio().emit(id, params),
  loop: (id, params) => getAudio().loop(id, params),
  scene: (id) => getAudio().scene(id),
  currentScene: () => getAudio().currentScene(),
  duck: (db, holdMs) => getAudio().duck(db, holdMs),
  musicPatch: (p) => getAudio().musicPatch(p),
  warm: (ids) => getAudio().warm(ids),
  getPrefs: () => getAudio().getPrefs(),
  setPrefs: (p) => getAudio().setPrefs(p),
  subscribe: (l) => getAudio().subscribe(l),
  snapshot: () => getAudio().snapshot(),
  setLogging: (on) => getAudio().setLogging(on),
  events: () => getAudio().events(),
  subscribeDiag: (l) => getAudio().subscribeDiag(l),
  recordingTap: () => getAudio().recordingTap(),
  installUnlock: (t) => getAudio().installUnlock(t),
  dispose: () => getAudio().dispose(),
};
