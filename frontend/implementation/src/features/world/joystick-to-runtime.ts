import type { DirectionInput } from "@/src/game/runtime/types";

/** Ambang tanda axis agar micro-jitter di sekitar nol tidak menyalakan arah gerak kiri/kanan. */
export const JOYSTICK_DIRECTION_EPSILON = 0.01;
/** Durasi pulsa lompat joystick (ms) agar terbaca minimal 1 fixedStep KAPLAY (16.7–20 ms) lalu turun kembali. */
export const JUMP_PULSE_MS = 80;

export interface RuntimeDirectionTarget {
  setInput(input: DirectionInput): void;
}

export type BridgeKey = "left" | "right" | "jump";

export interface RuntimeInputBridge {
  setJoystickAxis(axis: number): void;
  triggerJump(): void;
  setKey(key: BridgeKey, down: boolean): void;
  setOverride(override: Partial<DirectionInput> | null): void;
  releaseKeys(): void;
  releaseAll(): void;
  getInput(): DirectionInput;
  dispose(): void;
}

export function clampJoystickAxis(axis: number): number {
  if (!Number.isFinite(axis)) return 0;
  const clamped = Math.max(-1, Math.min(1, axis));
  return clamped === 0 ? 0 : clamped;
}

/**
 * Jembatan murni NUI joystick -> KAPLAY DirectionInput (PLAN §5.3.6).
 * Mengisi `left`/`right` dari tanda `axis` (ambang 0.01) dan meneruskan `axis` (-1..1).
 */
export function joystickToDirectionInput(axis: number, jump: boolean): DirectionInput {
  const normalized = clampJoystickAxis(axis);
  return {
    left: normalized < -JOYSTICK_DIRECTION_EPSILON,
    right: normalized > JOYSTICK_DIRECTION_EPSILON,
    jump: Boolean(jump),
    axis: normalized,
  };
}

/** Menggabungkan input joystick (analog + tap/flick jump) dengan tombol panah keyboard ke `GameController.setInput`. */
export function createRuntimeInputBridge(
  target: RuntimeDirectionTarget | null,
  options: { jumpPulseMs?: number } = {},
): RuntimeInputBridge {
  const jumpPulseMs = options.jumpPulseMs ?? JUMP_PULSE_MS;
  let joyAxis = 0;
  let pulseJump = false;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  const keys = { left: false, right: false, jump: false };
  let override: Partial<DirectionInput> | null = null;
  let disposed = false;

  const clearPulseTimer = () => {
    if (pulseTimer !== null) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
  };

  const computeInput = (): DirectionInput => {
    const keyDir = Number(keys.right) - Number(keys.left);
    const overDir = override ? Number(Boolean(override.right)) - Number(Boolean(override.left)) : 0;
    const axis = overDir !== 0 ? overDir : keyDir !== 0 ? keyDir : joyAxis;
    const jump = Boolean(keys.jump || pulseJump || override?.jump);
    if (override && typeof override.axis === "number" && Number.isFinite(override.axis)) {
      return joystickToDirectionInput(override.axis, jump);
    }
    return joystickToDirectionInput(axis, jump);
  };

  const push = () => {
    if (disposed) return;
    target?.setInput(computeInput());
  };

  return {
    setJoystickAxis(axis) {
      joyAxis = clampJoystickAxis(axis);
      push();
    },
    triggerJump() {
      if (disposed) return;
      clearPulseTimer();
      pulseJump = true;
      push();
      pulseTimer = setTimeout(() => {
        pulseTimer = null;
        pulseJump = false;
        push();
      }, jumpPulseMs);
    },
    setKey(key, down) {
      keys[key] = down;
      push();
    },
    setOverride(next) {
      override = next;
      push();
    },
    releaseKeys() {
      keys.left = false;
      keys.right = false;
      keys.jump = false;
      push();
    },
    releaseAll() {
      clearPulseTimer();
      joyAxis = 0;
      pulseJump = false;
      keys.left = false;
      keys.right = false;
      keys.jump = false;
      override = null;
      push();
    },
    getInput: computeInput,
    dispose() {
      clearPulseTimer();
      pulseJump = false;
      joyAxis = 0;
      keys.left = false;
      keys.right = false;
      keys.jump = false;
      override = null;
      disposed = true;
    },
  };
}
