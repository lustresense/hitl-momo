/**
 * R22B Contract K11 (`CanvasMechanismPreset`) & Contract K4 v1.1 (Compositional HandState Taxonomy).
 *
 * Enforces:
 *  - Per-level Canvas gesture mechanism presets (`default-any-pinch`, `ok-pinch-only`,
 *    `closed-pinch-only`, `three-imr-action`, `three-mrp-vs-ok`).
 *  - Classes outside the active preset NEVER trigger actions.
 *  - Risky-pair detection (`FIST+PINCH_CLOSED`, `THREE_MRP+PINCH_OK`, `PINCH_OK+FIVE`) so strict
 *    onset/FIVE gates are mandatory whenever those pairs coexist.
 *  - Additive compositional K4 v1.1 hand-state types + v1.0 <-> v1.1 mapping.
 */

export type PinchVariant = "CLOSED" | "OK";
export type ThreeVariant = "IMR" | "TIM" | "MRP";
export type K4FingerPosture = "EXT" | "CURL" | "BETWEEN";
export type ReacquirePinchPolicy = "require-release" | "allow-after-confirm";

export type K4DerivedClass =
  | "FIST"
  | "ONE"
  | "TWO"
  | "THREE_IMR"
  | "THREE_TIM"
  | "THREE_MRP"
  | "FOUR"
  | "FIVE"
  | "PINCH_CLOSED"
  | "PINCH_OK"
  | "NEAR_PINCH"
  | "OTHER";

export interface K4FingerPostures {
  thumb: K4FingerPosture;
  index: K4FingerPosture;
  middle: K4FingerPosture;
  ring: K4FingerPosture;
  pinky: K4FingerPosture;
}

export interface HandStateReading {
  contact: "TOUCH" | "NEAR" | "OPEN";
  variant: PinchVariant | null;
  fingers: K4FingerPostures | null;
  threeVariant: ThreeVariant | null;
  derivedClass: K4DerivedClass;
}

export interface CanvasMechanismPreset {
  id: string;
  label: string;
  draw: Array<"PINCH_CLOSED" | "PINCH_OK">;
  three: null | { variant: ThreeVariant; action: "THREE_ACTION" };
  undoRedo: "FIST_ONE_TWO" | "OFF";
  erase: "FIVE" | "OFF";
  experimental?: boolean;
}

export const DEFAULT_CANVAS_PRESET_ID = "ok-pinch-only" as const;

const RAW_CANVAS_PRESETS: CanvasMechanismPreset[] = [
  Object.freeze<CanvasMechanismPreset>({
    id: "default-any-pinch",
    label: "Default (Cubit Rapat & OK)",
    draw: ["PINCH_CLOSED", "PINCH_OK"],
    three: null,
    undoRedo: "FIST_ONE_TWO",
    erase: "FIVE",
  }),
  Object.freeze<CanvasMechanismPreset>({
    id: "ok-pinch-only",
    label: "Cubit OK Saja (Kandidat Anak)",
    draw: ["PINCH_OK"],
    three: null,
    undoRedo: "FIST_ONE_TWO",
    erase: "FIVE",
  }),
  Object.freeze<CanvasMechanismPreset>({
    id: "closed-pinch-only",
    label: "Cubit Rapat Saja",
    draw: ["PINCH_CLOSED"],
    three: null,
    undoRedo: "FIST_ONE_TWO",
    erase: "FIVE",
  }),
  Object.freeze<CanvasMechanismPreset>({
    id: "three-imr-action",
    label: "Cubit + Aksi 3 Jari (IMR)",
    draw: ["PINCH_CLOSED", "PINCH_OK"],
    three: { variant: "IMR", action: "THREE_ACTION" },
    undoRedo: "FIST_ONE_TWO",
    erase: "FIVE",
  }),
  Object.freeze<CanvasMechanismPreset>({
    id: "three-mrp-vs-ok",
    label: "Cubit OK + 3 Jari MRP (Eksperimental)",
    draw: ["PINCH_OK"],
    three: { variant: "MRP", action: "THREE_ACTION" },
    undoRedo: "FIST_ONE_TWO",
    erase: "FIVE",
    experimental: true,
  }),
];

