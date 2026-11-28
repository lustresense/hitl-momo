"use client";
import { useEffect, useRef } from "react";
import { useNuiStatus } from "@/src/nui/react";
import { audio } from "../index";
import { NuiBridge, observeNuiRings } from "./nui-bridge";

/** Mount once inside NuiProvider. Renders nothing. */
export function NuiAudioBridge(): null {
  const bridgeRef = useRef<NuiBridge | null>(null);
  const status = useNuiStatus();

  useEffect(() => {
    const bridge = new NuiBridge(
      { emit: (id, p) => audio.emit(id, p), loop: (id, p) => audio.loop(id, p) },
      { now: () => performance.now() },
    );
    bridgeRef.current = bridge;
    const root = document.querySelector<HTMLElement>('[data-ui="r83"]') ?? document.body;
    const off = observeNuiRings(root, bridge);
    return () => {
      off();
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, []);

  useEffect(() => {
    bridgeRef.current?.setFrozen(status.frozen && status.activeSource === "hand");
  }, [status.frozen, status.activeSource]);

  return null;
}
