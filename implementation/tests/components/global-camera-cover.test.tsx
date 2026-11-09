// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});
// Momo's chat is replaced by a stub that reports "lines done" on demand.
const momo = vi.hoisted(() => ({ props: null as null | { sleeping?: boolean; step: { lines: string[] } | null; onDone?: () => void } }));
vi.mock("@/src/components/momo/MomoGuide", () => ({
  MomoGuide: (p: typeof momo.props) => {
    momo.props = p;
    return <div data-testid="cover-momo" data-asleep={p?.sleeping ? "true" : "false"} />;
  },
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

describe("GlobalCamera cover (PRD 0.0.16 R1, R13, R17)", () => {
  it("Momo sleeps and there are no buttons other than the camera switch in camera mode", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("true");
    const buttons = Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("data-testid"));
    expect(buttons).toEqual(["btn-camera-toggle-switch"]);
    expect(screen.queryByTestId("cover-continue")).toBeNull();
  });

  it("turning the camera on keeps Momo asleep, changes the title and shows the wave hint", async () => {
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
    expect(screen.getByText("Lambaikan Tanganmu!")).toBeTruthy();
    expect(screen.getByTestId("camera-card").className).toContain("has-stream");
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("true");
    expect(screen.getByTestId("cover-wave-hint")).toBeTruthy();
  });

  it("a wave wakes Momo with her origin lines; after the last line the book opens and onWave navigates", async () => {
    vi.useFakeTimers();
    const onWave = vi.fn();
    render(<GlobalCamera mode="cover" modelUrl="/m" onWave={onWave} />);
    // The empty asleep chat finishing must not leave the cover.
    act(() => momo.props?.onDone?.());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onWave).not.toHaveBeenCalled();

    act(() => { (window as Window & { __skbWave?: () => void }).__skbWave?.(); });
    expect(screen.getByTestId("cover-momo").dataset.asleep).toBe("false");
    expect(momo.props?.step?.lines.at(-1)).toBe("Ayo ikut aku masuk ke dunia Sketchbook!");
    expect(momo.props?.step?.lines.join(" ")).toMatch(/gambar pertama/);
    act(() => momo.props?.onDone?.());
    expect(onWave).not.toHaveBeenCalled(); // the last line stays readable first
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onWave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cover-book-flip").dataset.direction).toBe("open");
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
