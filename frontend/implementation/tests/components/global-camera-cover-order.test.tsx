// @vitest-environment jsdom
/**
 * R11-15: the cover's "Aku mengerti" ring must not appear before Momo has typed out all four wake lines, in order.
 * The bug this guards: the sleepy nudge ("Zzz...") finishing while the camera is on set a sticky "typed" flag, so
 * the ring appeared at the wake, before the wake lines were typed. Real MomoGuide and MomoChat, fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { COVER_SLEEP_NUDGE, COVER_WAKE } from "@/src/domain/guide-script";
import { resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(() => ({ kill: vi.fn() })), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});
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
vi.mock("@/src/components/momo/MomoAvatar", () => ({ MomoAvatar: () => null }));
// The real ring needs the hand tracker; a plain button with the same testid stands in, as in the budget test.
vi.mock("@/src/components/ui/ThumbConfirm", () => ({
  ThumbConfirm: (p: { label?: string; onConfirm: () => void }) => (
    <button type="button" data-testid="cover-thumb" onClick={p.onConfirm}>{p.label}</button>
  ),
}));

const STEP_MS = 10;
const WAKE_LINES = COVER_WAKE.lines.map((line) => line.replace(/\*\*/g, ""));
const SLEEP_LINE = COVER_SLEEP_NUDGE.lines[0] ?? "";

function chatText(): string {
  return document.querySelector('[data-testid="cover-momo-chat"]')?.textContent ?? "";
}

function advance(ms: number) {
  for (let t = 0; t < ms; t += STEP_MS) act(() => { vi.advanceTimersByTime(STEP_MS); });
}

/** Let the camera's async start finish (fake timers do not fake promises). */
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
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

/**
 * Wakes Momo, then samples every STEP_MS until the ring is in the DOM. Records each wake line the first time it is
 * fully on screen, so the check is about what the student saw before the ring, not what is on screen at the end.
 */
function wakeUntilRing(maxMs: number) {
  act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
  const shown: string[] = [];
  let ringAt: number | null = null;
  for (let t = 0; t <= maxMs; t += STEP_MS) {
    const text = chatText();
    for (const line of WAKE_LINES) if (!shown.includes(line) && text.includes(line)) shown.push(line);
    if (screen.queryByTestId("cover-thumb")) {
      ringAt = t;
      break;
    }
    advance(STEP_MS);
  }
  return { shown, ringAt };
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

describe("GlobalCamera cover: the Aku mengerti ring waits for Momo's wake lines (R11-15)", () => {
  it("without a nudge: the ring appears only after all four wake lines are typed, in order", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    const { shown, ringAt } = wakeUntilRing(15000);
    expect(ringAt, "ring never appeared").not.toBeNull();
    expect(shown, `ring at ${ringAt} ms after the wave; wake lines fully shown before it`).toEqual(WAKE_LINES);
  });

  it("after the sleepy nudge (camera on, no wave for 8 s): the ring still waits for the wake lines", async () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await cameraOn();
    // Momo mumbles at 8 s; wait until the mumble is fully typed, so its "done" has fired before the wave.
    advance(8000);
    for (let t = 0; t < 20000 && !chatText().includes(SLEEP_LINE); t += STEP_MS) advance(STEP_MS);
    expect(chatText()).toContain(SLEEP_LINE);
    expect(screen.queryByTestId("cover-thumb")).toBeNull();

    const { shown, ringAt } = wakeUntilRing(15000);
    expect(ringAt, "ring never appeared").not.toBeNull();
    expect(shown, `ring at ${ringAt} ms after the wave; wake lines fully shown before it`).toEqual(WAKE_LINES);
  });
});
