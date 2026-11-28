import type { SceneConfig } from "../types";

/**
 * Scene -> music and ambience. One musical identity (the "Kite motif", C major pentatonic) runs through all tracks.
 * Asking for the track that already plays keeps it running, so scenes that share a track (all of `canvas`) never restart it.
 * `warm` entries are decoded in idle time after the scene starts so the next crossfade has no load stall.
 */
export const AUDIO_SCENES = {
  dream: { track: "bgm.dream", amb: "amb.dream_wind", fadeInS: 2.6, fadeOutS: 2.0, warm: ["group:core", "bgm.cover"] },
  cover: { track: "bgm.cover", amb: "amb.paper_room", fadeInS: 2.2, warm: ["group:cover", "bgm.tutorial"] },
  tutorial: { track: "bgm.tutorial", amb: "amb.paper_room", warm: ["group:tutorial", "bgm.levels"] },
  levels: { track: "bgm.levels", amb: null, warm: ["group:levels", "bgm.story"] },
  story: { track: "bgm.story", amb: "amb.world_air", gain: 0.9, fadeInS: 2.0, warm: ["bgm.focus"] },
  canvas: { track: "bgm.focus", amb: "amb.paper_room", gain: 0.9, fadeInS: 2.4, warm: ["group:canvas"] },
  world1: { track: "bgm.l1", amb: "amb.world_air", warm: ["group:world"] },
  world2: { track: "bgm.l2", amb: "amb.world_air", warm: ["group:world"] },
  world3: { track: "bgm.l3", amb: "amb.world_air", warm: ["group:world"] },
  ending: { track: "bgm.ending", amb: "amb.world_air", fadeInS: 3.0, warm: ["group:ending"] },
  silence: { track: null, amb: null, fadeOutS: 1.0 },
} as const satisfies Record<string, SceneConfig>;

export type AudioSceneId = keyof typeof AUDIO_SCENES;
