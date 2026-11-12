import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDrawingSurface, type DrawingToolUsed } from "@/src/components/drawing/hooks/useDrawingSurface";
import type { DrawingSurface } from "@/src/input";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom has no 2D canvas: a permissive context is enough for the surface to draw. */
function stubCanvas2d() {
  const ctx = new Proxy(
    { canvas: { width: 100, height: 50 }, getImageData: () => ({ data: new Uint8ClampedArray(4) }) } as Record<string | symbol, unknown>,
    {
      get: (target, key) => (key in target ? target[key] : () => undefined),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
}

/** A real DrawingSurface on a canvas, with the hook around it: the same wiring the tutorial uses. */
async function setup() {
  stubCanvas2d();
  const canvas = document.createElement("canvas");
  const canvasRef = { current: canvas };
  const surfaceOut: { current: DrawingSurface | null } = { current: null };
  const reported: DrawingToolUsed[] = [];
  const hook = renderHook(() =>
    useDrawingSurface({ canvasRef, surfaceOut, initialMode: "pointer", active: true, onToolUsed: (tool) => reported.push(tool) }),
  );
  const surface = surfaceOut.current!;
  expect(surface).toBeTruthy();
  // Let the hook's first-frame resize run while the canvas stub is still in place.
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
  return { hook, surface, reported };
}

function stroke(surface: DrawingSurface, from: number, to: number) {
  const store = surface.store;
  store.beginStroke();
  store.addPoint({ x: from, y: 10 } as never);
  store.addPoint({ x: to, y: 10 } as never);
  store.endStroke();
}

describe("tutorial practice tools (R4): a tool is reported only for a real change", () => {
  it("undo, redo and an empty erase on a blank drawing change nothing and report nothing", async () => {
    const { hook, surface, reported } = await setup();
    act(() => {
      expect(hook.result.current.undo()).toBe(false);
      expect(hook.result.current.redo()).toBe(false);
      expect(surface.store.eraseAt({ x: 10, y: 10 } as never, 5)).toBe(false);
      surface.store.beginStroke();
      surface.store.endStroke(); // a stroke with no points is no stroke
    });
    expect(reported).toEqual([]);
  });

  it("a stroke is a draw, a pass that removes a point is an erase, and each is reported once", async () => {
    const { hook, surface, reported } = await setup();
    act(() => stroke(surface, 10, 40));
    expect(reported).toEqual(["draw"]);
    act(() => {
      expect(surface.store.eraseAt({ x: 10, y: 10 } as never, 6)).toBe(true); // the stroke's first point
    });
    expect(reported).toEqual(["draw", "erase"]);
    act(() => {
      expect(surface.store.eraseAt({ x: 90, y: 40 } as never, 6)).toBe(false); // nothing there: no report
    });
    expect(reported).toEqual(["draw", "erase"]);
    expect(hook.result.current).toBeTruthy();
  });

  it("undo and redo report only when they move the drawing", async () => {
    const { hook, surface, reported } = await setup();
    act(() => stroke(surface, 10, 40));
    act(() => {
      expect(hook.result.current.undo()).toBe(true);
    });
    act(() => {
      expect(hook.result.current.undo()).toBe(false); // nothing left to undo
    });
    act(() => {
      expect(hook.result.current.redo()).toBe(true);
    });
    expect(reported).toEqual(["draw", "undo", "redo"]);
  });
});
