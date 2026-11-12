import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, retireHand } from "@/src/camera/hand-cursor-store";
import { acquireThumbTracker } from "@/src/camera/thumb-tracker";
import { HandCursor } from "@/src/components/ui/HandCursor";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx } from "./gesture-stub";

// The cursor reads the shared store and starts no tracker of its own.
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

const dots = () => document.querySelectorAll("[data-hand-cursor]");
/** A driver's frame: publish the fingertip inside act, as the app's React tree sees it. */
const show = (cursor: { x: number; y: number } | null) => act(() => publishHand({ cursor, source: "drawing" }));

describe("HandCursor", () => {
  beforeEach(() => {
    resetInputModeForTest();
    resetHandCursorForTest();
    forceInputMode("camera");
    vi.mocked(acquireThumbTracker).mockClear();
  });
  afterEach(() => {
    cleanup();
    resetHandCursorForTest();
  });

  it("draws a click-through dot at the fingertip while a reader publishes a hand in camera mode", () => {
    render(<HandCursor />);
    expect(dots()).toHaveLength(0); // nothing before a reader publishes a hand
    show(cursorAtPx(512, 384));
    const dot = document.querySelector("[data-hand-cursor]") as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.left).toBe("512px");
    expect(dot.style.top).toBe("384px");
    expect(dot.style.pointerEvents).toBe("none");
    expect(dot.getAttribute("aria-hidden")).toBe("true");
  });

  it("follows the fingertip as it moves", () => {
    render(<HandCursor />);
    show(cursorAtPx(100, 100));
    show(cursorAtPx(300, 200));
    const dot = document.querySelector("[data-hand-cursor]") as HTMLElement;
    expect(dot.style.left).toBe("300px");
    expect(dot.style.top).toBe("200px");
  });

  it("is hidden when no hand is in view", () => {
    render(<HandCursor />);
    show(cursorAtPx(200, 200));
    show(null);
    expect(dots()).toHaveLength(0);
  });

  it("is hidden when the reader stops", () => {
    render(<HandCursor />);
    show(cursorAtPx(200, 200));
    act(() => retireHand("drawing"));
    expect(dots()).toHaveLength(0);
  });

  it("is hidden in fallback mode, where the buttons are the way forward", () => {
    forceInputMode("fallback");
    render(<HandCursor />);
    show(cursorAtPx(200, 200));
    expect(dots()).toHaveLength(0);
  });

  it("never stacks two dots: a second cursor on screen draws nothing", () => {
    render(
      <>
        <HandCursor />
        <HandCursor />
      </>,
    );
    show(cursorAtPx(200, 200));
    expect(dots()).toHaveLength(1);
  });

  it("starts no tracker of its own", () => {
    render(<HandCursor />);
    expect(acquireThumbTracker).not.toHaveBeenCalled();
  });
});
