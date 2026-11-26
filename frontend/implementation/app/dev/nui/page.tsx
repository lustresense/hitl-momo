"use client";

import { devTools } from "@/src/config/env";
import { NUI_DEV_COPY } from "@/src/domain/copy";
import { PaperOverlay } from "@/src/features/shared";
import { NuiHarness } from "@/src/nui/dev";

/**
 * Static-export harness route (`/dev/nui`) for G2 webcam verification (PLAN §5.2, Lampiran D).
 * Renders only "tidak tersedia" unless `NEXT_PUBLIC_DEV_TOOLS=1|true`.
 */
export default function DevNuiPage() {
  if (!devTools()) {
    return <p>{NUI_DEV_COPY.harnessUnavailable}</p>;
  }

  return (
    <div
      data-ui="r83"
      data-variant="page"
      data-testid="r83-dev-nui-root"
      style={{ minHeight: "100vh", height: "auto", overflow: "visible" }}
    >
      <PaperOverlay />
      <NuiHarness />
    </div>
  );
}
