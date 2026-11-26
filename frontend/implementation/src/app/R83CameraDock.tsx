"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { getSharedStream, subscribeSharedStream } from "@/src/camera/shared-stream";
import { PipHand, useNui } from "@/src/nui/react";
import { MonuiHandDetector, type MonuiTelemetry } from "./monui-hand-detector";

export type MonuiDetectorState = "idle" | "starting" | "ready" | "error";

export interface R83CameraDockProps {
  /** True while user has camera enabled (attaches single HandLandmarker O-11). */
  readonly active: boolean;
  /** False on Cover where CoverCameraCard owns visible video; true on subsequent screens. */
  readonly showPip: boolean;
  /** Reports MonuiHandDetector lifecycle changes without re-creating the detector. */
  readonly onDetectorState?: (state: MonuiDetectorState) => void;
  /** Real interactive camera toggle bound to the switch on #cam-pip. */
  readonly onToggleCamera?: (nextOn: boolean) => Promise<boolean> | void;
}

const CLEAR_ON_IDLE_ATTRS = ["data-monui-rescue", "data-monui-pass"] as const;

const CAPTURE_VIDEO_STYLE: CSSProperties = {
  position: "fixed",
  left: -9999,
  top: -9999,
  width: 4,
  height: 4,
  opacity: 0.001,
  pointerEvents: "none",
};

const PIP_VIDEO_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  transform: "scaleX(-1)",
  borderRadius: "10px",
  display: "block",
};

function resetIdleMonuiAttributes(el: HTMLDivElement | null): void {
  if (!el) return;
  el.setAttribute("data-monui-mode", "idle");
  for (const attr of CLEAR_ON_IDLE_ATTRS) el.removeAttribute(attr);
}

/**
 * Persistent single-landmarker hand detector (O-11) and bottom-left #cam-pip overlay across routes.
 * Uses a dedicated off-screen capture `<video>` so Cover's `display: none` PIP never suspends decoding,
 * and mirrors `getSharedStream()` directly onto `#cam-pip > video` when visible.
 */
export function R83CameraDock({ active, showPip, onDetectorState, onToggleCamera }: R83CameraDockProps) {
  const nui = useNui();
  const pipRef = useRef<HTMLDivElement | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectorStateRef = useRef(onDetectorState);
  onDetectorStateRef.current = onDetectorState;

  useEffect(() => {
    const pipEl = pipRef.current;
    if (!active) {
      nui.setHandDetector(null);
      nui.setDetectorState("idle");
      resetIdleMonuiAttributes(pipEl);
      onDetectorStateRef.current?.("idle");
      return;
    }

    let cancelled = false;
    let prevMode = "";
    let prevRescue = "";
    let prevPass = "";

    const handleTelemetry = (t: MonuiTelemetry): void => {
      if (!pipEl || cancelled) return;
      if (t.mode !== prevMode) {
        prevMode = t.mode;
        pipEl.setAttribute("data-monui-mode", t.mode);
      }
      if (t.rescueState !== prevRescue) {
        prevRescue = t.rescueState;
        pipEl.setAttribute("data-monui-rescue", t.rescueState);
      }
      if (t.preprocessPass !== prevPass) {
        prevPass = t.preprocessPass;
        pipEl.setAttribute("data-monui-pass", t.preprocessPass);
      }
    };

    const detector = new MonuiHandDetector({
      getVideo: () => captureVideoRef.current,
      yoloEnabled: process.env.NEXT_PUBLIC_MONUI_YOLO === "1",
      onTelemetry: handleTelemetry,
      onStatus: (s) => {
        if (!cancelled) {
          onDetectorStateRef.current?.(s.state);
          nui.setDetectorState(s.state);
        }
        if (s.state === "error") {
          nui.setHandDetector(null);
        }
      },
    });
    // Defer attach by a microtask so NuiProvider's mount-time default `handDetector=null` sync
    // does not clobber an initially-active dock, and React StrictMode cleanup cancels cleanly.
    queueMicrotask(() => {
      if (!cancelled) nui.setHandDetector(detector);
    });
    return () => {
      cancelled = true;
      nui.setHandDetector(null);
      nui.setDetectorState("idle");
      detector.stop();
      resetIdleMonuiAttributes(pipEl);
      onDetectorStateRef.current?.("idle");
    };
  }, [active, nui]);

  useEffect(() => {
    const video = pipVideoRef.current;
    if (!video) return;
    if (!active || !showPip) {
      try {
        video.pause();
      } catch {
        /* ignore in jsdom */
      }
      if (video.srcObject !== null) video.srcObject = null;
      return;
    }
    const syncStream = (stream: MediaStream | null): void => {
      if (video.srcObject !== stream) video.srcObject = stream;
      if (stream) {
        void Promise.resolve(video.play()).catch(() => undefined);
      }
    };
    syncStream(getSharedStream());
    return subscribeSharedStream(syncStream);
  }, [active, showPip]);

  const pipClass = `r83-cam-pip${active ? " has-video is-live" : ""}`;

  return (
    <>
      <video
        ref={captureVideoRef}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        style={CAPTURE_VIDEO_STYLE}
      />
      <div
        ref={pipRef}
        id="cam-pip"
        className={pipClass}
        data-testid="r83-cam-pip"
        aria-hidden={showPip ? undefined : true}
        style={{
          display: showPip ? undefined : "none",
          overflow: "hidden",
        }}
      >
        <video
          ref={pipVideoRef}
          muted
          playsInline
          autoPlay
          aria-hidden="true"
          style={{ ...PIP_VIDEO_STYLE, opacity: active ? 1 : 0 }}
        />
        {showPip ? (
          <button
            type="button"
            className={`r83-pip-toggle${active ? " is-on" : ""}`}
            data-testid="r83-pip-toggle"
            data-nui-off="true"
            aria-pressed={active}
            aria-label={active ? "Matikan kamera" : "Nyalakan kamera"}
            onClick={() => {
              void onToggleCamera?.(!active);
            }}
          />
        ) : null}
        {showPip ? <PipHand /> : null}
      </div>
    </>
  );
}
