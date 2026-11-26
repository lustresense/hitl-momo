"use client";

import type { RefObject } from "react";
import { COVER_INTRO_COPY } from "@/src/domain/copy/cover";
import { NuiRing, type NuiRingHandle } from "@/src/nui";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";

export interface AyoRingProps {
  readonly visible: boolean;
  readonly onConfirm: () => void;
  readonly ringRef?: RefObject<NuiRingHandle>;
  readonly hostRef?: RefObject<HTMLDivElement>;
}

/**
 * Cincin "Ayo!" aturan A (`proto-html/r83/index.html:507, 890-898`).
 * Satu pilihan: cubit dan tahan di mana saja (non-chrome) selama 1000 ms.
 */
export function AyoRing({ visible, onConfirm, ringRef, hostRef }: AyoRingProps) {
  return (
    <div
      ref={hostRef}
      id="confirm"
      className={visible ? "is-visible" : undefined}
      style={{ display: visible ? "flex" : "none" }}
      data-testid="r83-ayo-host"
    >
      {visible ? (
        <NuiRing
          ref={ringRef}
          label={COVER_INTRO_COPY.ayoLabel}
          holdMs={HOLD_MS_DEFAULT}
          mode="any"
          icon="gesture-pinch"
          onFire={onConfirm}
          testId="r83-ayo-ring"
        />
      ) : null}
    </div>
  );
}
