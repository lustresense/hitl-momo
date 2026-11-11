// @vitest-environment jsdom
/**
 * R3 cover choreography on fake timers: wake beat, camera card to the PIP box (one tween), Momo's flight and wave,
 * the dialog delay, the help nudges, and cancellation on unmount. GSAP is mocked; the tweens are inspected, not run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import gsap from "gsap";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(() => ({ kill: vi.fn() })), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});

const momo = vi.hoisted(() => ({
  props: null as null | { sleeping?: boolean; step: { lines: string[] } | null; height?: number; fullSize?: boolean; className?: string; waveKey?: number; startDelay?: number },
}));
vi.mock("@/src/components/momo/MomoGuide", () => ({
  MomoGuide: (p: typeof momo.props & { children?: React.ReactNode }) => {
    momo.props = p;
    return <div data-testid="cover-momo" data-asleep={p?.sleeping ? "true" : "false"}>{p?.children}</div>;
  },
}));
vi.mock("@/src/components/ui/ThumbConfirm", () => ({
  ThumbConfirm: (p: { label?: string; onConfirm: () => void }) => (
    <button type="button" data-testid="cover-thumb" onClick={p.onConfirm}>{p.label}</button>
  ),
}));
// The tracker is replaced: the test drives its progress seam and does not load MediaPipe.
const trackers = vi.hoisted(() => [] as Array<{ opts: { onProgress?: (p: number) => void }; start: () => Promise<void>; stop: () => void }>);
vi.mock("@/src/camera/wave-tracker", () => ({
  WaveTracker: class {
    opts: unknown;
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    constructor(opts: unknown) {
      this.opts = opts;
      trackers.push(this as never);
    }
  },
}));

const originalRect = Element.prototype.getBoundingClientRect;

/** Let the camera's async start finish (fake timers do not fake promises). */
async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function cameraOn() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: "c" }) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream), enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  fireEvent.click(screen.getByTestId("btn-camera-toggle-switch"));
  await flush();
}

const fromToCalls = () => (gsap.fromTo as unknown as ReturnType<typeof vi.fn>).mock.calls;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "1");
  resetInputModeForTest();
  momo.props = null;
  trackers.length = 0;
  vi.clearAllMocks();
  Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
    const card = this.dataset?.testid === "camera-card";
    const r = card
      ? { top: 100, left: 100, width: 320, height: 240 }
      : { top: 0, left: 0, width: 0, height: 0 };
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) };
  }) as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Element.prototype.getBoundingClientRect = originalRect;
});

describe("GlobalCamera cover choreography (R3)", () => {
  it("camera on, no wave: Momo mumbles at 8 s, the small wake button appears at 20 s", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { vi.advanceTimersByTime(7900); });
    expect(momo.props?.step).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(momo.props?.step?.lines).toEqual(["Zzz... coba sapa aku, dong."]);
    expect(screen.queryByTestId("cover-wake")).toBeNull();
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.getByTestId("cover-wake")).toBeTruthy();
  });

  it("the wave ring follows the tracker's progress seam", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    expect(trackers.length).toBeGreaterThan(0);
    act(() => { trackers[0]!.opts.onProgress?.(0.4); });
    expect(screen.getByTestId("cover-wave-hint").dataset.progress).toBe("40");
  });

  it("one wave: the card flies to the PIP box once, Momo flies to the centre and waves on landing, the dialog starts after 2 s", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    expect(momo.props?.sleeping).toBe(false);
    expect(momo.props?.startDelay).toBe(2000);
    expect(momo.props?.height).toBe(250);

    act(() => { vi.advanceTimersByTime(749); });
    expect(fromToCalls()).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(1); });
    // One tween for the camera card: 0.8 s, into the bottom-left PIP box (150 x 120 at 24 px from the corner).
    const cardCalls = fromToCalls();
    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0]![0]).toBe(screen.getByTestId("camera-card"));
    expect(cardCalls[0]![2]).toMatchObject({ duration: 0.8, ease: "power2.inOut" });
    const expectedScaleX = 150 / 320;
    expect(cardCalls[0]![2].scaleX).toBeCloseTo(expectedScaleX, 5);
    expect(cardCalls[0]![2].scaleY).toBeCloseTo(120 / 240, 5);
    // Momo is centred and sized 320 px (the FLIP tween flies her from 250 px).
    expect(momo.props?.height).toBe(320);
    expect(momo.props?.fullSize).toBe(true);
    expect(momo.props?.className).toContain("is-centered");

    // The camera card lands: the layout is the PIP even though the page is still the cover.
    act(() => { cardCalls[0]![2].onComplete(); });
    expect(screen.getByTestId("global-camera-widget").className).toContain("mode-floating");

    // Momo waves when she has landed (750 + 1100 ms).
    act(() => { vi.advanceTimersByTime(1000); });
    expect(momo.props?.waveKey).toBe(0);
    act(() => { vi.advanceTimersByTime(100); });
    expect(momo.props?.waveKey).toBe(1);

    // A second wave changes nothing: one flight, one wave.
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(fromToCalls()).toHaveLength(1);
    expect(momo.props?.waveKey).toBe(1);
  });

  it("the camera morph is not repeated when the page switches to floating (no second flight)", async () => {
    const { rerender } = render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    act(() => { vi.advanceTimersByTime(800); });
    const [, , vars] = fromToCalls()[0]!;
    act(() => { vars.onComplete(); });
    rerender(<GlobalCamera mode="floating" modelUrl="/m" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(fromToCalls()).toHaveLength(1);
  });

  it("without a camera there is no camera flight; Momo still flies and the button wakes her", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    act(() => forceInputMode("fallback"));
    fireEvent.click(screen.getByRole("button", { name: /Bangunkan Momo/ }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(fromToCalls()).toHaveLength(0);
    expect(momo.props?.className).toContain("is-centered");
    expect(screen.getByTestId("global-camera-widget").className).toContain("mode-cover");
  });

  it("unmounting during the wake beat cancels the flights and the wave timers", async () => {
    const { unmount } = render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(fromToCalls()).toHaveLength(0);
  });

  it("the book opens on the thumb; Momo fades 0.3 s after the midpoint and is gone after the fade", async () => {
    const onWave = vi.fn();
    const { rerender } = render(<GlobalCamera mode="cover" modelUrl="/m" onWave={onWave} />);
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { fireEvent.click(screen.getByTestId("cover-thumb")); });
    // The leaf takes 0.9 s; with GSAP mocked the safety net reports the midpoint at 1.4 s, which navigates.
    act(() => { vi.advanceTimersByTime(1400); });
    expect(onWave).toHaveBeenCalledTimes(1);
    rerender(<GlobalCamera mode="floating" modelUrl="/m" onWave={onWave} />);
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.getByTestId("cover-momo")).toBeTruthy();
    expect(momo.props?.className ?? "").not.toContain("is-leaving");
    act(() => { vi.advanceTimersByTime(1); });
    expect(momo.props?.className).toContain("is-leaving");
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByTestId("cover-momo")).toBeNull();
    expect(onWave).toHaveBeenCalledTimes(1);
  });
});
