// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DreamLoader } from "@/src/components/onboarding/DreamLoader";

const mocks = vi.hoisted(() => ({
  timelineOnComplete: null as (() => void) | null,
  legacyListeners: new Set<(s: { kind: string; message?: string; delegate?: string }) => void>(),
  workerListeners: new Set<(s: { kind: string; message?: string }) => void>(),
}));

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
    timeline: vi.fn((opts?: { onComplete?: () => void }) => {
      mocks.timelineOnComplete = opts?.onComplete ?? null;
      return tl;
    }),
    ticker: { add: vi.fn(), remove: vi.fn() },
  };
  return { default: g, ...g };
});

vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  getHandLandmarkerStatus: vi.fn(() => ({ kind: "loading", progress: 0 })),
  subscribeHandLandmarkerStatus: vi.fn((cb: (s: { kind: string; message?: string; delegate?: string }) => void) => {
    mocks.legacyListeners.add(cb);
    return () => {
      mocks.legacyListeners.delete(cb);
    };
  }),
}));

vi.mock("@/src/app/monui-worker-warmup", () => ({
  warmMonuiWorker: vi.fn(async () => undefined),
  subscribeMonuiWarmupStatus: vi.fn((cb: (s: { kind: string; message?: string }) => void) => {
    mocks.workerListeners.add(cb);
    return () => {
      mocks.workerListeners.delete(cb);
    };
  }),
}));

describe("DreamLoader (REV-B03-06 & P0-06)", () => {
  beforeEach(() => {
    mocks.timelineOnComplete = null;
    mocks.legacyListeners.clear();
    mocks.workerListeners.clear();
  });

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

  it("renders both retry and mouse fallback when runtime warmup fails and resolves deadlock even when allowSkip=false", () => {
    const onReady = vi.fn();
    render(
      <DreamLoader
        modelUrl="/mock-model"
        warmRuntime="monui-worker"
        allowSkip={false}
        askNickname={false}
        onReady={onReady}
      />,
    );

    expect(screen.queryByTestId("dream-loader-skip")).toBeNull();

    act(() => {
      mocks.timelineOnComplete?.();
    });
    act(() => {
      for (const listener of mocks.workerListeners) {
        listener({ kind: "failed", message: "WASM load failed" });
      }
    });

    expect(screen.getByTestId("dream-loader").getAttribute("data-model-failed")).toBe("true");
    expect(screen.getByTestId("dream-loader-retry").textContent).toBe("Coba lagi");
    expect(screen.getByTestId("dream-loader-mouse-fallback").textContent).toBe("Lanjut pakai mouse");

    fireEvent.click(screen.getByTestId("dream-loader-mouse-fallback"));

    expect(screen.getByTestId("dream-loader").getAttribute("data-model-failed")).toBe("false");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("clears warmup failure banner on mouse fallback while nickname is pending, and surfaces submit error message honestly", async () => {
    const onReady = vi.fn();
    const onSubmitNickname = vi.fn(async () => {
      throw new Error("Kelas sudah penuh");
    });
    render(
      <DreamLoader
        modelUrl="/mock-model"
        warmRuntime="monui-worker"
        allowSkip={false}
        askNickname
        onSubmitNickname={onSubmitNickname}
        onReady={onReady}
      />,
    );

    act(() => {
      mocks.timelineOnComplete?.();
    });
    act(() => {
      for (const listener of mocks.workerListeners) {
        listener({ kind: "failed", message: "WASM load failed" });
      }
    });

    expect(screen.getByTestId("dream-loader-retry")).toBeTruthy();
    fireEvent.click(screen.getByTestId("dream-loader-mouse-fallback"));

    expect(screen.getByTestId("dream-loader").getAttribute("data-model-failed")).toBe("false");
    expect(onReady).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("r83-entry-name-input"), { target: { value: "Dina" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("r83-entry-submit"));
    });

    expect(screen.getByTestId("r83-entry-submit-error").textContent).toBe("Kelas sudah penuh");
  });
});
