/**
 * The lab's own camera request. The page asks only after a click on "Nyalakan kamera", so opening the page
 * never turns the camera on by itself. Kept apart from GlobalCamera, which the cover work changes.
 *
 * R23B-HF3 ("tajam dulu, baru terang"):
 *  - Requests 640x480 with frameRate { ideal: 30, min: 24 } so webcams keep short shutter times in dim light.
 *  - On OverconstrainedError, retries without `min` (frameRate { ideal: 30 }) and flags `constraintFallback`
 *    so the caller records `CAMERA_CONSTRAINT_FALLBACK`.
 *  - Avoids auto-selecting infrared ("IR" / "Infrared") cameras when > 1 videoinput camera exists,
 *    while still allowing explicit manual selection via `options.deviceId`.
 */
import { classifyCameraError, messageFor } from "@/src/camera/messages";

export interface LabCameraOptions {
  /** Explicit user-selected camera deviceId (manual choice bypasses IR auto-skip). */
  deviceId?: string | null;
}

export type LabCameraResult =
  | {
      kind: "ok";
      stream: MediaStream;
      constraintFallback: boolean;
      fallbackReason: string | null;
      selectedDeviceId: string | null;
      irCameraSkipped: boolean;
    }
  | { kind: "error"; message: string };

export type LabMediaDevicesLike = Pick<MediaDevices, "getUserMedia"> &
  Partial<Pick<MediaDevices, "enumerateDevices">>;

/** R23B-HF3 primary constraints (gesture + canvas): 640x480 @ 24-30 fps to prevent slow AE shutter blur. */
export function labCameraConstraints(deviceId?: string | null): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30, min: 24 },
  };
  if (deviceId) {
    return { ...base, deviceId: { exact: deviceId } };
  }
  return { facingMode: "user", ...base };
}

/** R23B-HF3 fallback constraints when `min: 24` triggers OverconstrainedError (retries without `min`). */
export function labCameraFallbackConstraints(deviceId?: string | null): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30 },
  };
  if (deviceId) {
    return { ...base, deviceId: { exact: deviceId } };
  }
  return { facingMode: "user", ...base };
}

/** True when a camera label indicates an infrared / Windows Hello IR camera. */
export function isInfraredCameraLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /infrared/i.test(label) || /(?:^|[\s_\-/()[\]])ir(?:$|[\s_\-/()[\]]|cam)/i.test(label);
}

/**
 * When > 1 videoinput device exists and at least one is an IR/Infrared camera, pick the first non-IR camera
 * for automatic startup. Returns `deviceId: null` when there is <= 1 camera or no IR camera to avoid.
 */
export function selectDefaultNonIrVideoDevice(
  devices: ReadonlyArray<Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">>,
): { deviceId: string | null; irCameraSkipped: boolean } {
  const videoInputs = devices.filter((d) => d.kind === "videoinput" && Boolean(d.deviceId));
  if (videoInputs.length <= 1) {
    return { deviceId: null, irCameraSkipped: false };
  }
  const hasIr = videoInputs.some((d) => isInfraredCameraLabel(d.label));
  if (!hasIr) {
    return { deviceId: null, irCameraSkipped: false };
  }
  const nonIr = videoInputs.find((d) => !isInfraredCameraLabel(d.label));
  if (!nonIr) {
    return { deviceId: null, irCameraSkipped: false };
  }
  return { deviceId: nonIr.deviceId, irCameraSkipped: true };
}

async function openWithConstraintFallback(
  devices: Pick<MediaDevices, "getUserMedia">,
  deviceId: string | null,
): Promise<
  | { kind: "ok"; stream: MediaStream; constraintFallback: boolean; fallbackReason: string | null }
  | { kind: "error"; message: string }
