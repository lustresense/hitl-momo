import { describe, expect, it } from "vitest";
import {
  FALL_BOUNCE_TWEEN,
  FALL_SHADOW_FADEOUT,
  FALL_SQUASH_TWEEN,
  computeFallSwayDeg,
  computeLandingShadow,
  computeShadowLayout,
  createDustSpecs,
  fallProgress,
} from "@/src/features/world/fall-fx";
import {
  CAMERA_SKY_Y_PERCENT,
  CAMERA_WORLD_Y_PERCENT,
  FAR_CLOUDS,
  NEAR_CLOUDS,
  SKY_TRANSITION_DURATIONS,
  computeSkyTransitionSpec,
  scaleCloudWidth,
} from "@/src/features/world/sky-transition";

describe("sky-transition (pure, no DOM)", () => {
  it("matches sandbox world.js and stamp.js camera + sticker throw specs", () => {
    expect(CAMERA_SKY_Y_PERCENT).toBe(0);
    expect(CAMERA_WORLD_Y_PERCENT).toBe(-66.6667);
    expect(SKY_TRANSITION_DURATIONS.introRiseS).toBe(2.1);
    expect(SKY_TRANSITION_DURATIONS.nextRiseS).toBe(1.8);
    expect(SKY_TRANSITION_DURATIONS.descendS).toBe(1.5);
    expect(SKY_TRANSITION_DURATIONS.stickerThrowS).toBe(1.2);
    expect(FAR_CLOUDS).toHaveLength(6);
    expect(NEAR_CLOUDS).toHaveLength(3);
    expect(scaleCloudWidth(210, 1440)).toBe(210);
    expect(scaleCloudWidth(210, 720)).toBe(105);

    const rise = computeSkyTransitionSpec("rise");
    expect(rise.camera.fromYPercent).toBe(-66.6667);
    expect(rise.camera.toYPercent).toBe(0);
    expect(rise.camera.durationS).toBe(2.1);
    expect(rise.nearClouds.fromY).toBe(-220);
    expect(rise.nearClouds.toY).toBe(260);
    expect(rise.sticker).toBeNull();

    const descend = computeSkyTransitionSpec("descend", { viewportHeight: 1000, stickerInitial: { rot: -5, scale: 0.9 } });
    expect(descend.camera.fromYPercent).toBe(0);
    expect(descend.camera.toYPercent).toBe(-66.6667);
    expect(descend.camera.durationS).toBe(1.5);
    expect(descend.nearClouds.fromY).toBe(260);
    expect(descend.nearClouds.toY).toBe(-220);
    expect(descend.sticker).toEqual({
      fromRot: -5,
      fromScale: 0.9,
      toY: 600,
      toRot: 10,
      toScale: 0.62,
      durationS: 1.2,
      fadeDurationS: 0.25,
      fadeAtS: 1.1,
    });
  });
});

describe("fall-fx (pure visual math, no physics mutation)", () => {
  it("computes normalized fall progress, damped sway, and growing landing shadow", () => {
    expect(fallProgress(5, 5, 205)).toBe(0);
    expect(fallProgress(105, 5, 205)).toBe(0.5);
    expect(fallProgress(250, 5, 205)).toBe(1);

    // At landing (progress = 1), sway calms down to 0
    expect(computeFallSwayDeg(500, 1)).toBe(0);
    expect(Math.abs(computeFallSwayDeg(196, 0))).toBeGreaterThan(0);

    // Shadow grows from scale 0.25 / opacity 0.1 at start to scale 1 / opacity 0.5 at ground
    expect(computeLandingShadow(0)).toEqual({ scale: 0.25, opacity: 0.1 });
    expect(computeLandingShadow(1)).toEqual({ scale: 1, opacity: 0.5 });
  });

  it("computes stage-percentage shadow layout, landing tweens, and 8 dust puffs", () => {
    const layout = computeShadowLayout({ x: 360, y: 200, w: 80, h: 25 }, { width: 800, height: 450 });
    expect(layout.leftPct).toBeCloseTo(50, 5);
    expect(layout.topPct).toBeCloseTo(50, 5);
    expect(layout.widthPct).toBeCloseTo((80 * 1.3 * 100) / 800, 5);

    expect(FALL_SQUASH_TWEEN).toMatchObject({ fromScaleY: 0.82, fromScaleX: 1.1, duration: 0.45 });
    expect(FALL_BOUNCE_TWEEN).toMatchObject({ toY: -5, duration: 0.13, repeat: 1 });
    expect(FALL_SHADOW_FADEOUT).toMatchObject({ opacity: 0, duration: 0.5, delay: 0.15 });

    const dust = createDustSpecs({ x: 360, y: 200, w: 80, h: 25 }, { width: 800, height: 450 }, () => 0.5);
    expect(dust).toHaveLength(8);
    expect(dust[0]?.side).toBe(-1);
    expect(dust[1]?.side).toBe(1);
    expect(dust[0]?.targetX).toBe(-23);
    expect(dust[1]?.targetX).toBe(23);
    expect(dust[0]?.targetY).toBe(-12);
  });
});
