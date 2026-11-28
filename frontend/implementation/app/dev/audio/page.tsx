"use client";

import { devTools } from "@/src/config/env";
import { NUI_DEV_COPY } from "@/src/domain/copy";
import { AudioLab } from "@/src/audio/lab/AudioLab";

/**
 * Developer Audio Lab (`/dev/audio`). Renders only "tidak tersedia" unless `NEXT_PUBLIC_DEV_TOOLS=1|true`
 * (same gate as `/dev/nui`; static export cannot hide the route itself, only its content).
 */
export default function DevAudioPage() {
  if (!devTools()) return <p>{NUI_DEV_COPY.harnessUnavailable}</p>;
  return <AudioLab />;
}
