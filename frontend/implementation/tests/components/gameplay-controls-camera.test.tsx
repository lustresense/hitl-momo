import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameplayControls, type GameplayControlsProps } from "@/src/components/game/GameplayControls";
import { resetSteerAngleForTest } from "@/src/components/game/steer-reading";

// jsdom has no PointerEvent: a minimal one keeps pointerId on the event, as in the stage tests.
const hadPointerEvent = typeof window !== "undefined" && "PointerEvent" in window;
const savedPointerEvent = hadPointerEvent ? window.PointerEvent : undefined;
beforeAll(() => {
  if (typeof window === "undefined" || hadPointerEvent) return;
  class PointerEventPolyfill extends Event {
    pointerId: number;
    constructor(type: string, params: { pointerId?: number; bubbles?: boolean; cancelable?: boolean } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  // @ts-expect-error polyfill for jsdom
  window.PointerEvent = PointerEventPolyfill;
});
afterAll(() => {
  if (typeof window === "undefined" || hadPointerEvent) return;
  // @ts-expect-error restore the jsdom default (none)
  window.PointerEvent = savedPointerEvent;
});

afterEach(() => {
  cleanup();
  resetSteerAngleForTest();
});

function bar(overrides: Partial<GameplayControlsProps> = {}) {
  const props: GameplayControlsProps = {
    mode: "camera",
    heldDirs: [],
    handDirs: [],
    onPress: vi.fn(),
    onRelease: vi.fn(),
    onReposition: vi.fn(),
    guideOpen: false,
    onToggleGuide: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<GameplayControls {...props} />) };
}

describe("camera bar: gesture affordances, no keyboard hints", () => {
  it("shows no keyboard hint anywhere on the bar", () => {
    const { container } = bar({ mode: "camera" });
    const text = container.textContent ?? "";
    for (const hint of ["[A]", "[D]", "[Spasi]", "[Klik Kiri", "Klik Kiri", "Spasi", "WASD"]) {
      expect(text).not.toContain(hint);
    }
  });

  it("shows the speedometer next to the direction icons", () => {
    bar({ mode: "camera" });
    expect(screen.getByTestId("steer-dial")).toBeTruthy();
  });

  it("shows the direction buttons icon-only, with no label text and no disabled state", () => {
    bar({ mode: "camera", handDirs: ["left"] });
    const left = screen.getByTestId("move-left");
    expect(left.classList.contains("is-icon-only")).toBe(true);
    expect(left.classList.contains("is-hand-active")).toBe(true);
    expect(left.getAttribute("aria-disabled")).toBeNull();
    expect(left.style.pointerEvents).not.toBe("none");
    expect(left.textContent).toBe("");
    expect(document.querySelectorAll(".game-input-button__label").length).toBe(0);
  });

  it("press and hold on left or right moves the same way as the keyboard, and release stops", () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    bar({ mode: "camera", onPress, onRelease });
    fireEvent.pointerDown(screen.getByTestId("move-left"), { pointerId: 4 });
    expect(onPress).toHaveBeenLastCalledWith(4, "left");
    fireEvent.pointerUp(screen.getByTestId("move-left"), { pointerId: 4 });
    expect(onRelease).toHaveBeenLastCalledWith(4);

    fireEvent.pointerDown(screen.getByTestId("move-right"), { pointerId: 5 });
    expect(onPress).toHaveBeenLastCalledWith(5, "right");
    fireEvent.pointerUp(screen.getByTestId("move-right"), { pointerId: 5 });
    expect(onRelease).toHaveBeenLastCalledWith(5);
  });

  it("a press on the jump icon jumps, with no visible text", () => {
    const onPress = vi.fn();
    bar({ mode: "camera", onPress });
    const jump = screen.getByTestId("move-jump");
    fireEvent.pointerDown(jump, { pointerId: 6 });
    expect(onPress).toHaveBeenLastCalledWith(6, "jump");
    expect(jump.textContent).toBe("");
  });

  it("shows no Geser objek or Putar button: in camera mode the rings in the stage carry those actions", () => {
    bar({ mode: "camera" });
    expect(screen.queryByTestId("btn-reposition")).toBeNull();
    expect(screen.queryByTestId("btn-rotate")).toBeNull();
    expect(screen.getByTestId("btn-control-guide")).toBeTruthy();
  });
});

describe("fallback bar: keyboard-era labels stay for mouse and keyboard players", () => {
  it("shows the three on-screen labels and no speedometer", () => {
    bar({ mode: "fallback" });
    expect(screen.getByText("Kiri")).toBeTruthy();
    expect(screen.getByText("Kanan")).toBeTruthy();
    expect(screen.getByText("Lompat")).toBeTruthy();
    expect(screen.queryByTestId("steer-dial")).toBeNull();
    expect(screen.getByTestId("move-left").classList.contains("is-icon-only")).toBe(false);
  });

  it("the direction buttons still take presses, and Putar is there too", () => {
    const onPress = vi.fn();
    const onRotateRequest = vi.fn();
    bar({ mode: "fallback", onPress, onRotateRequest });
    fireEvent.pointerDown(screen.getByTestId("move-right"), { pointerId: 3 });
    expect(onPress).toHaveBeenCalledWith(3, "right");
    fireEvent.click(screen.getByTestId("btn-rotate"));
    expect(onRotateRequest).toHaveBeenCalledTimes(1);
  });

  it("has a left and a right turn button; each asks for its own direction", () => {
    const onRotateRequest = vi.fn();
    bar({ mode: "fallback", onRotateRequest });
    fireEvent.click(screen.getByTestId("btn-rotate-left"));
    expect(onRotateRequest).toHaveBeenLastCalledWith(-1);
    fireEvent.click(screen.getByTestId("btn-rotate"));
    expect(onRotateRequest).toHaveBeenLastCalledWith(1);
    expect(onRotateRequest).toHaveBeenCalledTimes(2);
  });

  it("Q turns left and E turns right from the keyboard, once per press", () => {
    const onRotateRequest = vi.fn();
    bar({ mode: "fallback", onRotateRequest });
    fireEvent.keyDown(window, { code: "KeyQ" });
    expect(onRotateRequest).toHaveBeenLastCalledWith(-1);
    fireEvent.keyDown(window, { code: "KeyE" });
    expect(onRotateRequest).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { code: "KeyE", repeat: true });
    expect(onRotateRequest).toHaveBeenCalledTimes(2);
  });

  it("shows no keyboard hint for the turn buttons", () => {
    const { container } = bar({ mode: "fallback" });
    expect(container.textContent ?? "").not.toMatch(/\b[QE]\b/);
  });

  it("the camera bar takes no Q or E turn", () => {
    const onRotateRequest = vi.fn();
    bar({ mode: "camera", onRotateRequest });
    fireEvent.keyDown(window, { code: "KeyQ" });
    fireEvent.keyDown(window, { code: "KeyE" });
    expect(onRotateRequest).not.toHaveBeenCalled();
  });

  it("Geser objek reports the move request, and falls back to the reposition action without one", () => {
    const onMoveRequest = vi.fn();
    bar({ mode: "fallback", onMoveRequest });
    fireEvent.click(screen.getByTestId("btn-reposition"));
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    cleanup();
    const onReposition = vi.fn();
    bar({ mode: "fallback", onReposition });
    fireEvent.click(screen.getByTestId("btn-reposition"));
    expect(onReposition).toHaveBeenCalledTimes(1);
  });
});
