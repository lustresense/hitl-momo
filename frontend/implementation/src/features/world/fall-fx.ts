export interface FallBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface WorldStageSize {
  readonly width: number;
  readonly height: number;
}

export interface ShadowLayout {
  readonly leftPct: number;
  readonly topPct: number;
  readonly widthPct: number;
}

export interface DustPuffSpec {
  readonly index: number;
  readonly side: -1 | 1;
  readonly leftPct: number;
  readonly topPct: number;
  readonly initialScale: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetScale: number;
  readonly durationS: number;
}

/** Tween mendarat (fallfx.js:19-22) — murni visual, tidak pernah menyentuh koordinat fisika KAPLAY. */
export const FALL_SQUASH_TWEEN = {
  fromScaleX: 1.1,
  fromScaleY: 0.82,
  toScaleX: 1,
  toScaleY: 1,
  duration: 0.45,
  ease: "elastic.out(1,.4)",
} as const;

export const FALL_BOUNCE_TWEEN = {
  fromY: 0,
  toY: -5,
  duration: 0.13,
  yoyo: true,
  repeat: 1,
  ease: "power1.out",
} as const;

export const FALL_SHADOW_FADEOUT = {
  opacity: 0,
  duration: 0.5,
  delay: 0.15,
} as const;

export const FALL_DUST_COUNT = 8;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function fallProgress(y: number, startY: number, endY: number): number {
  return clamp01((y - startY) / Math.max(1, endY - startY));
}

/** Ayunan kiri-kanan selama benda jatuh yang mereda saat mendekati dasar (fallfx.js:16). */
export function computeFallSwayDeg(elapsedMs: number, progress: number): number {
  const deg = 5 * Math.sin((elapsedMs / 1000) * 8) * (1 - clamp01(progress));
  return deg === 0 ? 0 : deg;
}

/** Bayangan tumbuh membesar dan lebih gelap menjelang mendarat (fallfx.js:17). */
export function computeLandingShadow(progress: number): { scale: number; opacity: number } {
  const k = clamp01(progress);
  return {
    scale: 0.25 + 0.75 * k * k,
    opacity: 0.1 + 0.4 * k,
  };
}

/** Posisi & lebar bayangan dalam persentase panggung 16:9 (fallfx.js:12). */
export function computeShadowLayout(
  landingBox: FallBox,
  stage: WorldStageSize = { width: 800, height: 450 },
): ShadowLayout {
  const cx = landingBox.x + landingBox.w / 2;
  const bottom = landingBox.y + landingBox.h;
  return {
    leftPct: (cx / stage.width) * 100,
    topPct: (bottom / stage.height) * 100,
    widthPct: (Math.max(14, landingBox.w) * 1.3 * 100) / stage.width,
  };
}

/** 8 partikel debu kiri-kanan di titik pendaratan (fallfx.js:23-29). */
export function createDustSpecs(
  landingBox: FallBox,
  stage: WorldStageSize = { width: 800, height: 450 },
  rng: () => number = Math.random,
): DustPuffSpec[] {
  const cx = landingBox.x + landingBox.w / 2;
  const bottom = landingBox.y + landingBox.h;
  const out: DustPuffSpec[] = [];
  for (let k = 0; k < FALL_DUST_COUNT; k++) {
    const side: -1 | 1 = k % 2 === 1 ? 1 : -1;
    out.push({
      index: k,
      side,
      leftPct: ((cx + side * landingBox.w * 0.42) / stage.width) * 100,
      topPct: ((bottom - 1) / stage.height) * 100,
      initialScale: 0.5 + rng() * 0.5,
      targetX: side * (10 + rng() * 26),
      targetY: -(4 + rng() * 16),
      targetScale: 1.4 + rng(),
      durationS: 0.55 + rng() * 0.25,
    });
  }
  return out;
}
