// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DreamLoader } from "@/src/components/onboarding/DreamLoader";

vi.mock("gsap", () => {
  const tl = {
    to: vi.fn().mockReturnThis(),
    fromTo: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    kill: vi.fn(),
  };
  const g = {
    to: vi.fn().mockReturnValue({ kill: vi.fn(), play: vi.fn() }),
    fromTo: vi.fn().mockReturnValue({ kill: vi.fn() }),
    set: vi.fn(),
    killTweensOf: vi.fn(),
    timeline: vi.fn(() => tl),
    ticker: { add: vi.fn(), remove: vi.fn() },
  };
  return { default: g, ...g };
});

vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  getHandLandmarkerStatus: vi.fn(() => ({ kind: "loading", progress: 0 })),
  subscribeHandLandmarkerStatus: vi.fn(() => () => undefined),
}));

describe("DreamLoader (REV-B03-06)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders dream sky, Momo SVG, and skip button", () => {
    const onReady = vi.fn();
    render(<DreamLoader modelUrl="/mock-model" onReady={onReady} />);

    expect(screen.getByTestId("dream-loader")).toBeTruthy();
    expect(screen.getByTestId("dream-loader-skip")).toBeTruthy();
    expect(screen.getByLabelText("Momo terbang di mimpi")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("clicking skip button immediately invokes onReady", () => {
    const onReady = vi.fn();
    render(<DreamLoader modelUrl="/mock-model" onReady={onReady} />);

    fireEvent.click(screen.getByTestId("dream-loader-skip"));
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