> {
  try {
    const stream = await devices.getUserMedia({ video: labCameraConstraints(deviceId), audio: false });
    return { kind: "ok", stream, constraintFallback: false, fallbackReason: null };
  } catch (err) {
    if (!isNamed(err, "OverconstrainedError")) {
      return { kind: "error", message: messageFor(classifyCameraError(err)) };
    }
  }
  try {
    const stream = await devices.getUserMedia({ video: labCameraFallbackConstraints(deviceId), audio: false });
    return { kind: "ok", stream, constraintFallback: true, fallbackReason: "OverconstrainedError" };
  } catch (err) {
    if (!isNamed(err, "OverconstrainedError")) {
      return { kind: "error", message: messageFor(classifyCameraError(err)) };
    }
  }
  try {
    const stream = await devices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    });
    return { kind: "ok", stream, constraintFallback: true, fallbackReason: "OverconstrainedError:plain" };
  } catch (err) {
    return { kind: "error", message: messageFor(classifyCameraError(err)) };
  }
}

/**
 * Opens the lab camera with HF3 constraints (640x480, ideal 30 fps, min 24 fps), automatic fallback without `min`
 * on OverconstrainedError, and automatic avoidance of IR/Infrared cameras when multiple cameras exist.
 */
export async function startLabCamera(
  devices: LabMediaDevicesLike | undefined,
  options?: LabCameraOptions,
): Promise<LabCameraResult> {
  if (!devices?.getUserMedia) return { kind: "error", message: messageFor("unsupported") };

  const manualDeviceId = options?.deviceId?.trim() ? options.deviceId.trim() : null;
  let targetDeviceId: string | null = manualDeviceId;
  let irCameraSkipped = false;

  if (!manualDeviceId && typeof devices.enumerateDevices === "function") {
    try {
      const list = await devices.enumerateDevices();
      const picked = selectDefaultNonIrVideoDevice(list);
      if (picked.deviceId) {
        targetDeviceId = picked.deviceId;
        irCameraSkipped = picked.irCameraSkipped;
      }
    } catch {
      /* ignore enumerateDevices failures before permission */
    }
  }

  const first = await openWithConstraintFallback(devices, targetDeviceId);
  if (first.kind === "error") return first;

  // Post-permission IR guard: if labels were hidden before permission and the OS gave us an IR camera,
  // re-enumerate now that permission is granted and switch to a non-IR camera if > 1 camera exists.
  if (!manualDeviceId && typeof devices.enumerateDevices === "function") {
    const primaryTrack =
      typeof first.stream.getVideoTracks === "function" ? first.stream.getVideoTracks()[0] : undefined;
    if (isInfraredCameraLabel(primaryTrack?.label)) {
      try {
        const list = await devices.enumerateDevices();
        const picked = selectDefaultNonIrVideoDevice(list);
        if (picked.deviceId && picked.deviceId !== targetDeviceId) {
          if (typeof first.stream.getTracks === "function") {
            for (const t of first.stream.getTracks()) {
              try {
                t.stop();
              } catch {
                /* best-effort */
              }
            }
          }
          const switched = await openWithConstraintFallback(devices, picked.deviceId);
          if (switched.kind === "ok") {
            return {
              kind: "ok",
              stream: switched.stream,
              constraintFallback: first.constraintFallback || switched.constraintFallback,
              fallbackReason: switched.fallbackReason ?? first.fallbackReason,
              selectedDeviceId: picked.deviceId,
              irCameraSkipped: true,
            };
          }
          return switched;
        }
      } catch {
        /* keep already opened stream if re-enumeration fails */
      }
    }
  }

  const openedTrack =
    typeof first.stream.getVideoTracks === "function" ? first.stream.getVideoTracks()[0] : undefined;
  const resolvedDeviceId =
    targetDeviceId ??
    (typeof openedTrack?.getSettings === "function" ? (openedTrack.getSettings().deviceId ?? null) : null);

  return {
    kind: "ok",
    stream: first.stream,
    constraintFallback: first.constraintFallback,
    fallbackReason: first.fallbackReason,
    selectedDeviceId: resolvedDeviceId,
    irCameraSkipped,
  };
}

function isNamed(err: unknown, name: string): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: unknown }).name === name;
}
