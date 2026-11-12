// @vitest-environment jsdom
/**
 * R12-01 cover title and R12-03 cover hand-off (background and Momo), with the real GlobalCamera and fake timers.
 * Momo is a stub that records her className, so the fade classes are what the component sets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { COVER_MOMO_FADE_MS } from "@/src/components/camera/cover-handoff";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(() => ({ kill: vi.fn() })), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});
// Momo's chat is a stub: it records the onDone the cover uses to show the thumb, and her className for the fades.
const momo = vi.hoisted(() => ({ onDone: undefined as undefined | (() => void) }));
vi.mock("@/src/components/momo/MomoGuide", () => ({
  MomoGuide: (p: { className?: string; sleeping?: boolean; onDone?: () => void; children?: React.ReactNode }) => {
    momo.onDone = p.onDone;
    return <div data-testid="cover-momo" data-asleep={p.sleeping ? "true" : "false"} className={p.className}>{p.children}</div>;
  },
}));
vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  subscribeHandLandmarkerStatus: vi.fn(() => () => undefined),
  takeHandLandmarker: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock("@/src/camera/wave-tracker", () => ({
  WaveTracker: class {
    subscribeProgress = vi.fn(() => () => undefined);
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    constructor(_opts: unknown) {}
  },
}));
vi.mock("@/src/components/ui/ThumbConfirm", () => ({
  ThumbConfirm: (p: { label?: string; onConfirm: () => void }) => (
    <button type="button" data-testid="cover-thumb" onClick={p.onConfirm}>{p.label}</button>
  ),
}));

function wake() {
  act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
}

/** The thumb needs Momo's last line typed (her onDone), then a confirm; the stub never types, so onDone is called here. */
function confirmThumb() {
  act(() => { momo.onDone?.(); });
  act(() => { screen.getByTestId("cover-thumb").click(); });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "1");
  resetInputModeForTest();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("R12-01: the cover shows the Sketchbook Universe title", () => {
  it("the title sits under the Present pill and above the camera card", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    const title = screen.getByTestId("cover-wordmark");
    expect(title.textContent).toBe("Sketchbook Universe");
    const pill = document.querySelector(".eyebrow") as HTMLElement;
    const card = screen.getByTestId("camera-card");
    expect(pill.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the title is rendered with the camera off and in the no-camera fallback", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    expect(screen.getByTestId("cover-wordmark")).toBeTruthy();
    act(() => forceInputMode("fallback"));
    expect(screen.getByTestId("cover-wordmark")).toBeTruthy();
  });

  it("the title stays on the cover while Momo sleeps; after the wave it is only faded by CSS, not removed", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("true");
    expect(screen.getByTestId("cover-wordmark")).toBeTruthy();
    wake();
    expect(screen.getByTestId("global-camera-widget").className).toContain("has-momo-awake");
    expect(screen.getByTestId("cover-wordmark")).toBeTruthy();
  });

  it("the PIP (floating) never shows the title", () => {
    render(<GlobalCamera mode="floating" modelUrl="/m" />);
    expect(screen.queryByTestId("cover-wordmark")).toBeNull();
  });
});

describe("R12-03: the cover hands over to the next screen without a background or Momo jump", () => {
  it("the cover stays on the cover background after the camera card has landed in the PIP, until the book's midpoint", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    wake();
    act(() => { vi.advanceTimersByTime(1000); });
    const host = screen.getByTestId("global-camera-widget").className;
    // The layout is already the PIP (mode-floating), but the page is still the cover (is-cover-stage) until the book turns.
    expect(host).toContain("mode-floating");
    expect(host).toContain("is-cover-stage");
  });

  it("the page change comes only at the midpoint: not while the thumb has just started the book", () => {
    const onWave = vi.fn();
    render(<GlobalCamera mode="cover" modelUrl="/m" onWave={onWave} />);
    wake();
    act(() => { vi.advanceTimersByTime(4000); });
    confirmThumb();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onWave).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onWave).toHaveBeenCalledTimes(1);
  });

  it("Momo's fade starts at the midpoint (not later) and she is gone after the fade", () => {
    const view: { rerender?: (ui: React.ReactElement) => void } = {};
    const onWave = vi.fn(() => {
      // The parent navigates at the midpoint: the cover becomes the PIP and no longer shows the cover stage.
      view.rerender?.(<GlobalCamera mode="floating" modelUrl="/m" onWave={onWave} />);
    });
    const rendered = render(<GlobalCamera mode="cover" modelUrl="/m" onWave={onWave} />);
    view.rerender = rendered.rerender;
    wake();
    act(() => { vi.advanceTimersByTime(4000); });
    confirmThumb();
    // Step until the midpoint, then check the fade right after it.
    for (let t = 0; t < 4000 && onWave.mock.calls.length === 0; t += 10) act(() => { vi.advanceTimersByTime(10); });
    expect(onWave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cover-momo").className).toContain("is-leaving");
    act(() => { vi.advanceTimersByTime(COVER_MOMO_FADE_MS - 1); });
    expect(screen.getByTestId("cover-momo")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByTestId("cover-momo")).toBeNull();
    expect(onWave).toHaveBeenCalledTimes(1);
  });
});
