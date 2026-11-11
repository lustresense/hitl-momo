import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasFocus, resetCanvasFocusForTest } from "@/src/components/drawing/hooks/useCanvasFocus";

describe("canvas focus phase opens once per level", () => {
  beforeEach(() => resetCanvasFocusForTest());

  it("does not open again after a remount for the same level (second drawing cycle, redraw)", () => {
    const first = renderHook(() => useCanvasFocus(true, "stage-1-foundation"));
    expect(first.result.current.open).toBe(true);
    act(() => first.result.current.dismiss());
    first.unmount();
    const second = renderHook(() => useCanvasFocus(true, "stage-1-foundation"));
    expect(second.result.current.open).toBe(false);
  });

  it("opens again for another level", () => {
    const a = renderHook(() => useCanvasFocus(true, "stage-1-foundation"));
    act(() => a.result.current.dismiss());
    const b = renderHook(() => useCanvasFocus(true, "stage-2-ambiguity"));
    expect(b.result.current.open).toBe(true);
  });
});
