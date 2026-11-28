"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "@/src/audio";
import { classifyCameraError, messageFor } from "@/src/camera/messages";
import type { CoverCameraDevice } from "./CoverCameraCard";
import type { CoverAction, CoverCameraStatus, CoverPhase, GateState } from "./cover-machine";

export interface CoverScreenCameraState {
  readonly status: CoverCameraStatus;
  readonly error?: string | null;
  readonly stream?: MediaStream | null;
  readonly devices?: readonly CoverCameraDevice[];
  readonly selectedDeviceId?: string;
}

export interface UseCoverCameraOptions {
  readonly phase: CoverPhase;
  readonly gateState: GateState;
  readonly pipMode: boolean;
  readonly cameraStatus?: CoverCameraStatus;
  readonly dispatch: (action: CoverAction) => void;
  readonly cameraState?: CoverScreenCameraState;
  readonly onCameraToggle?: (
    nextOn: boolean,
    deviceId?: string,
  ) => Promise<boolean | CoverCameraStatus | void> | boolean | CoverCameraStatus | void;
  readonly onCameraDeviceChange?: (deviceId: string) => void;
}

export function useCoverCamera({
  phase,
  gateState,
  pipMode,
  cameraStatus,
  dispatch,
  cameraState,
  onCameraToggle,
  onCameraDeviceChange,
}: UseCoverCameraOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CoverCameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const reqTokenRef = useRef(0);
  const prevControlledStatusRef = useRef<CoverCameraStatus | undefined>(undefined);

  const stopLocalStream = useCallback(() => {
    reqTokenRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
  }, []);

  useEffect(() => () => stopLocalStream(), [stopLocalStream]);

  useEffect(() => {
    if (!cameraState) return;
    if (cameraState.status === prevControlledStatusRef.current) return;
    prevControlledStatusRef.current = cameraState.status;
    if (cameraState.status === "idle") dispatch({ type: "CAMERA_STOPPED" });
    else if (cameraState.status === "requesting") dispatch({ type: "CAMERA_REQUEST" });
    else if (cameraState.status === "live") dispatch({ type: "CAMERA_READY" });
    else if (cameraState.status === "denied") dispatch({ type: "CAMERA_DENIED", error: cameraState.error ?? undefined });
    else if (cameraState.status === "unavailable") dispatch({ type: "CAMERA_UNAVAILABLE", error: cameraState.error ?? undefined });
  }, [cameraState, dispatch]);

  const startStandaloneCamera = useCallback(
    async (devId = "") => {
      stopLocalStream();
      const token = reqTokenRef.current;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        dispatch({ type: "CAMERA_UNAVAILABLE", error: messageFor("unsupported") });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: devId ? { deviceId: { exact: devId } } : { facingMode: "user", aspectRatio: { ideal: 5 / 4 } },
          audio: false,
        });
        if (token !== reqTokenRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setLocalStream(stream);
        if (navigator.mediaDevices.enumerateDevices) {
          try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const cams = all.filter((d) => d.kind === "videoinput").map((d) => ({ deviceId: d.deviceId, label: d.label }));
            setDevices(cams);
            if (!devId && cams[0]) setSelectedDeviceId(cams[0].deviceId);
          } catch {
            /* ignore enumerate failure */
          }
        }
        dispatch({ type: "CAMERA_READY" });
      } catch (err) {
        if (token !== reqTokenRef.current) return;
        stopLocalStream();
        const reason = classifyCameraError(err);
        if (reason === "permission-denied") {
          dispatch({ type: "CAMERA_DENIED", error: messageFor(reason) });
        } else {
          dispatch({ type: "CAMERA_UNAVAILABLE", error: messageFor(reason) });
        }
      }
    },
    [dispatch, stopLocalStream],
  );

  const toggleCamera = useCallback(async () => {
    if (pipMode) {
      const nextOn = (cameraState?.status ?? (localStream ? "live" : "idle")) !== "live";
      if (onCameraToggle) {
        await onCameraToggle(nextOn, selectedDeviceId || undefined);
      } else if (nextOn) {
        await startStandaloneCamera(selectedDeviceId);
      } else {
        stopLocalStream();
        dispatch({ type: "CAMERA_STOPPED" });
      }
      return;
    }

    if (gateState < 2) {
      audio.emit("ui.denied"); // the toggle is still locked (consent not confirmed): soft refusal, the card shakes
      dispatch({ type: "CAMERA_TOGGLE_LOCKED" });
      return;
    }
    if (phase !== "gate" && phase !== "camera-on") return;

    const currentStatus = cameraState?.status ?? cameraStatus ?? (localStream ? "live" : "idle");
    const isOn = currentStatus === "requesting" || currentStatus === "live";
    if (phase === "camera-on" && isOn) {
      if (onCameraToggle) {
        await onCameraToggle(false, selectedDeviceId || undefined);
      } else {
        stopLocalStream();
      }
      dispatch({ type: "CAMERA_STOPPED" });
      return;
    }

    dispatch({ type: "CAMERA_REQUEST" });
    if (onCameraToggle) {
      try {
        const res = await onCameraToggle(true, selectedDeviceId || undefined);
        if (res === true || res === "live") dispatch({ type: "CAMERA_READY" });
        else if (res === "denied") dispatch({ type: "CAMERA_DENIED" });
        else if (res === false || res === "unavailable") dispatch({ type: "CAMERA_UNAVAILABLE" });
      } catch (err) {
        const reason = classifyCameraError(err);
        dispatch({
          type: reason === "permission-denied" ? "CAMERA_DENIED" : "CAMERA_UNAVAILABLE",
          error: messageFor(reason),
        });
      }
      return;
    }
    await startStandaloneCamera(selectedDeviceId);
  }, [cameraState?.status, cameraStatus, dispatch, gateState, localStream, onCameraToggle, phase, pipMode, selectedDeviceId, startStandaloneCamera, stopLocalStream]);

  const changeDevice = useCallback(
    (devId: string) => {
      setSelectedDeviceId(devId);
      onCameraDeviceChange?.(devId);
    },
    [onCameraDeviceChange],
  );

  return {
    stream: cameraState?.stream !== undefined ? cameraState.stream : localStream,
    devices: cameraState?.devices ?? devices,
    selectedDeviceId: cameraState?.selectedDeviceId ?? selectedDeviceId,
    toggleCamera,
    changeDevice,
  };
}
