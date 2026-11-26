"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { env } from "@/src/config/env";
import type { HandDetector } from "../sources/hand-detector";
import type { TestSource } from "../sources/test-source";
import { NuiController, type NuiStatusSnapshot } from "./nui-controller";

const NuiContext = createContext<NuiController | null>(null);

export interface NuiProviderProps {
  children: ReactNode;
  /** Izinkan tombol H untuk mematikan/menyalakan simulasi mouse (dev saja). */
  devTools?: boolean;
  /** Pasang window.__skbNui (default aktif hanya saat NEXT_PUBLIC_TEST_HOOKS=1). */
  testHooks?: boolean;
  /** Sumber detektor tangan tunggal (opsional; bisa dipasang dinamis lewat setHandDetector). */
  handDetector?: HandDetector | null;
  /** Injeksi TestSource eksternal untuk tes unit. */
  testSource?: TestSource;
  initialCanvasMode?: boolean;
  autoSim?: boolean;
  clock?: () => number;
}

/**
 * Provider tunggal NUI r8.3:
 * - Satu loop rAF milik `NuiController`, idempoten di `reactStrictMode`.
 * - Nilai context 100% stabil -> NOL re-render React pada provider/children per frame gerak kursor.
 */
export function NuiProvider({
  children,
  devTools = false,
  testHooks = env.testHooksEnabled,
  handDetector = null,
  testSource,
  initialCanvasMode = false,
  autoSim = true,
  clock,
}: NuiProviderProps) {
  const controllerRef = useRef<NuiController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new NuiController({
      devTools,
      testHooks,
      initialCanvasMode,
      autoSim,
      testSource,
      clock,
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.start();
    return () => {
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    if (handDetector !== undefined) controller.setHandDetector(handDetector);
  }, [controller, handDetector]);

  return <NuiContext.Provider value={controller}>{children}</NuiContext.Provider>;
}

/** Deteksi opsional apakah sudah berada di dalam `<NuiProvider>` induk (tanpa throw). */
export function useOptionalNui(): NuiController | null {
  return useContext(NuiContext);
}

/** Akses controller stabil (tidak memicu re-render saat frame berjalan). */
export function useNui(): NuiController {
  const ctx = useContext(NuiContext);
  if (!ctx) throw new Error("useNui harus dipanggil di dalam <NuiProvider>.");
  return ctx;
}

/** Status kasar NUI (`activeSource`, `canvasMode`, `frozen`, `simOn`). Nol update per frame. */
export function useNuiStatus(): NuiStatusSnapshot {
  const controller = useNui();
  return useSyncExternalStore(controller.subscribeStatus, controller.getStatus, controller.getStatus);
}
