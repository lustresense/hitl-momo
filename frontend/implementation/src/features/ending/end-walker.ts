import { clamp } from "./end-camera";

/**
 * Walker Penutup + LUT tanah 1-unit r8.3 — port murni `end.js:21-30, 108-112` & `walker.js`.
 * Joystick hanya aktif pada fase `kolam`; di luar itu input manual diabaikan dan Thinman
 * hanya berjalan otomatis ke titik bicara (`TALK_SPOT_X = 300`).
 */

export const GROUND_LUT_MIN_X = -10;
export const GROUND_LUT_MAX_X = 500;
export const GROUND_LUT_Y_OFFSET = 4;

export const PARACHUTE_START_X = 160;
export const POND_X = 410;
export const POND_TRIGGER_OFFSET = 46;
export const POND_EXIT_X = POND_X - 90;
export const TALK_SPOT_X = 300;
export const TALK_ARRIVE_TOLERANCE = 3;
export const AUTO_WALK_STOP_TOLERANCE = 2;

export const WALKER_MANUAL_SPEED = 62;
export const WALKER_AUTO_SPEED = 150;
export const WALKER_DT_CAP_S = 0.05;
export const DEFAULT_WALKER_BOUNDS: readonly [number, number] = [20, 470];

interface QuadPoint {
  readonly x: number;
  readonly y: number;
}

function evalQuad(p0: QuadPoint, p1: QuadPoint, p2: QuadPoint, t: number): QuadPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/**
 * Kurva tanah `M-10 262Q120 236 245 250T500 246`:
 * - Segmen 1: (-10, 262) -> Q(120, 236) -> (245, 250)
 * - Segmen 2 (`T`): (245, 250) -> Q(370, 264) -> (500, 246)
 */
const SEG1: readonly [QuadPoint, QuadPoint, QuadPoint] = [
  { x: -10, y: 262 },
  { x: 120, y: 236 },
  { x: 245, y: 250 },
];
const SEG2: readonly [QuadPoint, QuadPoint, QuadPoint] = [
  { x: 245, y: 250 },
  { x: 370, y: 264 },
  { x: 500, y: 246 },
];

function exactGroundY(x: number): number {
  const [p0, p1, p2] = x <= 245 ? SEG1 : SEG2;
  let a = 0;
  let b = 1;
  for (let i = 0; i < 26; i++) {
    const m = (a + b) / 2;
    if (evalQuad(p0, p1, p2, m).x < x) a = m;
    else b = m;
  }
  return evalQuad(p0, p1, p2, a).y + GROUND_LUT_Y_OFFSET;
}

/** LUT 1-unit dari x=-10..500 (511 entri, identik `end.js:28`). */
export const GROUND_LUT: readonly number[] = (() => {
  const table: number[] = [];
  for (let x = GROUND_LUT_MIN_X; x <= GROUND_LUT_MAX_X; x++) {
    table.push(exactGroundY(x));
  }
  return table;
})();

/** Membaca tinggi tanah (satuan sumber) pada koordinat `x` lewat interpolasi linear LUT 1-unit. */
export function sampleGroundY(x: number): number {
  const u = clamp(x, GROUND_LUT_MIN_X, GROUND_LUT_MAX_X) - GROUND_LUT_MIN_X;
  const i = Math.min(GROUND_LUT.length - 2, Math.floor(u));
  const k = u - i;
  const y0 = GROUND_LUT[i] ?? 250;
  const y1 = GROUND_LUT[i + 1] ?? y0;
  return y0 + (y1 - y0) * k;
}

export function hasEnteredPond(x: number, pondX: number = POND_X): boolean {
  return x >= pondX - POND_TRIGGER_OFFSET;
}

export interface EndWalkerState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly on: boolean;
  readonly face: 1 | -1;
  readonly zone: readonly [number, number];
  readonly hold: boolean;
  readonly enabled: boolean;
  readonly autoTargetX: number | null;
}

export interface EndWalkerInput {
  /** Wajib true hanya di fase `kolam` (saat menunggu siswa antar Thinman). */
  readonly joystickAllowed: boolean;
  readonly padDir?: number;
  readonly left?: boolean;
  readonly right?: boolean;
}

