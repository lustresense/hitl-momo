/**
 * The lab's own camera request. The page asks only after a click on "Nyalakan kamera", so opening the page
 * never turns the camera on by itself. Kept apart from GlobalCamera, which the cover work changes.
 */
import { classifyCameraError, messageFor } from "@/src/camera/messages";

/** Same quality request as the game camera: 720p for stable landmarks, 24-60 fps to limit motion blur (NUI-2). */
export function labCameraConstraints(): MediaTrackConstraints {
  return {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60, min: 24 },
  };
}

export type LabCameraResult = { kind: "ok"; stream: MediaStream } | { kind: "error"; message: string };

/**
 * One constrained request. A camera that cannot meet the constraints (OverconstrainedError) gets one plain
 * retry, so the lab still opens on a laptop webcam. Errors come back as short Indonesian messages.
 */
export async function startLabCamera(devices: Pick<MediaDevices, "getUserMedia"> | undefined): Promise<LabCameraResult> {
  if (!devices?.getUserMedia) return { kind: "error", message: messageFor("unsupported") };
  try {
    const stream = await devices.getUserMedia({ video: labCameraConstraints(), audio: false });
    return { kind: "ok", stream };
  } catch (err) {
    if (!isNamed(err, "OverconstrainedError")) return { kind: "error", message: messageFor(classifyCameraError(err)) };
  }
  try {
    const stream = await devices.getUserMedia({ video: true, audio: false });
    return { kind: "ok", stream };
  } catch (err) {
    return { kind: "error", message: messageFor(classifyCameraError(err)) };
  }
}

function isNamed(err: unknown, name: string): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: unknown }).name === name;
}
