"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Joystick, JumpKind, Point } from "../core";
import { useNui } from "./NuiProvider";

export interface UseJoystickOptions {
  enabled?: boolean;
  onAxis?: (axis: number) => void;
  onJump?: (kind: JumpKind) => void;
  when?: () => boolean;
  ignore?: string;
  showOverlay?: boolean;
}

export interface UseJoystickHandle {
  dir(): number;
  active(): boolean;
  origin(): Point | null;
}

/**
 * Hook wrapper joystick aturan C di atas `NuiProvider` + `createJoystick`.
 * Nol React state per frame; overlay `.nui-joy` ditulis lewat DOM ref.
 */
export function useJoystick(options: UseJoystickOptions = {}): UseJoystickHandle {
  const controller = useNui();
  const { enabled = true, ignore, showOverlay = true } = options;

  const onAxisRef = useRef(options.onAxis);
  onAxisRef.current = options.onAxis;
  const onJumpRef = useRef(options.onJump);
  onJumpRef.current = options.onJump;
  const whenRef = useRef(options.when);
  whenRef.current = options.when;
  const joyRef = useRef<Joystick | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const joy = controller.joystick({
      ignore,
      showOverlay,
      when: () => (whenRef.current ? whenRef.current() : true),
      onAxis: (axis) => onAxisRef.current?.(axis),
      onJump: (kind) => onJumpRef.current?.(kind),
    });
    joyRef.current = joy;
    return () => {
      joy.destroy();
      if (joyRef.current === joy) joyRef.current = null;
    };
  }, [controller, enabled, ignore, showOverlay]);

  return useMemo<UseJoystickHandle>(
    () => ({
      dir: () => joyRef.current?.dir() ?? 0,
      active: () => joyRef.current?.active() ?? false,
      origin: () => joyRef.current?.origin() ?? null,
    }),
    [],
  );
}
