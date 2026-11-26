// @vitest-environment jsdom
import { useEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NUI_LEGEND, ringAriaLabel } from "@/src/domain/copy/nui";
import {
  CanvasCursor,
  HandLegend,
  NuiProvider,
  NuiRing,
  TestSource,
  useNui,
  useOptionalNui,
  type HandDetector,
  type HandFrame,
  type HandLandmark,
  type NuiController,
} from "@/src/nui";
import { HarnessCameraPip } from "@/src/nui/dev/HarnessCameraPip";
import { NuiHarness } from "@/src/nui/dev/NuiHarness";
import { WebcamHandDetector } from "@/src/nui/dev/webcam-hand-detector";

class FakeHandDetector implements HandDetector {
  private readonly listeners = new Set<(f: HandFrame) => void>();
  async start(): Promise<void> {}
  stop(): void {}
  subscribe(cb: (frame: HandFrame) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
  emit(frame: HandFrame): void {
    for (const cb of [...this.listeners]) cb(frame);
  }
}

function makeHand(mcpX: number, mcpY: number, open: boolean, pinchRatio = open ? 0.65 : 0.18): HandLandmark[] {
  const palm = 0.2;
  const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: mcpX, y: mcpY, z: 0 }));
  lm[0] = { x: mcpX, y: mcpY + palm, z: 0 };
  lm[9] = { x: mcpX, y: mcpY, z: 0 };
  lm[5] = { x: mcpX, y: mcpY, z: 0 };
  const tipY = open ? mcpY - 0.14 : mcpY - 0.04;
  lm[6] = { x: mcpX, y: mcpY - 0.06, z: 0 };
  lm[8] = { x: mcpX, y: tipY, z: 0 };
  lm[4] = { x: mcpX, y: tipY + pinchRatio * palm, z: 0 };
  for (const [tip, pip] of [[12, 10], [16, 14], [20, 18]] as const) {
    lm[pip] = { x: mcpX, y: mcpY - 0.05, z: 0 };
    lm[tip] = { x: mcpX, y: open ? mcpY - 0.15 : mcpY + 0.02, z: 0 };
  }
  return lm;
}

function mockRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}),
    }),
  });
}

function Probe({ onReady }: { onReady: (c: NuiController) => void }) {
  const c = useNui();
  useEffect(() => { onReady(c); }, [c, onReady]);
  return null;
}

