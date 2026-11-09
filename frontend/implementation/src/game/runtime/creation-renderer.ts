/**
 * Draws the student's creations in the integrated scene. The visible object is the student's own
 * ink with a small label: no card and no frame. The collision box stays the plain rectangle the
 * placement rules use, so Thinman can stand on it and jump over it.
 */
import type { KAPLAYCtx } from "kaplay";
import type { WorldCreation } from "../creation-store";
import { createArtPlanCache, INK_PIXEL_SCALE, LABEL_FONT_SIZE } from "./creations";
import { rectArea } from "./kaplay-helpers";
import type { SceneObject } from "./types";

const INK = [17, 17, 17] as const;
const PAPER = [255, 250, 240] as const;
const WARN = [239, 122, 55] as const;

export function createCreationRenderer(k: KAPLAYCtx, labelFont: string, isDestroyed: () => boolean) {
  const planFor = createArtPlanCache();

  /** `committed` creations get collision: solid = static body, danger = hazard, unresolved = none. */
  return function drawCreation(item: WorldCreation, committed: boolean): SceneObject {
    const plan = planFor(item);
    const art = k.add([
      k.pos(item.x, item.y),
      "creation",
      { creationId: item.id, label: item.label, creationBehavior: item.behavior },
    ]);
    // Draw order sorts by the z property (the same value z() sets). Behind Thinman, so the
    // student always sees the character stand on or jump over the object.
    Object.assign(art, { z: -1 });

    // Label pill above the object: solid paper with an ink outline. Danger gets an orange pill and a "!".
    const { label } = plan;
    const pill = label.warning ? WARN : PAPER;
    const chip = art.add([
      k.rect(label.width, label.height, { radius: 7 }),
      k.pos(Math.round((item.w - label.width) / 2), -label.height - 6),
      k.color(pill[0], pill[1], pill[2]),
      k.outline(2, k.rgb(INK[0], INK[1], INK[2])),
    ]);
    if (label.warning) chip.add([k.text("!", { size: 12, font: labelFont }), k.pos(6, 2), k.color(INK[0], INK[1], INK[2])]);
    chip.add([
      k.text(label.text, { size: LABEL_FONT_SIZE, font: labelFont }),
      k.pos(label.warning ? 19 : 7, 3),
      k.color(INK[0], INK[1], INK[2]),
    ]);

    // The student's own ink, rasterised once per object and scaled down to the object's box.
    const spriteName = `creation-ink-${item.id}`;
    const inkAsset = k.loadSprite(spriteName, plan.inkUri);
    void inkAsset.then(() => {
      if (!isDestroyed() && (!art.exists || art.exists())) {
        art.add([k.sprite(spriteName), k.pos(0, 0), k.scale(1 / INK_PIXEL_SCALE), k.opacity(plan.inkOpacity)]);
      }
    });

    if (committed && item.behavior !== "unresolved") art.use(rectArea(k, item.w, item.h));
    if (committed && item.behavior === "solid") art.use(k.body({ isStatic: true }));
    if (committed && item.behavior === "danger") art.use("hazard");
    return art;
  };
}
