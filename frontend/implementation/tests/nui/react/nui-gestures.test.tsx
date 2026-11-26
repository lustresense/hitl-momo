// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NuiProvider, TestSource, useDragRelative, useFlick, useJoystick } from "@/src/nui";

describe("NUI Mode C hooks (useJoystick, useFlick, useDragRelative)", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("wires joystick axis/tap/flick, sticker flick, and relative drag to InputSample stream", () => {
    let now = 0;
    const ts = new TestSource(() => now);
    const axes: number[] = [];
    const jumps: string[] = [];
    const onFlick = vi.fn();
    const drags: Array<[number, number]> = [];
    const onDragEnd = vi.fn();

    function ModeC() {
      const [ready] = useState(true);
      useJoystick({
        enabled: ready,
        showOverlay: true,
        onAxis: (a) => axes.push(a),
        onJump: (k) => jumps.push(k),
      });
      useFlick(onFlick, { enabled: ready });
      useDragRelative({
        enabled: ready,
        threshold: 12,
        onMove: (dx, dy) => drags.push([dx, dy]),
        onEnd: onDragEnd,
      });
      return <div data-testid="r83-mode-c">C</div>;
    }

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <ModeC />
      </NuiProvider>,
    );

    // 1) Quick tap (<230ms, <=10px) -> tap jump, no drag (<12px).
    act(() => {
      now = 100;
      ts.push({ t: now, x: 300, y: 300, pinch: true });
      now = 180;
      ts.push({ t: now, x: 305, y: 300, pinch: false });
    });
    expect(jumps).toEqual(["tap"]);
    expect(drags).toHaveLength(0);

    // 2) Move right +69px (axis = 0.675), then flick upward 60px within 80ms -> joy flick + sticker flick + drag.
    act(() => {
      now = 400;
      ts.push({ t: now, x: 300, y: 300, pinch: true });
      now = 440;
      ts.push({ t: now, x: 369, y: 300, pinch: true });
      now = 500;
      ts.push({ t: now, x: 369, y: 240, pinch: true });
      now = 540;
      ts.push({ t: now, x: 369, y: 240, pinch: false });
    });
    expect(axes.some((a) => a > 0.6 && a < 0.75)).toBe(true);
    expect(jumps).toEqual(["tap", "flick"]);
    expect(onFlick).toHaveBeenCalledTimes(1);
    expect(drags.length).toBeGreaterThan(0);
    expect(drags[0]).toEqual([69, 0]);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("mounts joystick overlay SVG inside [data-ui='r83'] when present and cleans up on unmount (BERAT-1)", () => {
    let now = 0;
    const ts = new TestSource(() => now);

    function JoyStage() {
      useJoystick({ enabled: true, showOverlay: true });
      return <div data-testid="r83-joy-stage" />;
    }

    const { unmount } = render(
      <div data-ui="r83" data-testid="r83-root">
        <NuiProvider testSource={ts} clock={() => now}>
          <JoyStage />
        </NuiProvider>
      </div>,
    );

    const root = document.querySelector('[data-ui="r83"]');
    const scopedSvg = document.querySelector('[data-ui="r83"] .nui-joy');
    expect(root).not.toBeNull();
    expect(scopedSvg).not.toBeNull();
    expect(scopedSvg?.parentElement).toBe(root);
    expect(document.querySelector("body > .nui-joy")).toBeNull();

    unmount();
    expect(document.querySelector(".nui-joy")).toBeNull();
  });
});
