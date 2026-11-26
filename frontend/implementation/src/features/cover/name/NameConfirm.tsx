"use client";

import type { RefObject } from "react";
import { COVER_NAME_COPY } from "@/src/domain/copy/cover";
import { NuiRing } from "@/src/nui";
import { HOLD_MS_DECISION, HOLD_MS_DEFAULT } from "@/src/nui/core/constants";

export interface NameConfirmProps {
  readonly studentName: string;
  readonly exiting: boolean;
  readonly cardRef: RefObject<HTMLDivElement>;
  readonly onRetry: () => void;
  readonly onConfirm: () => void;
}

/**
 * Konfirmasi nama aturan B (`proto-html/r83/index.html:516, 1134-1144`):
 * - Kiri: "Ulangi" (1000 ms)
 * - Kanan: "Ya, itu namaku" (2000 ms)
 * Setelah terkonfirmasi (`exiting = true`), Momo menyapa `"Senang kenalan sama kamu, ${nm}!"`
 * dan seluruh layar nama dianimasikan GSAP keluar ke atas sebelum handoff.
 */
export function NameConfirm({ studentName, exiting, cardRef, onRetry, onConfirm }: NameConfirmProps) {
  return (
    <div
      ref={cardRef}
      id="name-card"
      className="name-card ready got"
      aria-live="polite"
      data-testid="r83-name-confirm-card"
    >
      <div id="name-heard" data-testid="r83-name-heard">
        {studentName}
      </div>

      <div id="name-confirm" className="name-confirm on" data-testid="r83-name-confirm">
        <div id="name-again">
          <NuiRing
            label={COVER_NAME_COPY.againLabel}
            holdMs={HOLD_MS_DEFAULT}
            mode="any"
            icon="gesture-pinch"
            disabled={exiting}
            onFire={onRetry}
            testId="r83-name-again"
          />
        </div>
        <div id="name-yes" className={exiting ? "is-confirmed" : undefined}>
          <NuiRing
            label={COVER_NAME_COPY.yesLabel}
            holdMs={HOLD_MS_DECISION}
            mode="any"
            icon="gesture-pinch"
            disabled={exiting}
            onFire={onConfirm}
            testId="r83-name-yes"
          />
        </div>
      </div>

      <p id="name-note" className="name-note" data-testid="r83-name-note" />
    </div>
  );
}
