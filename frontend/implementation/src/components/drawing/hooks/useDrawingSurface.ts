/**
 * Owns the DrawingSurface bound to the drawing canvas: creation/disposal, resize handling, the
 * selected input mode (pointer vs camera hand), the "has ink" flag that enables submitting and
 * the hand pose the finish ring reads (so the screen runs only one hand tracker).
 */
import { useEffect, useState, type RefObject } from "react";
import { DrawingSurface } from "@/src/input";
import type { InputModeId } from "@/src/input/types";
import type { HandPose } from "@/src/input/hand-gesture";
import { createGestureCommander } from "../gesture-commands";

interface UseDrawingSurfaceOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
  /** Receives the live surface so the app shell can read the drawing on submit. */
  surfaceOut: { current: DrawingSurface | null };
  initialMode: InputModeId;
  active: boolean;
}

export function useDrawingSurface({ canvasRef, surfaceOut, initialMode, active }: UseDrawingSurfaceOptions) {
  const [inputMode, setInputMode] = useState<InputModeId>(initialMode);
  const [hasInk, setHasInk] = useState(false);
  const [handPose, setHandPose] = useState<HandPose>("none");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const video = document.querySelector<HTMLVideoElement>(".global-camera-host .camera-video");

    // The hand reports a pose every frame: state changes only when the pose does, so no re-render per frame.
    let lastPose: HandPose = "none";
    const setPose = (pose: HandPose) => {
      if (pose === lastPose) return;
      lastPose = pose;
      setHandPose(pose);
    };

    // R12: dua jari = Mundur, telapak terbelah = Maju, each once per held pose. Kepal (Hapus tool) erases inside DrawingSurface itself.
    const commander = createGestureCommander();
    const surface: DrawingSurface = new DrawingSurface(canvas, video, {
      initialMode,
      onInkChange: setHasInk,
      onStatusChange: (status) => {
        // Tracking stopped or lost: a pose seen earlier is no longer true, so a held thumb cannot confirm later.
        if (status.kind !== "ready" && status.kind !== "drawing") setPose("none");
      },
      onPose: (pose, nowMs) => {
        setPose(pose);
        const action = commander.feed(pose, nowMs);
        if (action === "undo") surface.undo();
        else if (action === "redo") surface.redo();
      },
    });
    surfaceOut.current = surface;

    if (process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
      const existing = window.__skbTestHooks ?? {};
      window.__skbTestHooks = { ...existing, surface };
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => surface.resizeForDpr());
      resizeObserver.observe(canvas);
    }
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => surface.resizeForDpr());
    }

    return () => {
      resizeObserver?.disconnect();
      if (process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
        delete window.__skbTestHooks;
      }
      surface.dispose();
      surfaceOut.current = null;
    };
  }, [canvasRef, initialMode, surfaceOut]);

  async function switchMode(next: InputModeId) {
    const surface = surfaceOut.current;
    if (!surface) return;
    setInputMode(next);
    await surface.setMode(next);
  }

  // Other parts of the app can switch the drawing input mode with a window event.
  useEffect(() => {
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<InputModeId>).detail;
      if (active && (next === "pointer" || next === "hand")) {
        setInputMode(next);
        void surfaceOut.current?.setMode(next);
      }
    };
    window.addEventListener("drawing-input-mode", onMode);
    return () => window.removeEventListener("drawing-input-mode", onMode);
  }, [surfaceOut, active]);

  // While the Top-3 popup is up the student cannot draw: fall back to the pointer.
  useEffect(() => {
    if (!active) void surfaceOut.current?.setMode("pointer");
  }, [active, surfaceOut]);

  return { inputMode, hasInk, handPose, switchMode };
}
