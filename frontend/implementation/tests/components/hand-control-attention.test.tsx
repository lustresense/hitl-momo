/**
 * useHandControl says whether the camera or the hand needs the student's attention (needsAttention), so the stage
 * chip does not have to match the status text. The driver is faked: the test reports the statuses a real driver sends.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import { useHandControl } from "@/src/components/game/hooks/useHandControl";
import type { GameStageProps } from "@/src/components/game/game-stage-types";

type DriverOptions = {
  onStatus: (next: string) => void;
  onDiagnostic: (info: { reason?: string; message?: string; delegate?: string }) => void;
};

const drv = vi.hoisted(() => ({ options: null as DriverOptions | null }));

vi.mock("@/src/input/gameplay-hand-driver", () => ({
  GameplayHandDriver: class {
    constructor(options: DriverOptions) {
      drv.options = options;
    }
    async start() {}
    async stop() {}
  },
}));

function Probe() {
  const { status, needsAttention } = useHandControl({
    ready: true,
    phase: "gameplay",
    outcome: null,
    mode: "camera",
    input: { arbiter: { dispatch: () => undefined }, sendCombinedInput: () => undefined } as never,
    latest: { current: { phase: "gameplay" } } as unknown as MutableRefObject<GameStageProps>,
    movePlacementToHandCursor: () => undefined,
    onHandFailed: () => undefined,
  });
  return <p data-testid="probe" data-status={status} data-attention={String(needsAttention)} />;
}

async function mount() {
  const host = document.createElement("div");
  host.className = "global-camera-host";
  const video = document.createElement("video");
  video.className = "camera-video";
  host.appendChild(video);
  document.body.appendChild(host);
  const view = render(<Probe />);
  // The driver is loaded with a dynamic import: let it arrive before the first status.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

function emit(next: string) {
  act(() => drv.options!.onStatus(next));
}

afterEach(() => {
  cleanup();
  document.querySelectorAll(".global-camera-host").forEach((el) => el.remove());
  drv.options = null;
});

describe("useHandControl.needsAttention", () => {
  it("is false while the camera starts and while the hand is read, and true when the hand is lost", async () => {
    const view = await mount();
    const probe = () => view.getByTestId("probe");
    expect(probe().dataset.attention).toBe("false");
    emit("tracking");
    expect(probe().dataset.attention).toBe("false");
    emit("tracking-lost");
    expect(probe().dataset.attention).toBe("true");
    emit("tracking");
    expect(probe().dataset.attention).toBe("false");
  });

  it("is true when the camera fails, whatever the status text says", async () => {
    const view = await mount();
    emit("camera-unavailable");
    expect(view.getByTestId("probe").dataset.attention).toBe("true");
    expect(view.getByTestId("probe").dataset.status).toBe("Kamera gagal, pakai keyboard");
  });

  it("is true for a diagnostic message, and a delegate label alone does not need attention", async () => {
    const view = await mount();
    act(() => drv.options!.onDiagnostic({ delegate: "GPU" }));
    expect(view.getByTestId("probe").dataset.attention).toBe("false");
    act(() => drv.options!.onDiagnostic({ reason: "tracker-error", message: "Pembacaan tangan berhenti sebentar." }));
    expect(view.getByTestId("probe").dataset.attention).toBe("true");
  });
});
