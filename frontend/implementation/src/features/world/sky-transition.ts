import { STAMP_THROW_MS, THROW_TRAVEL } from "@/src/nui/core/constants";

/** Kolom kamera 3 layar (world.js:73): 0 = langit bersih, -66.6667 = panggung dunia. */
export const CAMERA_SKY_Y_PERCENT = 0;
export const CAMERA_WORLD_Y_PERCENT = -66.6667;

export const SKY_TRANSITION_DURATIONS = {
  introRiseS: 2.1,
  nextRiseS: 1.8,
  descendS: 1.5,
  stickerThrowS: STAMP_THROW_MS / 1000,
  stickerFadeS: 0.25,
  stickerFadeAtS: (STAMP_THROW_MS - 100) / 1000,
} as const;

export interface CloudBlueprint {
  readonly xPct: number;
  readonly yPct: number;
  readonly baseWidthPx: number;
  readonly flip?: boolean;
}

/** Tata letak awan jauh & dekat dari world.js:78-79. */
export const FAR_CLOUDS: readonly CloudBlueprint[] = [
  { xPct: 4, yPct: 10, baseWidthPx: 210 },
  { xPct: 62, yPct: 4, baseWidthPx: 170, flip: true },
  { xPct: 34, yPct: 44, baseWidthPx: 240 },
  { xPct: 76, yPct: 58, baseWidthPx: 150 },
  { xPct: 8, yPct: 72, baseWidthPx: 160, flip: true },
  { xPct: 52, yPct: 84, baseWidthPx: 190 },
];

export const NEAR_CLOUDS: readonly CloudBlueprint[] = [
  { xPct: -4, yPct: 26, baseWidthPx: 380 },
  { xPct: 70, yPct: 38, baseWidthPx: 420, flip: true },
  { xPct: 22, yPct: 70, baseWidthPx: 340 },
];

export type SkyDirection = "rise" | "descend";

export interface SkyTransitionSpec {
  readonly direction: SkyDirection;
  readonly camera: {
    readonly fromYPercent: number;
    readonly toYPercent: number;
    readonly durationS: number;
    readonly ease: "power2.inOut";
  };
  readonly nearClouds: {
    readonly fromY: number;
    readonly toY: number;
    readonly durationS: number;
    readonly ease: "power1.inOut";
  };
  readonly sticker: {
    readonly fromRot: number;
    readonly fromScale: number;
    readonly toY: number;
    readonly toRot: number;
    readonly toScale: number;
    readonly durationS: number;
    readonly fadeDurationS: number;
    readonly fadeAtS: number;
  } | null;
}

export function scaleCloudWidth(baseWidthPx: number, viewportWidthPx: number): number {
  return Math.round(baseWidthPx * (viewportWidthPx / 1440));
}

/**
 * Spesifikasi transisi kamera naik ke langit / turun membawa stiker (port world.js:88-95 & stamp.js:62-82).
 * Murni data/matematika tanpa ketergantungan DOM.
 */
export function computeSkyTransitionSpec(
  direction: SkyDirection,
  options: {
    durationS?: number;
    viewportHeight?: number;
    stickerInitial?: { rot?: number; scale?: number };
  } = {},
): SkyTransitionSpec {
  const isRise = direction === "rise";
  const durationS =
    options.durationS ?? (isRise ? SKY_TRANSITION_DURATIONS.introRiseS : SKY_TRANSITION_DURATIONS.descendS);
  const vh = options.viewportHeight ?? 720;

  return {
    direction,
    camera: {
      fromYPercent: isRise ? CAMERA_WORLD_Y_PERCENT : CAMERA_SKY_Y_PERCENT,
      toYPercent: isRise ? CAMERA_SKY_Y_PERCENT : CAMERA_WORLD_Y_PERCENT,
      durationS,
      ease: "power2.inOut",
    },
    nearClouds: {
      fromY: isRise ? -220 : 260,
      toY: isRise ? 260 : -220,
      durationS,
      ease: "power1.inOut",
    },
    sticker: isRise
      ? null
      : {
          fromRot: options.stickerInitial?.rot ?? 0,
          fromScale: options.stickerInitial?.scale ?? 1,
          toY: vh * THROW_TRAVEL,
          toRot: 10,
          toScale: 0.62,
          durationS: SKY_TRANSITION_DURATIONS.stickerThrowS,
          fadeDurationS: SKY_TRANSITION_DURATIONS.stickerFadeS,
          fadeAtS: SKY_TRANSITION_DURATIONS.stickerFadeAtS,
        },
  };
}
