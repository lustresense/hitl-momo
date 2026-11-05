/**
 * Draws the student's creations in the integrated scene: the coloured, labelled box plus the
 * hand-drawn sketch sprite on top, with collision components only once committed.
 */
import type { KAPLAYCtx } from "kaplay";
import type { WorldCreation } from "../creation-store";
import { generateSketchDataUri } from "../sketch-renderer";
import { rectArea } from "./kaplay-helpers";
import type { SceneObject } from "./types";

/** Sketch sprites are supersampled 4x so lines stay crisp when the world is scaled up. */
const SKETCH_PIXEL_SCALE = 4;

const BEHAVIOR_COLOR = {
  solid: [170, 130, 85],
  danger: [195, 92, 52],
  other: [140, 150, 160],
} as const;

function labelFor(item: WorldCreation): string {
  if (item.behavior === "danger") return `${item.label} (bahaya)`;
  if (item.behavior === "solid") return item.label;
  return `${item.label} (unresolved)`;
}

export function createCreationRenderer(k: KAPLAYCtx, labelFont: string, isDestroyed: () => boolean) {
  /** `committed` creations get collision: solid = static body, danger = hazard, unresolved = none. */
  return function drawCreation(item: WorldCreation, committed: boolean): SceneObject {
    const rgb =
      item.behavior === "solid"
        ? BEHAVIOR_COLOR.solid
        : item.behavior === "danger"
          ? BEHAVIOR_COLOR.danger
          : BEHAVIOR_COLOR.other;
    const art = k.add([
      k.rect(item.w, item.h),
      k.pos(item.x, item.y),
      k.color(rgb[0], rgb[1], rgb[2]),
      k.outline(2, k.rgb(26, 26, 26)),
      "creation",
      { creationId: item.id, label: item.label, creationBehavior: item.behavior },
    ]);
    art.add([
      k.text(labelFor(item), { size: 13, font: labelFont }),
      k.pos(0, -20),
      k.color(item.behavior === "danger" ? 180 : 50, 40, 30),
    ]);

    // Authentic student hand-drawn sketch sprite (single, uniformly scaled copy).
    const spriteName = `creation-sketch-${item.id}`;
    const spriteUri = generateSketchDataUri(item.drawingInput, {
      width: item.w,
      height: item.h,
      behavior: item.behavior,
      label: item.label,
      pixelScale: SKETCH_PIXEL_SCALE,
    });
    const spriteAsset = k.loadSprite(spriteName, spriteUri);
    void spriteAsset.then(() => {
      if (!isDestroyed() && (!art.exists || art.exists())) {
        art.add([k.sprite(spriteName), k.pos(0, 0), k.scale(1 / SKETCH_PIXEL_SCALE)]);
      }
    });

    if (committed && item.behavior !== "unresolved") art.use(rectArea(k, item.w, item.h));
    if (committed && item.behavior === "solid") art.use(k.body({ isStatic: true }));
    if (committed && item.behavior === "danger") art.use("hazard");
    return art;
  };
}
