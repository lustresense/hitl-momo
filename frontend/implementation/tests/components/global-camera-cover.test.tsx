// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(() => ({ kill: vi.fn() })), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});
// Momo's chat is replaced by a stub that records the props the cover drives.
const momo = vi.hoisted(() => ({
  props: null as null | { sleeping?: boolean; step: { lines: string[] } | null; startDelay?: number; extrasFrom?: string; className?: string; height?: number },
}));
vi.mock("@/src/components/momo/MomoGuide", () => ({
  MomoGuide: (p: typeof momo.props & { children?: React.ReactNode }) => {
    momo.props = p;
    return <div data-testid="cover-momo" data-asleep={p?.sleeping ? "true" : "false"}>{p?.children}</div>;
  },
}));
// The thumb is a plain button here: the real ring needs the hand tracker (covered by thumb-confirm tests).
vi.mock("@/src/components/ui/ThumbConfirm", () => ({
  ThumbConfirm: (p: { label?: string; onConfirm: () => void }) => (
    <button type="button" data-testid="cover-thumb" onClick={p.onConfirm}>{p.label}</button>
  ),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "1");
  resetInputModeForTest();
  momo.props = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GlobalCamera cover (R1, R3: camera, wave, Momo, book)", () => {
  it("Momo sleeps and there are no buttons other than the camera switch in camera mode", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("true");
    const buttons = Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("data-testid"));
    expect(buttons).toEqual(["btn-camera-toggle-switch"]);
    expect(screen.queryByTestId("cover-continue")).toBeNull();
  });

  it("turning the camera on keeps Momo asleep, shows no headline and shows the wave ring", async () => {
    const track = { stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: "c" }) };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream), enumerateDevices: vi.fn().mockResolvedValue([]) },
    });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    await act(async () => { fireEvent.click(screen.getByTestId("btn-camera-toggle-switch")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // The old "Lambaikan Tanganmu!" headline is gone from the display (R3).
    expect(screen.queryByText("Lambaikan Tanganmu!")).toBeNull();
    expect(screen.getByTestId("camera-card").className).toContain("has-stream");
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("true");
    expect(screen.getByTestId("cover-wave-hint").dataset.progress).toBe("0");
  });

  it("a wave wakes Momo with her lines, and only a confirmed thumb opens the book, which navigates at its midpoint", () => {
    vi.useFakeTimers();
    const onWave = vi.fn();
    render(<GlobalCamera mode="cover" modelUrl="/m" onWave={onWave} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onWave).not.toHaveBeenCalled();
    expect(momo.props?.step).toBeNull();

    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("false");
    expect(momo.props?.step?.lines.at(-1)).toBe("Yuk, antar dia ke tempat yang tepat.");
    expect(momo.props?.step?.lines.join(" ")).toMatch(/gambar satu-satunya/);
    // Her words start once she has landed (about 2 s after the wave), and the thumb waits for the last line.
    expect(momo.props?.startDelay).toBe(2000);
    expect(momo.props?.extrasFrom).toBe("last");
    // Nothing opens without the thumb, however long Momo waits.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onWave).not.toHaveBeenCalled();
    expect(screen.queryByTestId("cover-book-flip")).toBeNull();

    act(() => { fireEvent.click(screen.getByTestId("cover-thumb")); });
    expect(screen.getByTestId("cover-book-flip").dataset.direction).toBe("open");
    // The book plays; the page under it changes at the midpoint (the safety net fires it when GSAP is mocked).
    expect(onWave).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onWave).toHaveBeenCalledTimes(1);
  });

  it("the W key simulates a wave only behind test hooks", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    fireEvent.keyDown(window, { key: "w" });
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("false");
  });

  it("no test hook without NEXT_PUBLIC_TEST_HOOKS", () => {
    vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "");
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    expect((window as Window & { __skbWave?: () => void }).__skbWave).toBeUndefined();
    fireEvent.keyDown(window, { key: "w" });
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("true");
  });

  it("fallback mode shows the Bangunkan Momo button, which wakes her; it hides again in camera mode", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    act(() => forceInputMode("fallback"));
    fireEvent.click(screen.getByRole("button", { name: /Bangunkan Momo/ }));
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("false");
    expect(screen.queryByTestId("cover-wake")).toBeNull();
  });

  it("camera mode hides the fallback button", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    act(() => forceInputMode("fallback"));
    expect(screen.getByTestId("cover-wake")).toBeTruthy();
    act(() => forceInputMode(null));
    expect(screen.queryByTestId("cover-wake")).toBeNull();
  });
});
