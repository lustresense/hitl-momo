// @vitest-environment jsdom
/**
 * NUI-FIX (R11-12): in camera mode a mouse can still draw. The same hook the tutorial card 3 and the level canvas
 * use: the tutorial switches to the hand on card 3 (camera), the level canvas starts on the hand (camera).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDrawingSurface, type DrawingToolUsed } from "@/src/components/drawing/hooks/useDrawingSurface";
import type { InputModeId } from "@/src/input/types";

vi.mock("@/src/input/mediapipe-input", () => ({
  HandDrawingDriver: class {
    constructor(private readonly o: { onStatus: (s: unknown) => void }) {}
    async start() {
      this.o.onStatus({ kind: "ready" });
    }
    async stop() {}
  },
}));

const RECT = { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} } as DOMRect;

beforeEach(() => {
  // jsdom has no 2D canvas: a permissive context is enough for the surface to draw.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D,
  );
  // The camera card's video, where the hook looks for the live stream.
  const host = document.createElement("div");
  host.className = "global-camera-host";
  const video = document.createElement("video");
  video.className = "camera-video";
  host.appendChild(video);
  document.body.appendChild(host);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function setup(initialMode: InputModeId) {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => RECT;
  document.body.appendChild(canvas);
  const reported: DrawingToolUsed[] = [];
  // Stable refs, as in the screens: the hook rebuilds its surface whenever these identities change.
  const canvasRef = { current: canvas };
  const surfaceOut: { current: import("@/src/input").DrawingSurface | null } = { current: null };
  const hook = renderHook(() =>
    useDrawingSurface({ canvasRef, surfaceOut, initialMode, active: true, onToolUsed: (t) => reported.push(t) }),
  );
  return { canvas, hook, surfaceOut, reported };
}

function mouseStroke(canvas: HTMLCanvasElement) {
  const ev = (type: string, x: number, y: number) =>
    canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  ev("pointerdown", 50, 50);
  ev("pointermove", 120, 90);
  ev("pointermove", 200, 140);
  ev("pointerup", 200, 140);
}

describe("camera mode: the mouse draws on the tutorial card 3 and on the level canvas", () => {
  it("tutorial card 3 in camera mode: the practice canvas is on the hand, and a mouse stroke is a draw", async () => {
    const { canvas, hook, reported } = setup("pointer");
    await act(async () => {
      await hook.result.current.switchMode("hand");
    });
    expect(hook.result.current.inputMode).toBe("hand");
    act(() => mouseStroke(canvas));
    expect(reported).toEqual(["draw"]);
  });

  it("level canvas in camera mode (starts on the hand): a mouse stroke is a draw", async () => {
    const { canvas, hook, reported } = setup("hand");
    await act(async () => {
      await Promise.resolve();
    });
    expect(hook.result.current.inputMode).toBe("hand");
    act(() => mouseStroke(canvas));
    expect(reported).toEqual(["draw"]);
  });
});
