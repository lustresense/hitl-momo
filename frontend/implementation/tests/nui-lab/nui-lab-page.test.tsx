// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const landmarker = { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() };
  return {
    landmarker,
    createHandLandmarker: vi.fn(async () => ({ landmarker, delegate: "GPU", fellBack: false })),
  };
});

vi.mock("@/src/camera/hand-landmarker", () => ({
  createHandLandmarker: mocks.createHandLandmarker,
  delegateLabel: () => "GPU",
}));

import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

function fakeStream() {
  const track = {
    stop: vi.fn(),
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

beforeEach(() => {
  mocks.createHandLandmarker.mockClear();
  mocks.landmarker.close.mockClear();
});

afterEach(() => {
  cleanup();
  setMediaDevices(undefined);
});

describe("NuiLabPage without a camera", () => {
  it("shows the start button disabled and a clear message when getUserMedia is missing", async () => {
    setMediaDevices(undefined);
    render(<NuiLabPage />);
    expect(screen.getByRole("heading", { name: /uji tangan/i })).toBeTruthy();
    const start = screen.getByRole("button", { name: "Nyalakan kamera" }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(true));
    expect(screen.getByText("Browser ini belum bisa pakai kamera.")).toBeTruthy();
    expect(mocks.createHandLandmarker).not.toHaveBeenCalled();
  });
});

describe("NuiLabPage camera", () => {
  it("does not touch the camera until the owner clicks", () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage />);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mocks.createHandLandmarker).not.toHaveBeenCalled();
    // With the camera off the wave test still tells the owner what to do.
    expect(screen.getByText(/Belum diuji/)).toBeTruthy();
  });

  it("starts the camera on click and the hand model with it", async () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    setMediaDevices({ getUserMedia });
    render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Matikan kamera" })).toBeTruthy();
  });

  it("stops the tracks and closes the model when the owner stops the camera", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Matikan kamera" }));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(mocks.landmarker.close).toHaveBeenCalled();
  });

  it("releases the camera and the model on unmount", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn(async () => stream) });
    const view = render(<NuiLabPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    });
    await waitFor(() => expect(mocks.createHandLandmarker).toHaveBeenCalled());
    view.unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(mocks.landmarker.close).toHaveBeenCalled();
  });
});
