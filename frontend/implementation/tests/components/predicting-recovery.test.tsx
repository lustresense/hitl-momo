/**
 * S1 — the prediction-error screen has no cursor: "Coba Lagi" = one finger, "Gambar lagi" = open palm, each a full
 * GestureRing (1.5 s). The poses go through the one router; thumbs-up and the other poses do nothing here.
 */
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PredictingScreen, RECOVERY_HOLD_MS } from "@/src/components/prediction/PredictingScreen";

// The hand the test controls: PredictingScreen reads the pose through useHandGesture.
const hand = vi.hoisted(() => ({ pose: "none" as string }));

vi.mock("@/src/hooks/useHandGesture", () => ({
  useHandGesture: () => ({ ready: true, handVisible: hand.pose !== "none", thumbUp: false, pinch: false, cursor: null, pose: hand.pose, fingerCount: 0 }),
  useInputMode: () => "camera",
}));

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}

/** Holds `pose` for `ms`, then releases it. A new element each time: React skips an identical element. */
function holdPose(view: { rerender: (ui: ReactElement) => void }, screenEl: () => ReactElement, pose: string, ms: number) {
  hand.pose = pose;
  view.rerender(screenEl());
  advance(ms);
  hand.pose = "none";
  view.rerender(screenEl());
  advance(64);
}

describe("PredictingScreen recovery choices (no cursor)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    hand.pose = "none";
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("one finger held for the ring retries once; a click does not", () => {
    const onRetry = vi.fn();
    const onRedraw = vi.fn();
    const el = () => <PredictingScreen error detail="provider-unavailable" onRetry={onRetry} onRedraw={onRedraw} />;
    const view = render(el());
    advance(64);
    holdPose(view, el, "one-finger", RECOVERY_HOLD_MS + 64);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRedraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("btn-retry-prediction"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("an open palm held for the ring draws again; a short hold does nothing", () => {
    const onRetry = vi.fn();
    const onRedraw = vi.fn();
    const el = () => <PredictingScreen error detail={null} onRetry={onRetry} onRedraw={onRedraw} />;
    const view = render(el());
    advance(64);
    holdPose(view, el, "open-palm", RECOVERY_HOLD_MS / 2);
    expect(onRedraw).not.toHaveBeenCalled();
    holdPose(view, el, "open-palm", RECOVERY_HOLD_MS + 64);
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("a thumbs-up or three fingers never retries or draws again here", () => {
    const onRetry = vi.fn();
    const onRedraw = vi.fn();
    const el = () => <PredictingScreen error detail={null} onRetry={onRetry} onRedraw={onRedraw} />;
    const view = render(el());
    advance(64);
    holdPose(view, el, "thumb-up", RECOVERY_HOLD_MS * 3);
    holdPose(view, el, "three-fingers", RECOVERY_HOLD_MS * 3);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
  });

  it("the loading state shows no recovery rings", () => {
    render(<PredictingScreen error={false} detail={null} onRetry={() => undefined} onRedraw={() => undefined} />);
    expect(screen.queryByTestId("btn-retry-prediction")).toBeNull();
    expect(screen.queryByTestId("btn-redraw-from-error")).toBeNull();
  });
});
