import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JOYSTICK_DIRECTION_EPSILON,
  JUMP_PULSE_MS,
  clampJoystickAxis,
  createRuntimeInputBridge,
  joystickToDirectionInput,
} from "@/src/features/world/joystick-to-runtime";
import type { DirectionInput } from "@/src/game/runtime/types";

describe("joystick-to-runtime (pure, no DOM)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps analog axis and jump into DirectionInput with left/right sign booleans", () => {
    expect(JOYSTICK_DIRECTION_EPSILON).toBe(0.01);
    expect(joystickToDirectionInput(0, false)).toEqual({ left: false, right: false, jump: false, axis: 0 });
    expect(joystickToDirectionInput(0.01, false)).toEqual({ left: false, right: false, jump: false, axis: 0.01 });
    expect(joystickToDirectionInput(-0.01, false)).toEqual({ left: false, right: false, jump: false, axis: -0.01 });
    expect(joystickToDirectionInput(0.35, false)).toEqual({ left: false, right: true, jump: false, axis: 0.35 });
    expect(joystickToDirectionInput(-0.68, true)).toEqual({ left: true, right: false, jump: true, axis: -0.68 });
    expect(joystickToDirectionInput(2.5, false)).toEqual({ left: false, right: true, jump: false, axis: 1 });
    expect(joystickToDirectionInput(-3, true)).toEqual({ left: true, right: false, jump: true, axis: -1 });
  });

  it("clamps non-finite axis values safely to 0", () => {
    expect(clampJoystickAxis(Number.NaN)).toBe(0);
    expect(clampJoystickAxis(Number.POSITIVE_INFINITY)).toBe(0);
    expect(Object.is(clampJoystickAxis(-0), 0)).toBe(true);
  });

  it("bridges joystick axis, jump pulse, and keyboard arrow keys to runtime target", () => {
    vi.useFakeTimers();
    const sent: DirectionInput[] = [];
    const target = { setInput: (i: DirectionInput) => sent.push(i) };
    const bridge = createRuntimeInputBridge(target);

    bridge.setJoystickAxis(0.42);
    expect(sent.at(-1)).toEqual({ left: false, right: true, jump: false, axis: 0.42 });

    // Keyboard arrow overrides joystick axis while held, then restores joystick axis on release
    bridge.setKey("left", true);
    expect(sent.at(-1)).toEqual({ left: true, right: false, jump: false, axis: -1 });
    bridge.setKey("left", false);
    expect(sent.at(-1)).toEqual({ left: false, right: true, jump: false, axis: 0.42 });

    // Tap / flick jump pulses jump: true and resets after JUMP_PULSE_MS
    bridge.triggerJump();
    expect(sent.at(-1)).toEqual({ left: false, right: true, jump: true, axis: 0.42 });
    vi.advanceTimersByTime(JUMP_PULSE_MS - 1);
    expect(sent.at(-1)?.jump).toBe(true);
    vi.advanceTimersByTime(1);
    expect(sent.at(-1)).toEqual({ left: false, right: true, jump: false, axis: 0.42 });

    bridge.dispose();
  });

  it("resets all directional state cleanly on releaseAll and dispose", () => {
    const sent: DirectionInput[] = [];
    const bridge = createRuntimeInputBridge({ setInput: (i) => sent.push(i) });

    bridge.setJoystickAxis(-0.8);
    bridge.setKey("right", true);
    bridge.setKey("jump", true);
    bridge.releaseAll();

    expect(sent.at(-1)).toEqual({ left: false, right: false, jump: false, axis: 0 });
    bridge.dispose();
  });
});
