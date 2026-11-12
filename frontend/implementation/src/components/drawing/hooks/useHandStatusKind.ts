/**
 * The drawing surface's hand status ("ready", "drawing", "tracking-lost", ...) as the window publishes it.
 * Read-only: it never starts a tracker. `null` until the first report.
 */
import { useEffect, useState } from "react";
import { HAND_STATUS_EVENT } from "@/src/camera/messages";
import type { HandInputStatus } from "@/src/input/types";

export function useHandStatusKind(): HandInputStatus["kind"] | null {
  const [kind, setKind] = useState<HandInputStatus["kind"] | null>(null);
  useEffect(() => {
    const onStatus = (event: Event) => {
      const status = (event as CustomEvent<HandInputStatus | undefined>).detail;
      if (status) setKind(status.kind);
    };
    window.addEventListener(HAND_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(HAND_STATUS_EVENT, onStatus);
  }, []);
  return kind;
}
