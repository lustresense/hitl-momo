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

  it("keeps the direction buttons as icon-only indicators that take no press", () => {
    bar({ mode: "camera", handDirs: ["left"] });
    const left = screen.getByTestId("move-left");
    expect(left.classList.contains("is-icon-only")).toBe(true);
    expect(left.classList.contains("is-hand-active")).toBe(true);
    expect(left.getAttribute("aria-disabled")).toBe("true");
    expect(left.textContent).toBe("");
  });

  it("offers Geser objek (pinch) and Putar (open palm) and reports the requests", () => {
    const onMoveRequest = vi.fn();
    const onRotateRequest = vi.fn();
    bar({ mode: "camera", onMoveRequest, onRotateRequest });
    expect(screen.getByTestId("btn-reposition").textContent).toContain("Geser objek");
    expect(screen.getByTestId("btn-rotate").textContent).toContain("Putar");
    fireEvent.click(screen.getByTestId("btn-reposition"));
    fireEvent.click(screen.getByTestId("btn-rotate"));
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(onRotateRequest).toHaveBeenCalledTimes(1);
  });

  it("Geser objek falls back to the existing reposition action when no move request is given", () => {
    const onReposition = vi.fn();
    bar({ mode: "camera", onReposition });
    fireEvent.click(screen.getByTestId("btn-reposition"));
    expect(onReposition).toHaveBeenCalledTimes(1);
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
});
