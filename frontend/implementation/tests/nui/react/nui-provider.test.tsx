// @vitest-environment jsdom
import { Profiler, useEffect, useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanvasCursor,
  NuiProvider,
  NuiRing,
  PipHand,
  TestSource,
  useNui,
  useNuiTarget,
  type NuiController,
} from "@/src/nui";

function mockRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

function ControllerProbe({ onReady }: { onReady: (c: NuiController) => void }) {
  const controller = useNui();
  useEffect(() => {
    onReady(controller);
  }, [controller, onReady]);
  return null;
}

describe("NuiProvider & React Layer", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("causes ZERO React commits across 20 pointer-move frames and during ring fill", () => {
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const commits: string[] = [];

    function CustomTarget() {
      const ref = useRef<HTMLDivElement | null>(null);
      useNuiTarget(ref, { label: "Uji", holdMs: 1000, mode: "any" });
      return (
        <div ref={ref} data-testid="r83-custom-target">
          Target
        </div>
      );
    }

    render(
      <Profiler id="r83-provider-tree" onRender={(_id, phase) => { commits.push(phase); }}>
        <NuiProvider testSource={ts} clock={() => now}>
          <ControllerProbe onReady={(c) => { ctrl = c; }} />
          <NuiRing label="Ayo" holdMs={1000} testId="r83-ring-prof" />
          <CustomTarget />
          <PipHand />
          <CanvasCursor />
        </NuiProvider>
      </Profiler>,
    );

    mockRect(screen.getByTestId("r83-ring-prof"), { left: 100, top: 100, width: 80, height: 80 });
    mockRect(screen.getByTestId("r83-custom-target"), { left: 300, top: 100, width: 80, height: 80 });

    act(() => {
      now = 50;
      ts.push({ t: now, x: 110, y: 110, inFrame: true, pinch: false });
      ctrl?.stepNow(now);
    });
    commits.length = 0;

    act(() => {
      for (let i = 1; i <= 20; i++) {
        now += 16;
        ts.push({ t: now, x: 110 + i * 2, y: 110 + i, inFrame: true, pinch: false });
        ctrl?.stepNow(now);
      }
    });
    expect(commits).toHaveLength(0);

    const pip = screen.getByTestId("r83-pip-hand");
    expect(pip.style.display).toBe("block");
    expect(pip.style.left).not.toBe("");

    const ringEl = screen.getByTestId("r83-ring-prof");
    act(() => {
      now += 40;
      ts.push({ t: now, x: 120, y: 120, inFrame: true, pinch: true });
      ctrl?.stepNow(now);
    });
    commits.length = 0;

    act(() => {
      for (let i = 1; i <= 15; i++) {
        now += 20;
        ctrl?.stepNow(now);
      }
    });
    expect(commits).toHaveLength(0);
    expect(Number(ringEl.getAttribute("aria-valuenow"))).toBeGreaterThan(25);
  });

  it("supports Mode A, Mode B lock-on-pinch, Mode D point, Latch, and Keyboard Enter", async () => {
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const onFireA = vi.fn();
    const onFireB1 = vi.fn();
    const onFireB2 = vi.fn();
    const onFireD = vi.fn();
    const onFireLatch = vi.fn();

    function Stage({ scene }: { scene: "A" | "B" | "D" | "latch-empty" | "latch-shown" }) {
      return (
        <>
          <ControllerProbe onReady={(c) => { ctrl = c; }} />
          {scene === "A" && <NuiRing label="Ayo" holdMs={500} testId="r83-a" onFire={onFireA} />}
          {scene === "B" && (
            <>
              <NuiRing label="Satu" holdMs={500} testId="r83-b1" onFire={onFireB1} />
              <NuiRing label="Dua" holdMs={500} testId="r83-b2" onFire={onFireB2} />
            </>
          )}
          {scene === "D" && (
            <>
              <CanvasCursor />
              <NuiRing label="Tebak Gambarku" holdMs={500} mode="point" testId="r83-d" onFire={onFireD} />
            </>
          )}
          {scene === "latch-shown" && <NuiRing label="Baru" holdMs={300} testId="r83-latch" onFire={onFireLatch} />}
        </>
      );
    }

    const { rerender } = render(
      <NuiProvider testSource={ts} clock={() => now}>
        <Stage scene="A" />
      </NuiProvider>,
    );

    // Mode A: pinch anywhere far from target fills & fires.
    mockRect(screen.getByTestId("r83-a"), { left: 50, top: 50, width: 72, height: 72 });
    act(() => {
      now = 100;
      ts.push({ t: now, x: 700, y: 500, pinch: true });
      for (let i = 0; i < 12; i++) { now += 50; ctrl?.stepNow(now); }
      ts.push({ t: now, x: 700, y: 500, pinch: false });
    });
    await Promise.resolve();
    expect(onFireA).toHaveBeenCalledTimes(1);

    // Mode B: nearest lights up, locks on pinch even if hand drifts within cancel threshold.
    rerender(<NuiProvider testSource={ts} clock={() => now}><Stage scene="B" /></NuiProvider>);
    const b1 = screen.getByTestId("r83-b1");
    const b2 = screen.getByTestId("r83-b2");
    mockRect(b1, { left: 100, top: 100, width: 64, height: 64 });
    mockRect(b2, { left: 188, top: 100, width: 64, height: 64 });

    act(() => {
      now += 60;
      ts.push({ t: now, x: 165, y: 132, pinch: false });
      ctrl?.stepNow(now);
    });
    expect(b1.classList.contains("nui-lit")).toBe(true);
    expect(b2.classList.contains("nui-lit")).toBe(false);

    act(() => {
      now += 40;
      ts.push({ t: now, x: 165, y: 132, pinch: true });
      now += 20;
      ts.push({ t: now, x: 185, y: 132, pinch: true });
      for (let i = 0; i < 12; i++) { now += 50; ctrl?.stepNow(now); }
      ts.push({ t: now, x: 185, y: 132, pinch: false });
    });
    await Promise.resolve();
    expect(onFireB1).toHaveBeenCalledTimes(1);
    expect(onFireB2).toHaveBeenCalledTimes(0);

    // Mode D: CanvasCursor renders only in canvasMode; point target needs direct hit.
    rerender(<NuiProvider testSource={ts} clock={() => now}><Stage scene="D" /></NuiProvider>);
    expect(screen.queryByTestId("r83-canvas-cursor")).toBeNull();
    act(() => { ctrl?.setCanvasMode(true); });
    expect(screen.getByTestId("r83-canvas-cursor")).toBeDefined();
    mockRect(screen.getByTestId("r83-d"), { left: 400, top: 200, width: 80, height: 80 });

    act(() => {
      now += 60;
      ts.push({ t: now, x: 50, y: 50, pinch: true });
      for (let i = 0; i < 12; i++) { now += 50; ctrl?.stepNow(now); }
      ts.push({ t: now, x: 50, y: 50, pinch: false });
    });
    await Promise.resolve();
    expect(onFireD).toHaveBeenCalledTimes(0);

    act(() => {
      now += 60;
      ts.push({ t: now, x: 430, y: 230, pinch: true });
      for (let i = 0; i < 12; i++) { now += 50; ctrl?.stepNow(now); }
      ts.push({ t: now, x: 430, y: 230, pinch: false });
      ctrl?.setCanvasMode(false);
    });
    await Promise.resolve();
    expect(onFireD).toHaveBeenCalledTimes(1);

    // Latch: target appearing while pinch is held must wait for release; then Enter confirms.
    rerender(<NuiProvider testSource={ts} clock={() => now}><Stage scene="latch-empty" /></NuiProvider>);
    act(() => {
      now += 50;
      ts.push({ t: now, x: 200, y: 200, pinch: true });
      ctrl?.stepNow(now);
    });
    rerender(<NuiProvider testSource={ts} clock={() => now}><Stage scene="latch-shown" /></NuiProvider>);
    mockRect(screen.getByTestId("r83-latch"), { left: 200, top: 200, width: 72, height: 72 });
    act(() => {
      for (let i = 0; i < 10; i++) { now += 50; ctrl?.stepNow(now); }
    });
    await Promise.resolve();
    expect(onFireLatch).toHaveBeenCalledTimes(0);

    act(() => {
      now += 50;
      ts.push({ t: now, x: 200, y: 200, pinch: false });
      ctrl?.stepNow(now);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      for (let i = 0; i < 8; i++) { now += 50; ctrl?.stepNow(now); }
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    });
    await Promise.resolve();
    expect(onFireLatch).toHaveBeenCalledTimes(1);
  });
});
