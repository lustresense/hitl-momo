"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { RuleKind, TargetMode } from "../core/types";
import { useNui } from "./NuiProvider";
import type { DomTargetHandle, TargetCoarseState } from "./nui-controller";

export interface UseNuiTargetOptions {
  id?: string;
  label: string;
  holdMs?: number;
  mode?: TargetMode;
  onFire?: () => void;
  disabled?: boolean;
  fillRef?: RefObject<SVGCircleElement | null>;
  badge?: boolean;
  group?: string;
  /** Izinkan klik mouse langsung ketika tidak ada detektor tangan aktif. */
  allowClickWhenNoHand?: boolean;
  /** Set false bila komponen hanya butuh kelas DOM (`nui-lit`, `nui-holding`) tanpa state React. */
  trackState?: boolean;
}

export interface UseNuiTargetResult extends TargetCoarseState {
  reset: () => void;
}

/**
 * Mendaftarkan elemen DOM ke `NuiEngine`. Progres ring (`strokeDashoffset`, `aria-valuenow`)
 * ditulis langsung ke DOM ref pada loop rAF — NOL React state per frame.
 */
export function useNuiTarget<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseNuiTargetOptions,
): UseNuiTargetResult {
  const controller = useNui();
  const { id, label, holdMs, mode = "any", onFire, disabled = false, fillRef, badge, group, allowClickWhenNoHand = false, trackState = true } = options;

  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;
  const handleRef = useRef<DomTargetHandle | null>(null);

  const [coarse, setCoarse] = useState<TargetCoarseState>(() => ({
    lit: false,
    holding: false,
    kind: mode === "point" ? "D" : "A",
    done: false,
  }));

  useEffect(() => {
    const el = ref.current;
    if (disabled || !el) return;
    const handle = controller.register(el, {
      id,
      label,
      holdMs,
      mode,
      fillEl: fillRef?.current ?? undefined,
      badge,
      group,
      allowClickWhenNoHand,
      onFire: () => onFireRef.current?.(),
      onCoarseChange: trackState
        ? (next) => {
            setCoarse((prev) =>
              prev.lit === next.lit &&
              prev.holding === next.holding &&
              prev.kind === next.kind &&
              prev.done === next.done
                ? prev
                : next,
            );
          }
        : undefined,
    });
    handleRef.current = handle;
    return () => {
      handle.remove();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [controller, ref, fillRef, id, label, holdMs, mode, disabled, badge, group, allowClickWhenNoHand, trackState]);

  const reset = useCallback(() => {
    handleRef.current?.reset();
    if (trackState) {
      setCoarse((prev) => (prev.done ? { ...prev, done: false } : prev));
    }
  }, [trackState]);

  return {
    lit: coarse.lit,
    holding: coarse.holding,
    kind: coarse.kind as RuleKind,
    done: coarse.done,
    reset,
  };
}
