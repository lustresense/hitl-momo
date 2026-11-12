// @vitest-environment jsdom
/**
 * R3 cover choreography on fake timers: wake beat, camera card to the PIP box (one tween), Momo's flight and wave,
 * the dialog delay, the help nudges, and cancellation on unmount. GSAP is mocked; the tweens are inspected, not run.
 * I1: the wave ring follows the tracker's progress subscription, and the card morph is uniform (no stretched video).
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
  props: null as null | { sleeping?: boolean; step: { lines: string[] } | null; height?: number; fullSize?: boolean; className?: string; waveKey?: number; startDelay?: number; onDone?: () => void },
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
// The tracker is replaced: the test drives its progress subscription and does not load MediaPipe.
interface FakeTracker {
  opts: { onWave?: () => void };
  listeners: Set<(p: number) => void>;
  unsubscribes: number;
  emit: (p: number) => void;
  subscribeProgress: ReturnType<typeof vi.fn>;
  start: () => Promise<void>;
  stop: () => void;
}
const trackers = vi.hoisted(() => [] as FakeTracker[]);
vi.mock("@/src/camera/wave-tracker", () => ({
  WaveTracker: class {
    opts: unknown;
    listeners = new Set<(p: number) => void>();
    unsubscribes = 0;
    emit = (p: number) => {
      for (const l of [...this.listeners]) l(p);
    };
    subscribeProgress = vi.fn((listener: (p: number) => void) => {
      this.listeners.add(listener);
      listener(0);
      return () => {
        this.listeners.delete(listener);
        this.unsubscribes++;
      };
    });
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    constructor(opts: unknown) {
      this.opts = opts;
      trackers.push(this as never);
    }
  },
}));
// The model warm-up is a separate concern (its own tests); here it must not load MediaPipe.
vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  subscribeHandLandmarkerStatus: vi.fn(() => () => undefined),
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
  // A 320 x 300 cover card: taller than its 4:5 crop, as the real cover card is with the video on.
  Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
    const card = this.dataset?.testid === "camera-card";
    const r = card
      ? { top: 100, left: 100, width: 320, height: 300 }
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
  it("camera on, no wave: Momo mumbles at 8 s, and no button appears at 20 s (camera mode has no text button)", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { vi.advanceTimersByTime(7900); });
    expect(momo.props?.step).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(momo.props?.step?.lines).toEqual(["Zzz... coba sapa aku, dong."]);
    expect(screen.queryByTestId("cover-wake")).toBeNull();
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.queryByTestId("cover-wake")).toBeNull();
    expect(momo.props?.sleeping).toBe(true);
  });

  it("camera mode: a silent 1 s press on the wave ring wakes Momo; a short press does not", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    const ring = screen.getByTestId("cover-wave-hint");
    fireEvent.pointerDown(ring);
    act(() => { vi.advanceTimersByTime(900); });
    fireEvent.pointerUp(ring);
    act(() => { vi.advanceTimersByTime(500); });
    expect(momo.props?.sleeping).toBe(true);
    fireEvent.pointerDown(ring);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(momo.props?.sleeping).toBe(false);
    expect(screen.queryByTestId("cover-wake")).toBeNull();
  });

  it("camera mode: leaving the ring cancels the hold, and Enter on the focused ring holds like a press", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    const ring = screen.getByTestId("cover-wave-hint");
    fireEvent.pointerDown(ring);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerLeave(ring);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(momo.props?.sleeping).toBe(true);
    fireEvent.keyDown(ring, { key: "Enter" });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(momo.props?.sleeping).toBe(false);
  });

  it("the wave ring is filled by the tracker's progress, and shows the value it was given", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    expect(trackers.length).toBe(1);
    expect(trackers[0]!.subscribeProgress).toHaveBeenCalledTimes(1);
    act(() => { trackers[0]!.emit(0.4); });
    const ring = screen.getByTestId("cover-wave-hint");
    expect(ring.dataset.progress).toBe("40");
    const fill = ring.querySelector("circle.cover-wave-ring__fill") as SVGCircleElement;
    const circumference = 2 * Math.PI * 30;
    expect(parseFloat(fill.style.getPropertyValue("stroke-dashoffset"))).toBeCloseTo(circumference * 0.6, 3);
    act(() => { trackers[0]!.emit(1); });
    expect(ring.dataset.progress).toBe("100");
  });

  it("the progress subscription is released when the wave is recognised, and on unmount", async () => {
    const { unmount } = render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    expect(trackers[0]!.unsubscribes).toBe(0);
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    expect(trackers[0]!.unsubscribes).toBe(1);
    unmount();
    expect(trackers[0]!.unsubscribes).toBe(1); // already released: no double unsubscribe
  });

  it("unmounting while the camera waits for a wave releases the progress subscription", async () => {
    const { unmount } = render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    unmount();
    expect(trackers[0]!.unsubscribes).toBe(1);
  });

  it("one wave: the card flies to the PIP box once, Momo flies to the centre and waves on landing, the dialog starts 0.3 s after the wave", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    expect(momo.props?.sleeping).toBe(false);
    expect(momo.props?.startDelay).toBe(300);
    expect(momo.props?.height).toBe(250);

    act(() => { vi.advanceTimersByTime(749); });
    expect(fromToCalls()).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(1); });
    // One tween for the camera card: 0.8 s, into the bottom-left PIP box (150 x 120 at 24 px from the corner).
    const cardCalls = fromToCalls();
    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0]![0]).toBe(screen.getByTestId("camera-card"));
    expect(cardCalls[0]![2]).toMatchObject({ duration: 0.8, ease: "power2.inOut" });
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

  it("the card morph is uniform and lands exactly on the 150 x 120 PIP box (the video is never stretched)", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    act(() => { vi.advanceTimersByTime(750); });
    const [, from, to] = fromToCalls()[0]!;
    // Card 320 x 300 at (100, 100): scale to the PIP width, crop the bottom to 5:4 so the visible part scales to 120 px.
    expect(to.scale).toBeCloseTo(150 / 320, 6);
    expect(to.scaleX).toBeUndefined();
    expect(to.scaleY).toBeUndefined();
    expect(to.scale * 320).toBeCloseTo(150, 6);
    expect(to.scale * (300 - 44)).toBeCloseTo(120, 6);
    expect(to.clipPath).toBe("inset(0px 0px 44px 0px round 14px)");
    expect(from).toMatchObject({ scale: 1, transformOrigin: "0px 0px" });
    // Top-left corner of the card goes to the PIP's top-left corner (24 px from the bottom-left of a 768 px window).
    expect(to.x).toBeCloseTo(24 - 100, 6);
    expect(to.y).toBeCloseTo(768 - 24 - 120 - 100, 6);
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

  it("without a camera the button wakes Momo and the card still moves to the PIP once, so the centre stays free for her", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    act(() => forceInputMode("fallback"));
    fireEvent.click(screen.getByRole("button", { name: /Bangunkan Momo/ }));
    act(() => { vi.advanceTimersByTime(749); });
    expect(fromToCalls()).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(1); });
    // Same morph as with a camera: one 0.8 s tween of the one camera card into the PIP box.
    const cardCalls = fromToCalls();
    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0]![0]).toBe(screen.getByTestId("camera-card"));
    expect(cardCalls[0]![2]).toMatchObject({ duration: 0.8, ease: "power2.inOut" });
    expect(momo.props?.className).toContain("is-centered");
    expect(momo.props?.height).toBe(320);
    // Landed: the layout is the PIP, and its status line says why there is no picture.
    act(() => { cardCalls[0]![2].onComplete(); });
    expect(screen.getByTestId("global-camera-widget").className).toContain("mode-floating");
    expect(screen.getByTestId("camera-status").textContent).toBe("Kamera tidak ditemukan. Pakai mouse atau keyboard.");
    // Nothing flies again later.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(fromToCalls()).toHaveLength(1);
  });

  it("unmounting during the wake beat cancels the flights and the wave timers", async () => {
    const { unmount } = render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(fromToCalls()).toHaveLength(0);
  });

  it("the book opens on the thumb; Momo fades out from the midpoint and is gone 0.3 s later (R12-03: no two Momos)", async () => {
    const onWave = vi.fn();
    const { rerender } = render(<GlobalCamera mode="cover" modelUrl="/m" onWave={onWave} />);
    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    act(() => { vi.advanceTimersByTime(3000); });
    // The thumb appears once Momo has typed her last line (MomoGuide's onDone).
    act(() => { momo.props?.onDone?.(); });
    act(() => { fireEvent.click(screen.getByTestId("cover-thumb")); });
    // The leaf takes 0.9 s; with GSAP mocked the safety net reports the midpoint at 1.4 s, which navigates.
    act(() => { vi.advanceTimersByTime(1400); });
    expect(onWave).toHaveBeenCalledTimes(1);
    rerender(<GlobalCamera mode="floating" modelUrl="/m" onWave={onWave} />);
    // The fade starts at the midpoint, not 0.3 s later: the next screen's Momo fades in only after this one is gone.
    expect(momo.props?.className).toContain("is-leaving");
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.getByTestId("cover-momo")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByTestId("cover-momo")).toBeNull();
    expect(onWave).toHaveBeenCalledTimes(1);
  });
});
