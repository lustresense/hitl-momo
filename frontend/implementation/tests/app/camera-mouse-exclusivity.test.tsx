// @vitest-environment jsdom
import React, { useEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { R83SketchbookShell } from "@/src/app/R83SketchbookShell";
import { CoverCameraCard } from "@/src/features/cover/CoverCameraCard";
import { GuessRing } from "@/src/features/canvas/GuessRing";
import { CardWalk } from "@/src/features/tutorial/CardWalk";
import { POINTER_OFFSCREEN } from "@/src/nui/core/constants";
import { NuiProvider, NuiRing, useNui, useNuiStatus, type NuiController } from "@/src/nui/react";
import type { HandDetector, HandFrame } from "@/src/nui/sources/hand-detector";

class StubDetector implements HandDetector {
  private readonly listeners = new Set<(frame: HandFrame) => void>();
  start = vi.fn(async () => undefined);
  stop = vi.fn();
  subscribe(cb: (frame: HandFrame) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(frame: HandFrame): void {
    for (const cb of [...this.listeners]) cb(frame);
  }
}

function ControllerProbe({ onReady }: { onReady: (c: NuiController) => void }) {
  const nui = useNui();
  const st = useNuiStatus();
  useEffect(() => {
    onReady(nui);
  }, [nui, onReady]);
  return <span data-testid="probe-status" data-sim={String(st.simOn)} data-hand={String(st.handAttached)} />;
}

function mockRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

describe("Camera vs Mouse exclusivity & r8.3 DreamLoader gate", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    document.documentElement.className = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables MouseSource + native target clicks while HandDetector is attached, and restores mouse when detached", () => {
    let now = 100;
    const detector = new StubDetector();
    const ctrlRef: { current: NuiController | null } = { current: null };
    const onRingFire = vi.fn();
    const onChromeClick = vi.fn();
    const onWalkDone = vi.fn();

    const { rerender } = render(
      <NuiProvider clock={() => now} handDetector={detector}>
        <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
        <NuiRing label="Ayo" holdMs={400} mode="point" onFire={onRingFire} testId="excl-ring" />
        <button type="button" data-nui-off="true" data-testid="excl-chrome" onClick={onChromeClick}>
          Matikan kamera
        </button>
        <CardWalk active onComplete={onWalkDone} />
      </NuiProvider>,
    );

    const statusEl = screen.getByTestId("probe-status");
    expect(statusEl.getAttribute("data-hand")).toBe("true");
    expect(statusEl.getAttribute("data-sim")).toBe("false");
    expect(document.documentElement.classList.contains("hand-sim")).toBe(false);

    // Try H key in dev mode: mouse sim stays locked off while camera hand detector is attached
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
    });
    expect(ctrlRef.current?.getStatus().simOn).toBe(false);

    const ringEl = screen.getByTestId("excl-ring");
    mockRect(ringEl, { left: 100, top: 100, width: 80, height: 80 });

    // Moving/pressing/clicking mouse MUST NOT drive pointer, hold ring, or click ring
    act(() => {
      now = 200;
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 140, clientY: 140, bubbles: true }));
      ringEl.dispatchEvent(new MouseEvent("pointerdown", { clientX: 140, clientY: 140, button: 0, bubbles: true }));
      ctrlRef.current?.stepNow(200);
      now = 700;
      ctrlRef.current?.stepNow(700);
    });
    expect(ctrlRef.current?.getFrame().x).toBe(POINTER_OFFSCREEN);
    expect(ctrlRef.current?.getFrame().source).toBeNull();
    expect(onRingFire).not.toHaveBeenCalled();

    fireEvent.click(ringEl);
    expect(onRingFire).not.toHaveBeenCalled();

    // Dragging CardWalk via pointer does nothing while camera is ON
    const walk = screen.getByTestId("r83-tut-walk");
    mockRect(walk, { left: 0, top: 0, width: 400, height: 120 });
    fireEvent.pointerDown(walk, { clientX: 50, clientY: 60 });
    fireEvent.pointerMove(walk, { clientX: 380, clientY: 60 });
    fireEvent.pointerUp(walk, { clientX: 380, clientY: 60 });
    expect(onWalkDone).not.toHaveBeenCalled();

    // Native chrome [data-nui-off="true"] (e.g. camera toggle switch) still clicks normally
    fireEvent.click(screen.getByTestId("excl-chrome"));
    expect(onChromeClick).toHaveBeenCalledTimes(1);

    // Turn camera OFF (detector=null) -> MouseSource immediately re-enables!
    rerender(
      <NuiProvider clock={() => now} handDetector={null}>
        <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
        <NuiRing label="Ayo" holdMs={400} mode="point" onFire={onRingFire} testId="excl-ring" />
        <button type="button" data-nui-off="true" data-testid="excl-chrome" onClick={onChromeClick}>
          Matikan kamera
        </button>
        <CardWalk active onComplete={onWalkDone} />
      </NuiProvider>,
    );

    expect(screen.getByTestId("probe-status").getAttribute("data-hand")).toBe("false");
    expect(screen.getByTestId("probe-status").getAttribute("data-sim")).toBe("true");
    expect(document.documentElement.classList.contains("hand-sim")).toBe(true);

    act(() => {
      now = 900;
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 140, clientY: 140, bubbles: true }));
      ctrlRef.current?.stepNow(900);
    });
    expect(ctrlRef.current?.getFrame().x).toBe(140);
    expect(ctrlRef.current?.getFrame().source).toBe("mouse");
  });

  it("mounts non-skippable DreamLoader with in-dream nickname input on / and /load over CoverScreen", async () => {
    window.history.replaceState(null, "", "/");
    const { unmount } = render(<R83SketchbookShell />);
    expect(screen.getByTestId("dream-loader")).toBeTruthy();
    expect(screen.getByTestId("r83-entry-name-input")).toBeTruthy();
    expect(screen.getByTestId("r83-cover-screen")).toBeTruthy();
    expect(screen.queryByTestId("dream-loader-skip")).toBeNull();

    // Submitting a nickname inside DreamLoader shows Momo's sleepy reaction without storing PII
    fireEvent.change(screen.getByTestId("r83-entry-name-input"), { target: { value: "Rani" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("r83-entry-submit"));
    });
    expect(screen.getByTestId("dream-name-prompt").textContent).toContain("Oooo... Rani... zzz...");
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain("Rani");
    unmount();

    window.history.replaceState(null, "", "/load");
    render(<R83SketchbookShell />);
    expect(screen.getByTestId("dream-loader")).toBeTruthy();
    expect(screen.getByTestId("r83-entry-name-input")).toBeTruthy();
    expect(screen.getByTestId("r83-cover-screen")).toBeTruthy();
    expect(screen.queryByTestId("dream-loader-skip")).toBeNull();
  });

  it("exposes real interactive #cam-pip toggle and auto-reconnects camera on post-cover refresh when r83_cam_wanted=1", async () => {
    const fakeTrack = {
      kind: "video",
      readyState: "live",
      label: "USB RGB Webcam",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "cam-1", width: 640, height: 480 }),
      getCapabilities: () => ({}),
    } as unknown as MediaStreamTrack;
    const fakeStream = {
      getVideoTracks: () => [fakeTrack],
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia },
    });

    window.history.replaceState(null, "", "/levels");
    const first = render(<R83SketchbookShell />);
    const pipToggle = screen.getByTestId("r83-pip-toggle");
    expect(pipToggle.getAttribute("aria-pressed")).toBe("false");
    expect(pipToggle.classList.contains("is-on")).toBe(false);

    // Clicking the real PIP toggle turns camera ON and sets r83_cam_wanted=1
    await act(async () => {
      fireEvent.click(pipToggle);
    });
    await vi.waitFor(() => {
      expect(screen.getByTestId("r83-pip-toggle").getAttribute("aria-pressed")).toBe("true");
    });
    expect(screen.getByTestId("r83-pip-toggle").classList.contains("is-on")).toBe(true);
    expect(window.sessionStorage.getItem("r83_cam_wanted")).toBe("1");
    first.unmount();

    // Simulate page refresh on /levels: camera auto-reconnects because r83_cam_wanted === "1"
    getUserMedia.mockClear();
    const refreshed = render(<R83SketchbookShell />);
    await vi.waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("r83-pip-toggle").getAttribute("aria-pressed")).toBe("true");
    });

    // Clicking PIP toggle OFF stops camera and clears r83_cam_wanted
    await act(async () => {
      fireEvent.click(screen.getByTestId("r83-pip-toggle"));
    });
    expect(screen.getByTestId("r83-pip-toggle").getAttribute("aria-pressed")).toBe("false");
    expect(window.sessionStorage.getItem("r83_cam_wanted")).toBeNull();
    refreshed.unmount();
  });

  it("blocks GuessRing fallback click while handDetector is attached and renders NUI warming overlay on CoverCameraCard", () => {
    const detector = new StubDetector();
    const onSubmit = vi.fn();
    render(
      <NuiProvider autoSim={false} handDetector={detector}>
        <GuessRing
          visible
          getDrawingRect={() => ({ left: 200, top: 200, right: 400, bottom: 400, width: 200, height: 200 })}
          onSubmit={onSubmit}
        />
      </NuiProvider>,
    );
    fireEvent.click(screen.getByTestId("r83-guess-ring"));
    expect(onSubmit).not.toHaveBeenCalled();

    const cardRef = { current: null } as React.RefObject<HTMLDivElement>;
    const fakeStream = { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
    render(
      <CoverCameraCard
        cardRef={cardRef}
        gateState={2}
        cameraStatus="requesting"
        pipMode={false}
        morphing={false}
        nuiActive={false}
        stream={fakeStream}
        onToggleCamera={vi.fn()}
      />,
    );
    expect(screen.getByTestId("r83-camera-warming").textContent).toContain("Memanaskan model NUI");
  });
});
