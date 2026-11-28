"use client";
import { useEffect, useRef } from "react";
import { audio } from "../index";
import { useAudioUnlock } from "../react/hooks";
import { sceneFor, type SceneInputs } from "./scene-map";

export interface ShellAudioInputs extends SceneInputs {
  readonly cameraStatus: string;
  readonly routeNotice: string | null;
}

/**
 * Shell-level audio director: unlock on the first real gesture, route -> music scene, camera status sounds, route notice.
 * Edge-detected from stable state, so StrictMode double effects and re-renders never double-fire.
 */
export function useShellAudio(i: ShellAudioInputs): void {
  useAudioUnlock();

  const scene = sceneFor(i);
  useEffect(() => {
    audio.scene(scene);
  }, [scene]);

  const prevCam = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevCam.current;
    prevCam.current = i.cameraStatus;
    if (prev === null || prev === i.cameraStatus) return;
    if (i.cameraStatus === "live" && prev === "requesting") audio.emit("sys.ready");
    else if ((i.cameraStatus === "denied" || i.cameraStatus === "unavailable") && prev === "requesting") audio.emit("sys.hiccup");
  }, [i.cameraStatus]);

  const prevNotice = useRef<string | null>(null);
  useEffect(() => {
    if (i.routeNotice && i.routeNotice !== prevNotice.current) audio.emit("ui.notice");
    prevNotice.current = i.routeNotice;
  }, [i.routeNotice]);
}
