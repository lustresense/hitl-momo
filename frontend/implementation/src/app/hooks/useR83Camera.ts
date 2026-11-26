"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classifyCameraError, messageFor } from "@/src/camera/messages";
import { getSharedStream, setSharedStream } from "@/src/camera/shared-stream";
import { startLabCamera } from "@/src/components/nui-lab/lab-camera";
import type { CoverCameraDevice, CoverScreenCameraState } from "@/src/features/cover";

const CAMERA_WANTED_KEY = "r83_cam_wanted";

/**
 * Reads the non-PII session flag indicating whether the user intentionally turned the camera ON.
 */
export function readSavedCameraIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(CAMERA_WANTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSavedCameraIntent(wanted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (wanted) window.sessionStorage.setItem(CAMERA_WANTED_KEY, "1");
    else window.sessionStorage.removeItem(CAMERA_WANTED_KEY);
  } catch {
    /* ignore storage errors */
  }
}

export interface R83CameraHandle {
  readonly cameraActive: boolean;
  readonly cameraState: CoverScreenCameraState;
  readonly onCameraToggle: (nextOn: boolean, deviceId?: string) => Promise<boolean>;
  readonly onCameraDeviceChange: (deviceId: string) => void;
  readonly stopCamera: () => void;
}

async function listVideoInputs(): Promise<CoverCameraDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list
      .filter((d) => d.kind === "videoinput")
      .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${idx + 1}` }));
  } catch {
    return [];
  }
}

function stopStreamTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Coordinates the single shared MediaStream across CoverScreen and persistent #cam-pip (O-11).
 * Never prompts for camera permission outside explicit user consent / toggle.
 */
export function useR83Camera(): R83CameraHandle {
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [devices, setDevices] = useState<CoverCameraDevice[]>([]);
  const [cameraState, setCameraState] = useState<CoverScreenCameraState>(() => {
    const existing = typeof window !== "undefined" ? getSharedStream() : null;
    const live = Boolean(existing?.getVideoTracks().some((t) => t.readyState === "live"));
    return {
      status: live ? "live" : "idle",
      error: null,
      stream: live ? existing : null,
      devices: [],
      selectedDeviceId: "",
    };
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (streamRef.current) {
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
        setSharedStream(null);
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    writeSavedCameraIntent(false);
    const cur = streamRef.current ?? getSharedStream();
    stopStreamTracks(cur);
    streamRef.current = null;
    setSharedStream(null);
    if (!mountedRef.current) return;
    setCameraState((prev) => ({ ...prev, status: "idle", error: null, stream: null }));
  }, []);

  const startCamera = useCallback(async (devId = ""): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current) {
        setCameraState((prev) => ({
          ...prev,
          status: "unavailable",
          error: "Kamera tidak didukung di browser ini.",
          stream: null,
        }));
      }
      return false;
    }

    if (mountedRef.current) {
      setCameraState((prev) => ({ ...prev, status: "requesting", error: null }));
    }

    try {
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      const result = await startLabCamera(navigator.mediaDevices, {
        deviceId: devId || undefined,
        normalAutoExposure: true,
      });
      if (!mountedRef.current) {
        if (result.kind === "ok") stopStreamTracks(result.stream);
        return false;
      }
      if (result.kind === "error") {
        setSharedStream(null);
        const denied = result.message === messageFor("permission-denied");
        setCameraState((prev) => ({
          ...prev,
          status: denied ? "denied" : "unavailable",
          error: result.message,
          stream: null,
        }));
        return false;
      }
      const stream = result.stream;
      streamRef.current = stream;
      setSharedStream(stream);
      const trackDevId =
        result.selectedDeviceId ?? stream.getVideoTracks()[0]?.getSettings?.().deviceId ?? devId;
      if (trackDevId) setSelectedDeviceId(trackDevId);
      setCameraState((prev) => ({
        status: "live",
        error: null,
        stream,
        devices: prev.devices,
        selectedDeviceId: trackDevId || devId,
      }));
      writeSavedCameraIntent(true);
      void listVideoInputs().then((nextDevices) => {
        if (!mountedRef.current) return;
        setDevices(nextDevices);
        setCameraState((prev) => ({ ...prev, devices: nextDevices }));
      });
      return true;
    } catch (err: unknown) {
      setSharedStream(null);
      const reason = classifyCameraError(err);
      const msg = messageFor(reason);
      if (mountedRef.current) {
        setCameraState((prev) => ({
          ...prev,
          status: reason === "permission-denied" ? "denied" : "unavailable",
          error: msg,
          stream: null,
        }));
      }
      return false;
    }
  }, []);

  const onCameraToggle = useCallback(
    async (nextOn: boolean, deviceId?: string): Promise<boolean> => {
      if (!nextOn) {
        stopCamera();
        return false;
      }
      return startCamera(deviceId ?? selectedDeviceId);
    },
    [selectedDeviceId, startCamera, stopCamera],
  );

  const onCameraDeviceChange = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      setCameraState((prev) => ({ ...prev, selectedDeviceId: deviceId }));
      if (cameraState.status === "live") {
        void startCamera(deviceId);
      }
    },
    [cameraState.status, startCamera],
  );

  return {
    cameraActive: cameraState.status === "live",
    cameraState: { ...cameraState, devices, selectedDeviceId },
    onCameraToggle,
    onCameraDeviceChange,
    stopCamera,
  };
}
