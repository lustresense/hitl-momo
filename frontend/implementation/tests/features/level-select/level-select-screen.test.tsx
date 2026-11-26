// @vitest-environment jsdom
import { Profiler, useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS } from "@/src/domain/levels";
import { LevelSelectScreen } from "@/src/features/level-select";
import { ARM_THRESHOLD_PX, NOTCH_PX } from "@/src/features/level-select/ribbon-pull";
import { NuiProvider, TestSource, type HandDetector, type HandFrame, type HandLandmark, type NuiController, useNui } from "@/src/nui";

class StubHandDetector implements HandDetector {
  private readonly listeners = new Set<(frame: HandFrame) => void>();
  start = vi.fn(async () => undefined);
  stop = vi.fn();
  subscribe(cb: (frame: HandFrame) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(frame: HandFrame): void {
    for (const cb of [...this.listeners]) cb(frame);
  }
}

function makeHandLandmarks(mcpX: number, mcpY: number, pinched: boolean): HandLandmark[] {
  const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: mcpX, y: mcpY, z: 0 }));
  lm[0] = { x: mcpX, y: mcpY + 0.18, z: 0 };
  lm[5] = { x: mcpX, y: mcpY, z: 0 };
  lm[6] = { x: mcpX, y: mcpY - 0.06, z: 0 };
  lm[8] = { x: mcpX, y: mcpY - 0.14, z: 0 };
  lm[9] = { x: mcpX - 0.03, y: mcpY - 0.02, z: 0 };
  lm[10] = { x: mcpX - 0.03, y: mcpY - 0.07, z: 0 };
  lm[12] = { x: mcpX - 0.03, y: mcpY - 0.16, z: 0 };
  lm[14] = { x: mcpX - 0.06, y: mcpY - 0.06, z: 0 };
  lm[16] = { x: mcpX - 0.06, y: mcpY - 0.15, z: 0 };
  lm[18] = { x: mcpX - 0.09, y: mcpY - 0.05, z: 0 };
  lm[20] = { x: mcpX - 0.09, y: mcpY - 0.13, z: 0 };
  lm[4] = pinched ? { x: mcpX, y: mcpY - 0.14, z: 0 } : { x: mcpX + 0.12, y: mcpY - 0.02, z: 0 };
  return lm;
}

function mockRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height,
      width: rect.width, height: rect.height, x: rect.left, y: rect.top, toJSON: () => ({}),
    }),
  });
}

function pointerEvent(type: string, clientY: number, clientX?: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const props: Record<string, unknown> = { clientY, pointerId: 1, pointerType: "mouse", button: 0 };
  if (clientX !== undefined) props.clientX = clientX;
  for (const [k, v] of Object.entries(props)) Object.defineProperty(event, k, { value: v, configurable: true });
  return event;
}

