import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest } from "@/src/camera/hand-cursor-store";
import { usePageThumb } from "@/src/components/level/use-page-thumb";

// usePageThumb feeds a ThumbConfirm on the level screens. It must follow the thumbs-up only: a fingertip that moves
// 60 times a second must not re-render the level list or the intro, so the hook reads the thumb alone.
const renders = vi.fn();
function Probe() {
  renders();
  return <span data-testid="thumb">{String(usePageThumb())}</span>;
}

beforeEach(() => {
  resetHandCursorForTest();
  renders.mockClear();
});
afterEach(() => {
  cleanup();
  resetHandCursorForTest();
});

describe("usePageThumb", () => {
  it("is undefined while no page reader is live (the ring starts the shared tracker itself)", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("thumb").textContent).toBe("undefined");
  });

  it("follows a page reader's thumbs-up", () => {
    const { getByTestId } = render(<Probe />);
    act(() => publishHand({ cursor: null, thumbUp: true, source: "drawing" }));
    expect(getByTestId("thumb").textContent).toBe("true");
    act(() => publishHand({ cursor: null, thumbUp: false, source: "drawing" }));
    expect(getByTestId("thumb").textContent).toBe("false");
  });

  it("does not re-render while the fingertip moves without a change of the thumb", () => {
    render(<Probe />);
    act(() => publishHand({ cursor: { x: 0.2, y: 0.2 }, thumbUp: false, source: "drawing" }));
    act(() => publishHand({ cursor: { x: 0.21, y: 0.2 }, thumbUp: false, source: "drawing" })); // settles the first frame
    renders.mockClear();
    for (let i = 0; i < 20; i++) {
      act(() => publishHand({ cursor: { x: 0.2 + i * 0.02, y: 0.2 }, thumbUp: false, source: "drawing" }));
    }
    expect(renders).not.toHaveBeenCalled();
  });
});
