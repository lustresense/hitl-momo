"use client";
import { useEffect, useSyncExternalStore } from "react";
import { audio, getAudio, type AudioSceneId } from "../index";
import { DEFAULT_PREFS, type AudioPrefsState, type EngineState } from "../types";

/** Install the global unlock listener once (first real user gesture creates/resumes the AudioContext). */
export function useAudioUnlock(): void {
  useEffect(() => {
    const off = getAudio().installUnlock(window);
    return off;
  }, []);
}

export function useAudioPrefs(): AudioPrefsState {
  return useSyncExternalStore(
    (l) => getAudio().subscribe(l),
    () => getAudio().getPrefs(),
    () => DEFAULT_PREFS,
  );
}

export function useAudioState(): EngineState {
  return useSyncExternalStore(
    (l) => getAudio().subscribe(l),
    () => getAudio().state(),
    () => "idle" as EngineState,
  );
}

/** Declare the scene while this component is mounted. Idempotent, so StrictMode double effects are harmless. */
export function useAudioScene(id: AudioSceneId | null): void {
  useEffect(() => {
    audio.scene(id);
  }, [id]);
}
