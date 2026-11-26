"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ENDING_COPY } from "@/src/domain/copy/ending";
import { NuiRing } from "@/src/nui";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface BackToCoverRingProps {
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
}

/**
 * Fase 5 (`akhir`): Ring `"Kembali ke sampul"` (aturan A, 2000 ms) di dalam bubble Momo (`end.js:176-180`).
 */
export function BackToCoverRing({ onConfirm, disabled = false }: BackToCoverRingProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  const handleConfirm = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onConfirm();
  }, [onConfirm]);

  useIsoLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el, { opacity: 0, y: 8, duration: 0.4 });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={hostRef} className="ending-finish" data-testid="r83-ending-finish">
      <NuiRing
        label={ENDING_COPY.akhir.backToCoverLabel}
        holdMs={ENDING_COPY.akhir.backToCoverHoldMs}
        mode="any"
        disabled={disabled}
        testId="r83-ending-back-to-cover"
        onFire={handleConfirm}
      />
    </div>
  );
}