export interface EndWalkerStepResult {
  readonly state: EndWalkerState;
  readonly enteredPond: boolean;
  readonly arrivedAuto: boolean;
}

export function createInitialWalkerState(
  startX: number = PARACHUTE_START_X,
  bounds: readonly [number, number] = DEFAULT_WALKER_BOUNDS,
): EndWalkerState {
  const clampedX = clamp(startX, bounds[0], bounds[1]);
  return {
    x: clampedX,
    y: sampleGroundY(clampedX),
    vx: 0,
    vy: 0,
    on: true,
    face: 1,
    zone: [bounds[0], bounds[1]],
    hold: false,
    enabled: true,
    autoTargetX: null,
  };
}

export function stepEndWalker(
  state: EndWalkerState,
  input: EndWalkerInput,
  dtRaw: number,
): EndWalkerStepResult {
  const dt = Math.min(WALKER_DT_CAP_S, Math.max(0, dtRaw));
  if (state.hold) {
    return {
      state,
      enteredPond: hasEnteredPond(state.x),
      arrivedAuto: false,
    };
  }

  let dir = 0;
  let speed = WALKER_MANUAL_SPEED;
  let nextAuto = state.autoTargetX;
  let arrivedAuto = false;

  if (nextAuto !== null) {
    const dist = nextAuto - state.x;
    if (Math.abs(dist) <= AUTO_WALK_STOP_TOLERANCE) {
      nextAuto = null;
      dir = 0;
      arrivedAuto = true;
    } else {
      dir = dist > 0 ? 1 : -1;
      speed = WALKER_AUTO_SPEED;
      const maxStep = speed * dt;
      if (Math.abs(dist) <= maxStep) {
        const clampedTarget = clamp(nextAuto, state.zone[0], state.zone[1]);
        return {
          state: {
            ...state,
            x: clampedTarget,
            y: sampleGroundY(clampedTarget),
            vx: 0,
            vy: 0,
            on: true,
            face: dir > 0 ? 1 : -1,
            autoTargetX: null,
          },
          enteredPond: hasEnteredPond(clampedTarget),
          arrivedAuto: true,
        };
      }
    }
  } else if (input.joystickAllowed && state.enabled) {
    const keyDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (keyDir !== 0) {
      dir = keyDir;
    } else {
      const pad = input.padDir ?? 0;
      dir = Number.isFinite(pad) ? clamp(pad, -1, 1) : 0;
    }
  }

  const vx = dir * speed;
  const face: 1 | -1 = dir !== 0 ? (dir > 0 ? 1 : -1) : state.face;
  const nextX = clamp(state.x + vx * dt, state.zone[0], state.zone[1]);
  const nextY = sampleGroundY(nextX);

  return {
    state: {
      ...state,
      x: nextX,
      y: nextY,
      vx,
      vy: 0,
      on: true,
      face,
      autoTargetX: nextAuto,
    },
    enteredPond: hasEnteredPond(nextX),
    arrivedAuto,
  };
}

export interface SafeZoneInput {
  readonly bubbleLeftPx: number | null;
  readonly bubbleWidthPx: number;
  readonly heroWidthPx: number;
  readonly viewportW: number;
  readonly pxToUnits: (px: number) => number;
}

/** Port `zoneNow()` (`end.js:108-112`): menjaga Thinman tidak tertutup bubble Momo. */
export function computeSafeTalkZone({
  bubbleLeftPx,
  bubbleWidthPx,
  heroWidthPx,
  viewportW,
  pxToUnits,
}: SafeZoneInput): readonly [number, number] {
  const half = heroWidthPx / 2;
  const hiPx = (bubbleWidthPx > 0 && bubbleLeftPx !== null ? bubbleLeftPx - 30 : viewportW - 40) - half;
  const a = clamp(Math.max(8, pxToUnits(24 + half)), 8, 470);
  const z = clamp(Math.max(a + 30, pxToUnits(hiPx)), 40, 470);
  return [a, Math.max(a, z)];
}
