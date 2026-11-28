import type { AudioSceneId } from "../registry/scenes";

export interface SceneInputs {
  readonly routeKind: "load" | "cover" | "tutorial" | "levels" | "canvas" | "level" | "ending";
  readonly introPlaying: boolean;
  /** 1-based stage of the active level (canvas/level routes) */
  readonly stage: number | null;
}

/** Pure route -> music scene mapping (unit tested). Never invents a scene: unknown stages fall back to the nearest world track. */
export function sceneFor(i: SceneInputs): AudioSceneId {
  switch (i.routeKind) {
    case "load":
      return "dream";
    case "cover":
      return "cover";
    case "tutorial":
      return "tutorial";
    case "levels":
      return "levels";
    case "canvas":
      return "canvas";
    case "ending":
      return "ending";
    case "level": {
      if (i.introPlaying) return "story";
      const s = Math.min(3, Math.max(1, Math.round(i.stage ?? 1)));
      return s === 1 ? "world1" : s === 2 ? "world2" : "world3";
    }
  }
}
