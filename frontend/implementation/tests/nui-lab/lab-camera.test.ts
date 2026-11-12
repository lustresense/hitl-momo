import { describe, expect, it, vi } from "vitest";
import { labCameraConstraints, startLabCamera } from "@/src/components/nui-lab/lab-camera";
import { messageFor } from "@/src/camera/messages";

const fakeStream = { id: "fake" } as unknown as MediaStream;

function domError(name: string): DOMException {
  return new DOMException("x", name);
}

describe("labCameraConstraints", () => {
  it("asks for 720p at 24-60 fps, front camera (anti motion blur, NUI-2)", () => {
    expect(labCameraConstraints()).toEqual({
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, min: 24 },
    });
  });
});

describe("startLabCamera", () => {
  it("makes one constrained request and returns the stream", async () => {
    const getUserMedia = vi.fn(async () => fakeStream);
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ video: labCameraConstraints(), audio: false });
    expect(result).toEqual({ kind: "ok", stream: fakeStream });
  });

  it("retries with a plain video request when the camera cannot meet the constraints", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockResolvedValueOnce(fakeStream);
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1]![0]).toEqual({ video: true, audio: false });
    expect(result).toEqual({ kind: "ok", stream: fakeStream });
  });

  it("does not retry on a permission refusal; it shows the student-safe message", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError("NotAllowedError"));
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: "error", message: messageFor("permission-denied") });
  });

  it("reports a camera that is missing on the fallback too", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockRejectedValueOnce(domError("NotFoundError"));
    const result = await startLabCamera({ getUserMedia } as unknown as MediaDevices);
    expect(result).toEqual({ kind: "error", message: messageFor("camera-unavailable") });
  });

  it("says so when the browser has no camera API at all", async () => {
    const result = await startLabCamera(undefined);
    expect(result).toEqual({ kind: "error", message: messageFor("unsupported") });
  });
});
