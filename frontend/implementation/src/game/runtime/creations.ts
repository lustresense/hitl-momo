/**
 * Pure helpers for WorldCreation records: deep copies, the initial "pending" creation and the
 * visual plan of a creation's art. Nothing here touches KAPLAY, so it can be tested directly.
 */
import type { WorldCreation } from "../creation-store";
import type { StageGeometry } from "../stage-geometry";
import { generateSketchDataUri } from "../sketch-renderer";
import type { KaplayGameOptions } from "./types";

export function cloneCreation(item: WorldCreation): WorldCreation {
  return {
    ...item,
    drawingInput: item.drawingInput
      ? {
          ...item.drawingInput,
          strokes: item.drawingInput.strokes.map((stroke) => stroke.map((point) => ({ ...point }))),
        }
      : null,
  };
}

/** How far right of the spawn point a new object first appears. */
const PENDING_SPAWN_OFFSET_X = 24;

function newCreationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `creation-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** The object the student is about to place: starts just right of the spawn, resting on the spawn platform. */
export function createPendingCreation(
  options: Pick<KaplayGameOptions, "finalLabel" | "behavior" | "drawingInput">,
  geometry: StageGeometry,
): WorldCreation {
  const spawnPlatform = geometry.platforms.find(
    (p) =>
      geometry.spawn.x >= p.x &&
      geometry.spawn.x <= p.x + p.w &&
      Math.abs(p.y - geometry.spawn.y) < 1,
  );
  return {
    id: newCreationId(),
    label: options.finalLabel,
    behavior: options.behavior,
    drawingInput: options.drawingInput,
    x: Math.max(
      0,
      Math.min(geometry.world.width - geometry.object.w, geometry.spawn.x + PENDING_SPAWN_OFFSET_X),
    ),
    y: (spawnPlatform?.y ?? geometry.spawn.y) - geometry.object.h,
    ...geometry.object,
  };
}

/** Ink is rasterised at this supersampling and scaled back down, so it stays crisp when the world is zoomed. */
export const INK_PIXEL_SCALE = 4;
/** Secondary label (PRD 0.0.16 R8.3): smaller than Thinman, Momo and the objects. */
export const LABEL_FONT_SIZE = 11;
export const LABEL_CHIP_HEIGHT = 17;
/** An unresolved object has no collision, so its ink is drawn faded to show that. */
const UNRESOLVED_INK_OPACITY = 0.55;

export interface CreationArtPlan {
  /** SVG data URI of the student's own ink only (no card), sized to the object box at INK_PIXEL_SCALE. */
  inkUri: string;
  inkOpacity: number;
  label: { text: string; width: number; height: number; warning: boolean };
}

/**
 * Pill width from a proportional-font estimate. Avoids a measuring pass and keeps short words snug;
 * the warning mark takes extra room on the left.
 */
export function labelChipWidth(text: string, warning: boolean): number {
  return Math.round(text.length * LABEL_FONT_SIZE * 0.58 + 14 + (warning ? 14 : 0));
}

/** Everything the scene draws for one object, derived from its data alone. */
export function planCreationArt(item: WorldCreation): CreationArtPlan {
  const warning = item.behavior === "danger";
  return {
    inkUri: generateSketchDataUri(item.drawingInput, {
      width: item.w,
      height: item.h,
      behavior: item.behavior,
      label: item.label,
      pixelScale: INK_PIXEL_SCALE,
      frame: "none",
    }),
    inkOpacity: item.behavior === "unresolved" ? UNRESOLVED_INK_OPACITY : 1,
    label: {
      text: item.label,
      width: labelChipWidth(item.label, warning),
      height: LABEL_CHIP_HEIGHT,
      warning,
    },
  };
}

/**
 * Memoises plans per object, so an object's ink is fitted once and a redraw (for example after
 * re-selecting it) reuses the same plan instead of recomputing the strokes.
 */
export function createArtPlanCache(): (item: WorldCreation) => CreationArtPlan {
  const plans = new Map<string, CreationArtPlan>();
  return (item) => {
    const key = `${item.id}|${item.w}|${item.h}|${item.behavior}|${item.label}`;
    const cached = plans.get(key);
    if (cached) return cached;
    const plan = planCreationArt(item);
    plans.set(key, plan);
    return plan;
  };
}