function ControllerProbe({ onReady }: { onReady: (ctrl: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => { onReady(ctrl); }, [ctrl, onReady]);
  return null;
}

describe("LevelSelectScreen (r8.3)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 720 });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("renders 3 ribbons labeled Level 1/2/3 without the word Bab, with Level 1 open and 2-3 locked", () => {
    const { container } = render(
      <LevelSelectScreen
        entryHold={false}
        onSelectLevel={vi.fn()}
        isLevelUnlocked={(stage) => stage === 1}
        freshUnlockStage={null}
      />,
    );

    const frame = screen.getByTestId("r83-level-select-screen");
    expect(frame.getAttribute("data-ui")).toBe("r83");

    const card1 = screen.getByTestId("r83-level-card-1");
    const card2 = screen.getByTestId("r83-level-card-2");
    const card3 = screen.getByTestId("r83-level-card-3");

    expect(card1.getAttribute("aria-label")).toMatch(/^Level 1,/);
    expect(card2.getAttribute("aria-label")).toMatch(/^Level 2,.*, terkunci$/);
    expect(card3.getAttribute("aria-label")).toMatch(/^Level 3,.*, terkunci$/);

    expect(card1.dataset.state).toBe("open");
    expect(card2.dataset.state).toBe("locked");
    expect(card3.dataset.state).toBe("locked");

    expect(container.textContent).not.toMatch(/\bBab\b/i);
    for (const btn of [card1, card2, card3]) expect(btn.getAttribute("aria-label")).not.toMatch(/\bBab\b/i);
    expect(container.querySelector(".thumb-confirm")).toBeNull();
  });

  it("calls onSelectLevel with valid LevelDefinition when Level 1 is pulled past threshold", async () => {
    const onSelect = vi.fn();
    render(
      <LevelSelectScreen
        entryHold={false}
        onSelectLevel={onSelect}
        isLevelUnlocked={(stage) => stage === 1}
        freshUnlockStage={null}
      />,
    );

    const card1 = screen.getByTestId("r83-level-card-1");
    act(() => {
      card1.dispatchEvent(pointerEvent("pointerdown", 120));
      card1.dispatchEvent(pointerEvent("pointermove", 120 + NOTCH_PX * 2));
    });
    expect(card1.className).toContain("is-pulling");
    expect(card1.dataset.notch).toBe("2");

    act(() => { card1.dispatchEvent(pointerEvent("pointermove", 120 + ARM_THRESHOLD_PX + 10)); });
    expect(card1.className).toContain("is-armed");

    act(() => { card1.dispatchEvent(pointerEvent("pointerup", 120 + ARM_THRESHOLD_PX + 10)); });

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("auto-pulls and calls onSelectLevel on plain click, and stays inert when entryHold is true", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <LevelSelectScreen
        entryHold={true}
        onSelectLevel={onSelect}
        isLevelUnlocked={(stage) => stage === 1}
        freshUnlockStage={null}
      />,
    );

    fireEvent.click(screen.getByTestId("r83-level-card-1"));
    expect(onSelect).not.toHaveBeenCalled();

    rerender(
      <LevelSelectScreen
        entryHold={false}
        onSelectLevel={onSelect}
        isLevelUnlocked={(stage) => stage === 1}
        freshUnlockStage={null}
      />,
    );
    fireEvent.click(screen.getByTestId("r83-level-card-1"));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("rejects locked Level 2 pull, keeps onSelectLevel uncalled, and shows locked message", () => {
    const onSelect = vi.fn();
    render(
      <LevelSelectScreen
        entryHold={false}
        onSelectLevel={onSelect}
        isLevelUnlocked={(stage) => stage === 1}
        freshUnlockStage={null}
      />,
    );

    const card2 = screen.getByTestId("r83-level-card-2");
    act(() => {
      card2.dispatchEvent(pointerEvent("pointerdown", 120));
      card2.dispatchEvent(pointerEvent("pointermove", 340));
      card2.dispatchEvent(pointerEvent("pointerup", 340));
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("r83-level-status").textContent).toContain("Selesaikan Level 1 dulu");
  });

  it("supports virtual pinch-anywhere pull via NuiProvider/TestSource with 0 React commits per drag frame", async () => {
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const commits: string[] = [];
    const onSelect = vi.fn();

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <ControllerProbe onReady={(c) => { ctrl = c; }} />
        <Profiler id="r83-level-select-prof" onRender={(_id, phase) => { commits.push(phase); }}>
          <LevelSelectScreen
            entryHold={false}
            onSelectLevel={onSelect}
            isLevelUnlocked={(stage) => stage <= 2}
            completedStages={new Set([1])}
            freshUnlockStage={null}
          />
        </Profiler>
      </NuiProvider>,
    );

    const card1 = screen.getByTestId("r83-level-card-1");
    const card2 = screen.getByTestId("r83-level-card-2");
    const card3 = screen.getByTestId("r83-level-card-3");
    mockRect(card1, { left: 100, top: 80, width: 140, height: 270 });
    mockRect(card2, { left: 320, top: 80, width: 140, height: 270 });
    mockRect(card3, { left: 540, top: 80, width: 140, height: 178 });

    expect(card1.dataset.state).toBe("done");
    expect(card2.dataset.state).toBe("open");
    expect(card3.dataset.state).toBe("locked");

    act(() => {
      now = 50;
      ts.push({ t: now, x: 390, y: 500, inFrame: true, pinch: false });
      ctrl?.stepNow(now);
    });
    expect(card2.className).toContain("nui-lit");

    commits.length = 0;

    act(() => {
      now = 80;
      ts.push({ t: now, x: 390, y: 500, inFrame: true, pinch: true });
      for (let i = 1; i <= 6; i++) {
        now += 16;
        ts.push({ t: now, x: 390, y: 500 + i * 30, inFrame: true, pinch: true });
      }
      ctrl?.stepNow(now);
    });

    expect(commits).toHaveLength(0);
    expect(card2.className).toContain("is-armed");

    act(() => {
      now += 16;
      ts.push({ t: now, x: 390, y: 680, inFrame: true, pinch: false });
    });

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[1]);
  });

  it("supports keyboard ArrowRight/ArrowLeft and Enter to activate unlocked level", async () => {
    const onSelect = vi.fn();
    render(
      <LevelSelectScreen
        entryHold={false}
        onSelectLevel={onSelect}
        isLevelUnlocked={(stage) => stage <= 2}
        completedStages={new Set([1])}
        freshUnlockStage={null}
      />,
    );

    act(() => { fireEvent.keyDown(window, { key: "ArrowLeft" }); });
    expect(screen.getByTestId("r83-level-card-1").className).toContain("nui-lit");

    act(() => { fireEvent.keyDown(window, { key: "Enter" }); });
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("blocks DOM pointer pull and click on ribbons while handAttached is true, and resumes click after detach", async () => {
    const detector = new StubHandDetector();
    const ctrlRef: { current: NuiController | null } = { current: null };
    const onSelect = vi.fn();

    render(
      <NuiProvider>
        <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
        <LevelSelectScreen
          entryHold={false}
          onSelectLevel={onSelect}
          isLevelUnlocked={(stage) => stage === 1}
          freshUnlockStage={null}
        />
      </NuiProvider>,
    );

    act(() => {
      ctrlRef.current?.setHandDetector(detector);
    });
    expect(ctrlRef.current?.getStatus().handAttached).toBe(true);

    const card1 = screen.getByTestId("r83-level-card-1");
    const card2 = screen.getByTestId("r83-level-card-2");

    act(() => {
      card1.dispatchEvent(pointerEvent("pointerdown", 120));
      card1.dispatchEvent(pointerEvent("pointermove", 120 + ARM_THRESHOLD_PX + 20));
      card1.dispatchEvent(pointerEvent("pointerup", 120 + ARM_THRESHOLD_PX + 20));
    });
    expect(card1.className).not.toContain("is-pulling");
    expect(card1.className).not.toContain("is-armed");
    expect(card1.dataset.notch).toBeUndefined();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(card1);
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      card2.dispatchEvent(pointerEvent("pointerdown", 120));
      card2.dispatchEvent(pointerEvent("pointermove", 340));
      card2.dispatchEvent(pointerEvent("pointerup", 340));
    });
    fireEvent.click(card2);
    expect(screen.queryByTestId("r83-level-status-chip")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      ctrlRef.current?.setHandDetector(null);
    });
    expect(ctrlRef.current?.getStatus().handAttached).toBe(false);

    fireEvent.click(card1);
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("resumes full mouse pointer pull launch after detaching HandDetector", async () => {
    const detector = new StubHandDetector();
    const ctrlRef: { current: NuiController | null } = { current: null };
    const onSelect = vi.fn();

    render(
      <NuiProvider handDetector={detector}>
        <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
        <LevelSelectScreen
          entryHold={false}
          onSelectLevel={onSelect}
          isLevelUnlocked={(stage) => stage === 1}
          freshUnlockStage={null}
        />
      </NuiProvider>,
    );

    expect(ctrlRef.current?.getStatus().handAttached).toBe(true);
    const card1 = screen.getByTestId("r83-level-card-1");

    fireEvent.click(card1);
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      ctrlRef.current?.setHandDetector(null);
    });
    expect(ctrlRef.current?.getStatus().handAttached).toBe(false);

    act(() => {
      card1.dispatchEvent(pointerEvent("pointerdown", 120));
      card1.dispatchEvent(pointerEvent("pointermove", 120 + ARM_THRESHOLD_PX + 12));
    });
    expect(card1.className).toContain("is-pulling");
    expect(card1.className).toContain("is-armed");

    act(() => {
      card1.dispatchEvent(pointerEvent("pointerup", 120 + ARM_THRESHOLD_PX + 12));
    });

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("still performs NUI pinch pull via HandDetector when handAttached is true", async () => {
    let now = 100;
    const detector = new StubHandDetector();
    const ctrlRef: { current: NuiController | null } = { current: null };
    const onSelect = vi.fn();

    render(
      <NuiProvider clock={() => now} handDetector={detector}>
        <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
        <LevelSelectScreen
          entryHold={false}
          onSelectLevel={onSelect}
          isLevelUnlocked={(stage) => stage === 1}
          freshUnlockStage={null}
        />
      </NuiProvider>,
    );

    expect(ctrlRef.current?.getStatus().handAttached).toBe(true);

    const card1 = screen.getByTestId("r83-level-card-1");
    const card2 = screen.getByTestId("r83-level-card-2");
    const card3 = screen.getByTestId("r83-level-card-3");
    mockRect(card1, { left: 100, top: 80, width: 140, height: 270 });
    mockRect(card2, { left: 320, top: 80, width: 140, height: 178 });
    mockRect(card3, { left: 540, top: 80, width: 140, height: 178 });

    fireEvent.click(card1);
    expect(onSelect).not.toHaveBeenCalled();

    const emitHand = (mcpY: number, pinched: boolean, dtMs = 20) => {
      now += dtMs;
      detector.emit({ t: now, videoWidth: 1280, videoHeight: 720, hands: [makeHandLandmarks(0.78, mcpY, pinched)] });
    };

    act(() => {
      emitHand(0.25, false, 0);
      emitHand(0.25, false);
      ctrlRef.current?.stepNow(now);
    });
    expect(card1.className).toContain("nui-lit");

    act(() => {
      emitHand(0.25, true);
      emitHand(0.25, true);
      for (let i = 1; i <= 8; i++) emitHand(0.25 + i * 0.04, true);
      ctrlRef.current?.stepNow(now);
    });
    expect(card1.className).toContain("is-pulling");
    expect(card1.className).toContain("is-armed");

    act(() => {
      for (let i = 0; i < 6; i++) emitHand(0.57, false, 40);
      ctrlRef.current?.stepNow(now);
    });

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("lights up locked ribbons (.nui-lit) across horizontal camera zones just like sandbox bab.js", () => {
    let now = 100;
    const detector = new StubHandDetector();
    const ctrlRef: { current: NuiController | null } = { current: null };

    render(
      <NuiProvider clock={() => now} handDetector={detector}>
        <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
        <LevelSelectScreen
          entryHold={false}
          onSelectLevel={vi.fn()}
          isLevelUnlocked={(stage) => stage === 1}
          freshUnlockStage={null}
        />
      </NuiProvider>,
    );

    const card1 = screen.getByTestId("r83-level-card-1");
    const card2 = screen.getByTestId("r83-level-card-2");
    const card3 = screen.getByTestId("r83-level-card-3");
    mockRect(card1, { left: 414, top: 80, width: 108, height: 270 });
    mockRect(card2, { left: 586, top: 80, width: 108, height: 178 });
    mockRect(card3, { left: 758, top: 80, width: 108, height: 178 });

    const emitHandX = (mcpX: number) => {
      for (let i = 0; i < 15; i++) {
        now += 20;
        detector.emit({ t: now, videoWidth: 1280, videoHeight: 720, hands: [makeHandLandmarks(mcpX, 0.35, false)] });
      }
      ctrlRef.current?.stepNow(now);
    };

    // Right third of mirrored camera (mcpX=0.12 -> ~88% width) lights locked Level 3
    act(() => { emitHandX(0.12); });
    expect(card3.className).toContain("nui-lit");
    expect(card1.className).not.toContain("nui-lit");

    // Center third (mcpX=0.5 -> 50% width) lights locked Level 2
    act(() => { emitHandX(0.5); });
    expect(card2.className).toContain("nui-lit");
    expect(card3.className).not.toContain("nui-lit");

    // Left third (mcpX=0.88 -> ~12% width) lights open Level 1
    act(() => { emitHandX(0.88); });
    expect(card1.className).toContain("nui-lit");
    expect(card2.className).not.toContain("nui-lit");
  });

  it("never deadlocks unlocked Level 1 pull after tugging a locked ribbon and clearing status chip mid-pull", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let now = 100;
      const detector = new StubHandDetector();
      const ctrlRef: { current: NuiController | null } = { current: null };
      const onSelect = vi.fn();

      render(
        <NuiProvider clock={() => now} handDetector={detector}>
          <ControllerProbe onReady={(c) => { ctrlRef.current = c; }} />
          <LevelSelectScreen
            entryHold={false}
            onSelectLevel={onSelect}
            isLevelUnlocked={(stage) => stage === 1}
            freshUnlockStage={null}
          />
        </NuiProvider>,
      );

      const card1 = screen.getByTestId("r83-level-card-1");
      const card2 = screen.getByTestId("r83-level-card-2");
      const card3 = screen.getByTestId("r83-level-card-3");
      mockRect(card1, { left: 100, top: 80, width: 140, height: 270 });
      mockRect(card2, { left: 320, top: 80, width: 140, height: 178 });
      mockRect(card3, { left: 540, top: 80, width: 140, height: 178 });

      const emitHand = (mcpX: number, mcpY: number, pinched: boolean, dtMs = 20) => {
        now += dtMs;
        detector.emit({ t: now, videoWidth: 1280, videoHeight: 720, hands: [makeHandLandmarks(mcpX, mcpY, pinched)] });
      };

      // 1. Tug locked Level 2 -> triggers flashLocked + 2400ms status clear timer
      act(() => {
        for (let i = 0; i < 8; i++) emitHand(0.5, 0.25, false);
        ctrlRef.current?.stepNow(now);
        emitHand(0.5, 0.25, true);
        emitHand(0.5, 0.25, true);
        for (let i = 1; i <= 5; i++) emitHand(0.5, 0.25 + i * 0.04, true);
        for (let i = 0; i < 6; i++) emitHand(0.5, 0.45, false, 40);
        ctrlRef.current?.stepNow(now);
      });
      expect(screen.getByTestId("r83-level-status-chip")).toBeTruthy();

      // 2. Move left to unlocked Level 1 and begin pulling down
      act(() => {
        for (let i = 0; i < 15; i++) emitHand(0.85, 0.22, false);
        ctrlRef.current?.stepNow(now);
      });
      expect(card1.className).toContain("nui-lit");

      act(() => {
        emitHand(0.85, 0.22, true);
        emitHand(0.85, 0.22, true);
        for (let i = 1; i <= 3; i++) emitHand(0.85, 0.22 + i * 0.04, true);
        ctrlRef.current?.stepNow(now);
      });
      expect(card1.className).toContain("is-pulling");

      // 3. Status flash timer expires RIGHT IN THE MIDDLE of pulling Level 1 -> triggers re-render!
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      vi.useRealTimers();
      expect(screen.queryByTestId("r83-level-status-chip")).toBeNull();

      // 4. Continue pulling Level 1 past 4 notches and release -> must still be pulling, armed, and launch!
      act(() => {
        for (let i = 4; i <= 9; i++) emitHand(0.85, 0.22 + i * 0.04, true);
        ctrlRef.current?.stepNow(now);
      });
      expect(card1.className).toContain("is-pulling");
      expect(card1.className).toContain("is-armed");

      act(() => {
        for (let i = 0; i < 6; i++) emitHand(0.85, 0.58, false, 40);
        ctrlRef.current?.stepNow(now);
      });

      await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 3000 });
      expect(onSelect).toHaveBeenCalledWith(LEVELS[0]);
    } finally {
      vi.useRealTimers();
    }
  });
});