export const CANVAS_PRESETS: ReadonlyArray<CanvasMechanismPreset> = Object.freeze(RAW_CANVAS_PRESETS);

export const CANVAS_PRESET_MAP: ReadonlyMap<string, CanvasMechanismPreset> = new Map(
  CANVAS_PRESETS.map((p) => [p.id, p]),
);

export function getCanvasPreset(id?: string | null): CanvasMechanismPreset {
  if (id && CANVAS_PRESET_MAP.has(id)) {
    return CANVAS_PRESET_MAP.get(id)!;
  }
  return CANVAS_PRESET_MAP.get(DEFAULT_CANVAS_PRESET_ID)!;
}

export function parsePresetUrlOverride(search?: string): {
  preset: CanvasMechanismPreset;
  presetOverride: string | null;
} {
  const raw =
    search !== undefined
      ? search
      : typeof window !== "undefined" && typeof window.location?.search === "string"
        ? window.location.search
        : "";
  if (raw) {
    try {
      const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
      const id = params.get("preset")?.trim();
      if (id && CANVAS_PRESET_MAP.has(id)) {
        return { preset: CANVAS_PRESET_MAP.get(id)!, presetOverride: `url:?preset=${id}` };
      }
    } catch {
      /* ignore malformed query */
    }
  }
  return { preset: getCanvasPreset(DEFAULT_CANVAS_PRESET_ID), presetOverride: null };
}

export function parseReacquirePolicyUrlOverride(search?: string): {
  policy: ReacquirePinchPolicy;
  override: string | null;
} {
  const raw =
    search !== undefined
      ? search
      : typeof window !== "undefined" && typeof window.location?.search === "string"
        ? window.location.search
        : "";
  if (raw) {
    try {
      const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
      const val = params.get("reacquire")?.trim();
      if (val === "allow-after-confirm") {
        return { policy: "allow-after-confirm", override: "url:?reacquire=allow-after-confirm" };
      }
      if (val === "require-release") {
        return { policy: "require-release", override: "url:?reacquire=require-release" };
      }
    } catch {
      /* ignore malformed query */
    }
  }
  return { policy: "require-release", override: null };
}

export interface PresetRiskFlags {
  hasFistAndClosedPinch: boolean;
  hasThreeMrpAndOkPinch: boolean;
  hasOkPinchAndFiveErase: boolean;
  requiresStrictFive: boolean;
  requiresStrictPinchGate: boolean;
}

/** Reports which risky gesture pairs coexist in `preset` so strict gates stay enforced (B1.5, B1.7). */
export function inspectPresetRiskFlags(preset: CanvasMechanismPreset): PresetRiskFlags {
  const drawsClosed = preset.draw.includes("PINCH_CLOSED");
  const drawsOk = preset.draw.includes("PINCH_OK");
  const hasFistAndClosedPinch = drawsClosed && preset.undoRedo === "FIST_ONE_TWO";
  const hasThreeMrpAndOkPinch = drawsOk && preset.three?.variant === "MRP";
  const hasOkPinchAndFiveErase = drawsOk && preset.erase === "FIVE";
  return {
    hasFistAndClosedPinch,
    hasThreeMrpAndOkPinch,
    hasOkPinchAndFiveErase,
    requiresStrictFive: hasOkPinchAndFiveErase,
    requiresStrictPinchGate: hasFistAndClosedPinch || drawsClosed || hasThreeMrpAndOkPinch,
  };
}

/** Contract K4 v1.1 -> v1.0 backwards-compatible class projection. */
export function mapK4v11ToV10Class(cls: K4DerivedClass): "FIST" | "ONE" | "TWO" | "FIVE" | "PINCH" | "OTHER" {
  switch (cls) {
    case "FIST":
    case "ONE":
    case "TWO":
    case "FIVE":
      return cls;
    case "PINCH_CLOSED":
    case "PINCH_OK":
      return "PINCH";
    default:
      return "OTHER";
  }
}
