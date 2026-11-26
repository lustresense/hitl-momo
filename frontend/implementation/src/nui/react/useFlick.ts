"use client";

import { useEffect, useRef } from "react";
import { useNui } from "./NuiProvider";

export interface UseFlickOptions {
  enabled?: boolean;
  ignore?: string;
  when?: () => boolean;
}

/** Hook wrapper sentil ke atas (stiker Lempar, ambang 50 px / 160 ms). */
export function useFlick(onFlick: () => void, options: UseFlickOptions = {}): void {
  const controller = useNui();
  const { enabled = true, ignore } = options;

  const cbRef = useRef(onFlick);
  cbRef.current = onFlick;
  const whenRef = useRef(options.when);
  whenRef.current = options.when;

  useEffect(() => {
    if (!enabled) return;
    return controller.flick(() => cbRef.current(), {
      ignore,
      when: () => (whenRef.current ? whenRef.current() : true),
    });
  }, [controller, enabled, ignore]);
}
