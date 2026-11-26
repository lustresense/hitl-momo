"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { COVER_GATE_COPY } from "@/src/domain/copy/cover";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { PipHand, useOptionalNui } from "@/src/nui";
import type { CoverCameraStatus, GateState } from "./cover-machine";
import "./cover-camera.css";

export interface CoverCameraDevice {
  readonly deviceId: string;
  readonly label?: string;
}

export interface CoverCameraCardProps {
  readonly cardRef: RefObject<HTMLDivElement>;
  readonly gateState: GateState;
  readonly cameraStatus: CoverCameraStatus;
  readonly cameraError?: string | null;
  readonly pipMode: boolean;
  readonly morphing: boolean;
  readonly nuiActive: boolean;
  readonly warming?: boolean;
  readonly fallbackMode?: boolean;
  readonly devTools?: boolean;
  readonly stream?: MediaStream | null;
  readonly devices?: readonly CoverCameraDevice[];
  readonly selectedDeviceId?: string;
  readonly onDeviceChange?: (deviceId: string) => void;
  readonly onToggleCamera: () => void;
  readonly cameraSlot?: ReactNode;
}

/**
 * Kartu kamera oranye sampul r8.3 -> PIP kiri-bawah (`proto-html/r83/index.html:452-459`).
 * Menyisipkan `PipHand` (`nui-pip-hand`) di dalam `.video-wrap` dan mendukung `cameraSlot`
 * untuk Integrator (`GlobalCamera`).
 */
export function CoverCameraCard({
  cardRef,
  gateState,
  cameraStatus,
  cameraError,
  pipMode,
  morphing,
  nuiActive,
  warming = false,
  fallbackMode = false,
  devTools = false,
  stream = null,
  devices = [],
  selectedDeviceId = "",
  onDeviceChange,
  onToggleCamera,
  cameraSlot,
}: CoverCameraCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const optionalNui = useOptionalNui();
  const hasStream = Boolean(stream);
  const isOn = cameraStatus === "requesting" || cameraStatus === "live";
  const locked = gateState < 2 && !pipMode;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    if (stream) {
      void Promise.resolve(video.play()).catch(() => undefined);
    } else {
      try {
        video.pause();
      } catch {
        /* ignore in jsdom */
      }
    }
  }, [stream]);

  if (cameraSlot) {
    return (
      <div
        ref={cardRef}
        id="camera"
        className={[
          "camera-widget-card",
          "toggle-card",
          locked ? "locked" : "",
          !locked && !isOn && !pipMode ? "nudge" : "",
          isOn ? "on" : "",
          hasStream ? "has-stream" : "",
          morphing ? "morphing" : "",
          pipMode ? "pip" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="r83-camera-card"
        aria-label={COVER_GATE_COPY.cameraCardAriaLabel}
      >
        {cameraSlot}
        {optionalNui && (pipMode || (nuiActive && !morphing)) ? <PipHand /> : null}
      </div>
    );
  }

  const isWarming = hasStream && (cameraStatus === "requesting" || warming);
  const previewText =
    cameraError ??
    (cameraStatus === "requesting"
      ? COVER_GATE_COPY.cameraOpeningLabel
      : cameraStatus === "live"
        ? COVER_GATE_COPY.cameraReadyLabel
        : COVER_GATE_COPY.cameraPreviewLabel);

  const showNudge = !fallbackMode && pipMode && cameraStatus === "idle";
  const classes = [
    "camera-widget-card",
    "toggle-card",
    locked ? "locked" : "",
    gateState >= 2 && !isOn && !pipMode && cameraStatus === "idle" ? "nudge" : "",
    isOn ? "on" : "",
    hasStream ? "has-stream" : "",
    morphing ? "morphing" : "",
    pipMode ? "pip" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        ref={cardRef}
        id="camera"
        className={classes}
        data-testid="r83-camera-card"
        aria-label={COVER_GATE_COPY.cameraCardAriaLabel}
      >
        <div className="video-wrap">
          {hasStream ? (
            <>
              <video
                ref={videoRef}
                id="camera-video"
                className="camera-video"
                autoPlay
                playsInline
                muted
                aria-label={COVER_GATE_COPY.cameraPreviewLabel}
              />
              {!pipMode ? <div className="camera-guide" aria-hidden="true" /> : null}
            </>
          ) : (
            <div id="camera-video" className="camera-video" aria-hidden="true">
              {devTools ? <span className="mock-legend">{COVER_GATE_COPY.cameraSimLegend}</span> : null}
            </div>
          )}
          <div className="video-inner">
            <OwnerIcon name="camera-off" size={38} />
            <span className="label">{previewText}</span>
          </div>
          {isWarming && !pipMode && !morphing ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="r83-camera-warming"
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6,
                padding: "5px 12px",
                borderRadius: 999,
                background: "rgba(17, 17, 17, 0.78)",
                color: "#fffaf0",
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              Memanaskan model NUI…
            </div>
          ) : null}
          <span className="rec-dot">{isWarming ? "WARMING" : hasStream ? "LIVE" : devTools ? "DEMO" : "REC"}</span>
          {optionalNui && (pipMode || (nuiActive && !morphing)) ? <PipHand /> : null}
        </div>

        <div className="toggle-row">
          <span className="cam-id">
            <span className="cam-badge" aria-hidden="true">
              <OwnerIcon name="camera" size={18} />
            </span>
            <span className="toggle-label">{COVER_GATE_COPY.cameraCardLabel}</span>
          </span>
          <button
            type="button"
            className="toggle-switch"
            id="cam-action"
            role="switch"
            data-nui-off="true"
            data-testid="r83-camera-toggle"
            aria-checked={isOn}
            aria-disabled={locked || undefined}
            aria-label={isOn ? COVER_GATE_COPY.toggleOffLabel : COVER_GATE_COPY.toggleOnLabel}
            title={locked ? COVER_GATE_COPY.toggleLockedTitle : COVER_GATE_COPY.toggleOnLabel}
            onClick={onToggleCamera}
          />
        </div>

        <div className="camera-select-wrap" data-nui-off="true">
          <select
            className="camera-select"
            id="camera-select"
            aria-label={COVER_GATE_COPY.cameraSelectAriaLabel}
            disabled={locked || devices.length === 0}
            value={selectedDeviceId}
            onChange={(e) => onDeviceChange?.(e.target.value)}
          >
            {devices.length > 0 ? (
              devices.map((dev, idx) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label || `${COVER_GATE_COPY.cameraSelectDefault} ${idx + 1}`}
                </option>
              ))
            ) : (
              <option value="">{COVER_GATE_COPY.cameraSelectDefault}</option>
            )}
          </select>
        </div>
      </div>

      <div
        id="cam-nudge"
        className={showNudge ? "show" : undefined}
        role="status"
        aria-live="polite"
        data-testid="r83-cam-nudge"
      >
        {COVER_GATE_COPY.cameraOffNudge}
      </div>
    </>
  );
}
