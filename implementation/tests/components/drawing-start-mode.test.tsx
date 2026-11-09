import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawModeFor } from "@/src/components/drawing/draw-mode";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";

const created: string[] = [];
const switched: string[] = [];
vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    constructor(_c: unknown, _v: unknown, o: { initialMode: string }) { created.push(o.initialMode); }
    resizeForDpr() {}
    dispose() {}
    setMode(m: string) { switched.push(m); return Promise.resolve(); }
    setErasing() {}
    clear() {}
    undo() {}
    redo() {}
  },
}));

import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";

const props = { level: LEVELS[0]!, feedback: null, surfaceOut: { current: null }, onSubmit: vi.fn(), onExit: vi.fn(), active: true, autoAsk: false };

describe("R13 drawing starts in hand mode in camera mode", () => {
  beforeEach(() => { resetInputModeForTest(); created.length = 0; switched.length = 0; });
  afterEach(() => { cleanup(); resetInputModeForTest(); });

  it("pure rule ignores the env default", () => {
    expect(drawModeFor("camera", "pointer")).toBe("hand");
    expect(drawModeFor("fallback", "hand")).toBe("pointer");
  });

  it("camera mode creates a hand surface even when env says pointer; fallback switches to pointer", async () => {
    act(() => forceInputMode("camera"));
    render(<DrawingScreen {...props} initialMode="pointer" />);
    expect(created[0]).toBe("hand");
    await act(async () => { forceInputMode("fallback"); });
    expect(switched).toContain("pointer");
  });

  it("fallback mode starts with the pointer", () => {
    act(() => forceInputMode("fallback"));
    render(<DrawingScreen {...props} initialMode="hand" />);
    expect(created[0]).toBe("pointer");
  });
});