describe("Pre-G2 QA parity regressions (BERAT-3/4, SEDANG-1/3/4/6)", () => {
  const savedTestHooks = process.env.NEXT_PUBLIC_TEST_HOOKS;

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.className = "";
    delete window.__skbNui;
    if (savedTestHooks === undefined) delete process.env.NEXT_PUBLIC_TEST_HOOKS;
    else process.env.NEXT_PUBLIC_TEST_HOOKS = savedTestHooks;
  });

  it("wires getHoverId + mostHovered(400ms) from NuiController -> HandSource -> NuiEngine on Mode B PINCH_ON (BERAT-3)", async () => {
    let now = 0;
    const detector = new FakeHandDetector();
    let ctrl: NuiController | null = null;
    const onLeft = vi.fn();
    const onRight = vi.fn();

    render(
      <NuiProvider clock={() => now} handDetector={detector}>
        <Probe onReady={(c) => { ctrl = c; }} />
        <NuiRing label="Kiri" holdMs={200} testId="r83-ml" onFire={onLeft} />
        <NuiRing label="Kanan" holdMs={200} testId="r83-mr" onFire={onRight} />
      </NuiProvider>,
    );

    mockRect(screen.getByTestId("r83-ml"), { left: 160, top: 200, width: 80, height: 80 });
    mockRect(screen.getByTestId("r83-mr"), { left: 400, top: 200, width: 80, height: 80 });

    act(() => {
      // Acquire + 8 tracked frames over Kiri (mcpX=0.72 -> mirrored 0.28 -> ~215px, over r83-ml)
      for (let t = 0; t <= 160; t += 20) {
        now = t;
        detector.emit({ t, videoWidth: 1280, videoHeight: 720, hands: [makeHand(0.72, 0.35, true)] });
        ctrl?.stepNow(t);
      }
      // Move smoothly (< 0.35 step) over Kanan (mcpX=0.55 -> mirrored 0.45 -> ~445px, over r83-mr)
      // for 6 frames so both current x AND clickPoint(t-200ms=180) are over Kanan, while mostHovered(400ms) is Kiri!
      for (const [t, open] of [
        [180, true],
        [220, true],
        [260, true],
        [300, true],
        [340, false],
        [380, false],
      ] as const) {
        now = t;
        detector.emit({ t, videoWidth: 1280, videoHeight: 720, hands: [makeHand(0.55, 0.35, open)] });
        ctrl?.stepNow(t);
      }
      for (let i = 0; i < 6; i++) {
        now += 40;
        ctrl?.stepNow(now);
      }
    });

    await Promise.resolve();
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).toHaveBeenCalledTimes(0);
  });

  it("keeps CanvasCursor rendered when !simOn && activeSource==='hand' and turns grey + data-frozen when frozen (BERAT-4, SEDANG-3)", () => {
    let now = 0;
    const detector = new FakeHandDetector();
    let ctrl: NuiController | null = null;

    function CanvasStage() {
      const paperRef = useRef<HTMLDivElement | null>(null);
      return (
        <>
          <Probe onReady={(c) => { ctrl = c; }} />
          <div ref={paperRef} className="sk-wrap" data-testid="r83-paper" />
          <CanvasCursor tool="pencil" paperRef={paperRef} />
        </>
      );
    }

    render(
      <NuiProvider autoSim={false} initialCanvasMode clock={() => now} handDetector={detector}>
        <CanvasStage />
      </NuiProvider>,
    );

    // simOn is false and no hand yet -> CanvasCursor stays unmounted
    expect(screen.queryByTestId("r83-canvas-cursor")).toBeNull();

    // Acquire hand -> activeSource === "hand" -> CanvasCursor mounts even while simOn === false!
    act(() => {
      for (const t of [0, 33, 66]) {
        now = t;
        detector.emit({ t, videoWidth: 1280, videoHeight: 720, hands: [makeHand(0.5, 0.45, true)] });
        ctrl?.stepNow(t);
      }
    });
    const cursor = screen.getByTestId("r83-canvas-cursor");
    expect(cursor.id).toBe("hand-cursor");
    expect(cursor.classList.contains("is-lost")).toBe(false);
    expect(cursor.getAttribute("data-frozen")).toBeNull();

    // Short loss (< T_gap=250ms) -> frozen: is-lost + data-frozen="true" + pencil & eraser dimmed grey!
    act(() => {
      now = 160;
      detector.emit({ t: now, videoWidth: 1280, videoHeight: 720, hands: [] });
      ctrl?.stepNow(now);
    });
    expect(cursor.classList.contains("is-lost")).toBe(true);
    expect(cursor.getAttribute("data-frozen")).toBe("true");
    const pencil = cursor.querySelector<HTMLElement>(".r83-cursor-pencil");
    const eraser = cursor.querySelector<HTMLElement>(".r83-cursor-eraser");
    expect(pencil?.style.opacity).toBe("0.55");
    expect(eraser?.style.opacity).toBe("0.55");
    expect(pencil?.style.color).toContain("154");
    expect(eraser?.style.color).toContain("154");

    // Hand returns within T_gap -> clears frozen state & restores full opacity
    act(() => {
      now = 220;
      detector.emit({ t: now, videoWidth: 1280, videoHeight: 720, hands: [makeHand(0.5, 0.45, true)] });
      ctrl?.stepNow(now);
    });
    expect(cursor.classList.contains("is-lost")).toBe(false);
    expect(cursor.getAttribute("data-frozen")).toBeNull();
    expect(pencil?.style.opacity).toBe("1");
    expect(eraser?.style.opacity).toBe("1");
  });

  it("renders HandLegend and NuiRing copy from single source src/domain/copy/nui.ts (SEDANG-1)", () => {
    const detector = new FakeHandDetector();
    const { rerender } = render(
      <NuiProvider devTools={false} handDetector={null}>
        <NuiRing label="Ayo" testId="r83-ring-copy" />
        <HandLegend forceVisible />
      </NuiProvider>,
    );

    expect(screen.getByTestId("r83-ring-copy").getAttribute("aria-label")).toBe(ringAriaLabel("Ayo"));
    const legend = screen.getByTestId("r83-hand-legend");
    expect(legend.textContent).toBe(NUI_LEGEND.simOnBaseSegments.map((s) => s.text).join(""));

    // Camera attached / active -> disables mouse sim and switches to NUI_LEGEND.handPlain
    rerender(
      <NuiProvider devTools={false} handDetector={detector}>
        <NuiRing label="Ayo" testId="r83-ring-copy" />
        <HandLegend forceVisible />
      </NuiProvider>,
    );
    act(() => {
      detector.emit({ t: 0, videoWidth: 1280, videoHeight: 720, hands: [makeHand(0.5, 0.45, true)] });
      detector.emit({ t: 33, videoWidth: 1280, videoHeight: 720, hands: [makeHand(0.5, 0.45, true)] });
    });
    expect(legend.textContent).toBe(NUI_LEGEND.handPlain);

    cleanup();
    render(
      <NuiProvider devTools>
        <HandLegend forceVisible />
      </NuiProvider>,
    );
    expect(screen.getByTestId("r83-hand-legend").textContent).toBe(NUI_LEGEND.simOnPlain);
  });

  it("toggles has-video class on #cam-pip when live camera turns on/off (SEDANG-4)", () => {
    const startSpy = vi.spyOn(WebcamHandDetector.prototype, "start").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn(WebcamHandDetector.prototype, "stop").mockImplementation(() => {});
    try {
      render(
        <NuiProvider>
          <HarnessCameraPip />
        </NuiProvider>,
      );
      const pip = screen.getByTestId("r83-cam-pip");
      const toggle = screen.getByTestId("r83-camera-toggle");
      expect(pip.classList.contains("has-video")).toBe(false);

      fireEvent.click(toggle);
      expect(pip.classList.contains("has-video")).toBe(true);

      fireEvent.click(toggle);
      expect(pip.classList.contains("has-video")).toBe(false);
    } finally {
      startSpy.mockRestore();
      stopSpy.mockRestore();
    }
  });

  it("honors NEXT_PUBLIC_TEST_HOOKS and avoids double NuiProvider nesting in NuiHarness (SEDANG-6)", () => {
    // 1) Standalone NuiHarness with NEXT_PUBLIC_TEST_HOOKS=0 must NOT expose window.__skbNui
    process.env.NEXT_PUBLIC_TEST_HOOKS = "0";
    const { unmount } = render(<NuiHarness />);
    expect(window.__skbNui).toBeUndefined();
    unmount();

    // 2) Standalone NuiHarness with NEXT_PUBLIC_TEST_HOOKS=1 exposes window.__skbNui
    process.env.NEXT_PUBLIC_TEST_HOOKS = "1";
    const r2 = render(<NuiHarness />);
    expect(window.__skbNui).toBeDefined();
    r2.unmount();
    delete window.__skbNui;

    // 3) Nested inside a parent NuiProvider: NuiHarness reuses parent controller (no duplicate provider)
    process.env.NEXT_PUBLIC_TEST_HOOKS = "0";
    let now = 0;
    const ts = new TestSource(() => now);
    let parentCtrl: NuiController | null = null;
    let optionalOutside: NuiController | null = null;

    function OutsideProbe() {
      optionalOutside = useOptionalNui();
      return null;
    }

    const rOut = render(<OutsideProbe />);
    expect(optionalOutside).toBeNull();
    rOut.unmount();

    render(
      <NuiProvider testSource={ts} testHooks={false} clock={() => now}>
        <Probe onReady={(c) => { parentCtrl = c; }} />
        <NuiHarness testHooks />
      </NuiProvider>,
    );
    expect(parentCtrl).not.toBeNull();
    // Even with testHooks prop on NuiHarness, parent provider is reused so no nested provider installs __skbNui
    expect(window.__skbNui).toBeUndefined();
    // Parent TestSource directly drives the Mode A ring rendered inside NuiHarness
    const ringA = screen.getByTestId("r83-ring-a");
    mockRect(ringA, { left: 100, top: 100, width: 72, height: 72 });
    act(() => {
      now = 100;
      ts.push({ t: now, x: 500, y: 500, pinch: true });
      for (let i = 0; i < 6; i++) {
        now += 50;
        parentCtrl?.stepNow(now);
      }
    });
    expect(Number(ringA.getAttribute("aria-valuenow"))).toBeGreaterThan(20);
  });
});
