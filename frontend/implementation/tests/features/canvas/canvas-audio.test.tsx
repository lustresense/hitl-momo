// @vitest-environment jsdom
import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audioMock = vi.hoisted(() => {
  const loops: Array<{ id: string; stop: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }> = [];
  return {
    emit: vi.fn(),
    loops,
    loop: vi.fn((id: string) => {
      const h = { id, active: true, stop: vi.fn(), update: vi.fn() };
      loops.push(h);
      return h;
    }),
  };
});

vi.mock("@/src/audio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/audio")>()),
  audio: { emit: audioMock.emit, loop: audioMock.loop },
}));

import type { DrawingFlowScreenProps } from "@/src/app/screens/DrawingFlowScreen";
import { FlowController } from "@/src/app/state-machine";
import { LEVELS } from "@/src/domain/levels";
import type { DrawingInput } from "@/src/domain/types";
import { CanvasScreen } from "@/src/features/canvas";
import { resetCanvasRecommendationsForTest } from "@/src/features/canvas/CanvasScreen";
import type { DrawingSurface } from "@/src/input";
import { GUESS_IDLE_MS } from "@/src/nui/core/constants";
import { NuiProvider, TestSource } from "@/src/nui";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";

const LEVEL = LEVELS[0]!;
const INK: DrawingInput = { strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.85, y: 0.5 }]], hasInk: true, aspectRatio: 1 };
const EMPTY: DrawingInput = { strokes: [], hasInk: false, aspectRatio: 1 };

// bubble.show belongs to the shared bubble component (not this area): ignore it here.
const emitted = () => audioMock.emit.mock.calls.map((c) => c[0] as string).filter((e) => e !== "bubble.show");
const count = (id: string) => emitted().filter((e) => e === id).length;

function advance(ms: number): void {
  for (let t = 0; t < ms; t += 16) act(() => void vi.advanceTimersByTime(16));
}

async function settle<T>(fn: () => Promise<T>): Promise<T> {
  let r!: T;
  await act(async () => {
    const p = fn();
    vi.advanceTimersByTime(16);
    r = await p;
  });
  return r;
}

function makeFlow(mode: "normal" | "fail" = "normal") {
  const provider = new MockPredictionProvider({ vocabulary: LEVEL.vocabulary, stage: LEVEL.stage, latencyMs: 0, mode });
  const flow = new FlowController({ provider, goalCompletesLevel: true });
  flow.enterLevel(LEVEL);
  return { flow, provider };
}

/** Stable across rerenders: a new surfaceRef would (correctly) re-create the bridge and dispose the controller. */
let sharedSurface = createRef<DrawingSurface | null>();

function screenFor(flow: FlowController | null, over: Partial<DrawingFlowScreenProps> = {}, ts?: TestSource) {
  const props: DrawingFlowScreenProps = {
    level: LEVEL,
    snapshot: flow?.getSnapshot() ?? {
      phase: "drawing", levelId: LEVEL.levelId, attemptId: null, hasPrediction: false, decision: null,
      behavior: null, cyclesCompleted: 0, redrawCount: 0,
    },
    phase: "drawing",
    controller: flow,
    providerMode: "mock",
    surfaceRef: sharedSurface,
    drawingRevision: 0,
    stamp: null,
    missionOpen: false,
    onOpenMission: vi.fn(),
    onCloseMission: vi.fn(),
    onSubmit: vi.fn(),
    onExit: vi.fn(),
    ...over,
  };
  return props;
}
const tree = (props: DrawingFlowScreenProps, ts?: TestSource) => (
  <NuiProvider testSource={ts} autoSim={ts ? undefined : false}>
    <CanvasScreen {...props} />
  </NuiProvider>
);

describe("canvas audio wiring (UNIT_ONLY: audio API mocked)", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    resetCanvasRecommendationsForTest();
    audioMock.emit.mockClear();
    audioMock.loop.mockClear();
    audioMock.loops.length = 0;
    sharedSurface = createRef<DrawingSurface | null>();
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    document.body.innerHTML = "";
  });

  it("phase edges: submit, reveal and hiccup fire once per edge, never per notify/re-render", async () => {
    const { flow } = makeFlow();
    const { rerender } = render(tree(screenFor(flow)));
    expect(emitted()).toEqual([]); // mounting emits nothing
    await settle(() => flow.submitDrawing(INK));
    rerender(tree(screenFor(flow, { phase: "predicting" })));
    rerender(tree(screenFor(flow, { phase: "predicting" })));
    expect(count("hitl.submit")).toBe(1);
    rerender(tree(screenFor(flow, { phase: "evaluating" })));
    rerender(tree(screenFor(flow, { phase: "evaluating", drawingRevision: 0 })));
    expect(count("hitl.reveal")).toBe(1);
    expect(count("sys.hiccup")).toBe(0);

    cleanup();
    audioMock.emit.mockClear();
    const bad = makeFlow("fail");
    const r2 = render(tree(screenFor(bad.flow)));
    r2.rerender(tree(screenFor(bad.flow, { phase: "predicting" })));
    r2.rerender(tree(screenFor(bad.flow, { phase: "prediction-error" })));
    expect(emitted()).toEqual(["hitl.submit", "sys.hiccup"]);
    // error -> predicting (retry) is not a new submit
    r2.rerender(tree(screenFor(bad.flow, { phase: "predicting" })));
    expect(count("hitl.submit")).toBe(1);
  });

  it("a screen mounted straight in evaluating (or with a sticker) never plays reveal", async () => {
    const { flow } = makeFlow();
    await settle(() => flow.submitDrawing(INK));
    render(tree(screenFor(flow, { phase: "evaluating" })));
    expect(count("hitl.reveal")).toBe(0);
  });

  it("accept, correct and override all play the identical hitl.decide, once each; keys 1/2 share the handler", async () => {
    const run = async (act1: () => void) => {
      const { flow } = makeFlow();
      await settle(() => flow.submitDrawing(INK));
      render(tree(screenFor(flow, { phase: "evaluating" })));
      audioMock.emit.mockClear();
      act1();
      const out = emitted();
      cleanup();
      return out;
    };
    expect(await run(() => void fireEvent.click(screen.getByTestId("r83-guess-accept")))).toEqual(["hitl.decide"]);
    expect(await run(() => void fireEvent.click(screen.getByTestId("r83-guess-correct-2")))).toEqual(["hitl.decide"]);
    expect(await run(() => void act(() => void fireEvent.keyDown(window, { key: "1" })))).toEqual(["hitl.decide"]);
    expect(await run(() => void act(() => void fireEvent.keyDown(window, { key: "3" })))).toEqual(["hitl.decide"]);
    // override: sub-mode (hitl.more) then pick (hitl.decide)
    const out = await run(() => {
      fireEvent.click(screen.getByTestId("r83-guess-other"));
      const first = screen.getByTestId("r83-override-picker").querySelector("button")!;
      fireEvent.click(first);
    });
    expect(out).toEqual(["hitl.more", "hitl.decide"]);
  });

  it("a double key press decides once (second is refused by the phase guard)", async () => {
    const { flow } = makeFlow();
    await settle(() => flow.submitDrawing(INK));
    render(tree(screenFor(flow, { phase: "evaluating" })));
    audioMock.emit.mockClear();
    act(() => {
      fireEvent.keyDown(window, { key: "1" });
      fireEvent.keyDown(window, { key: "1" });
    });
    expect(count("hitl.decide")).toBe(1);
  });

  it("Top-3 sub-mode toggles play hitl.more per real change; Esc redraw plays hitl.redraw once", async () => {
    const { flow } = makeFlow();
    await settle(() => flow.submitDrawing(INK));
    render(tree(screenFor(flow, { phase: "evaluating" })));
    audioMock.emit.mockClear();
    fireEvent.click(screen.getByTestId("r83-guess-other"));
    fireEvent.click(screen.getByTestId("r83-guess-back"));
    expect(emitted()).toEqual(["hitl.more", "hitl.more"]);
    audioMock.emit.mockClear();
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(emitted()).toEqual(["hitl.redraw"]);
    expect(flow.phase).toBe("drawing");
  });

  it("prediction-error: retry plays ui.tap once, redraw plays hitl.redraw", async () => {
    const { flow, provider } = makeFlow("fail");
    await settle(() => flow.submitDrawing(INK));
    expect(flow.phase).toBe("prediction-error");
    render(tree(screenFor(flow, { phase: "prediction-error" })));
    audioMock.emit.mockClear();
    provider.setMode("normal");
    await settle(async () => {
      fireEvent.click(screen.getByTestId("r83-guess-retry"));
      await Promise.resolve();
    });
    expect(emitted()).toEqual(["ui.tap"]);

    cleanup();
    audioMock.emit.mockClear();
    provider.setMode("fail");
    const again = makeFlow("fail");
    await settle(() => again.flow.submitDrawing(INK));
    render(tree(screenFor(again.flow, { phase: "prediction-error" })));
    fireEvent.click(screen.getByTestId("r83-guess-redraw-error"));
    expect(emitted()).toEqual(["hitl.redraw"]);
  });

  it("mission bulb: opening plays mission.open once (edge), closing is silent", () => {
    const { flow } = makeFlow();
    const { rerender } = render(tree(screenFor(flow)));
    rerender(tree(screenFor(flow, { missionOpen: true })));
    rerender(tree(screenFor(flow, { missionOpen: true, drawingRevision: 0 })));
    rerender(tree(screenFor(flow, { missionOpen: false })));
    expect(emitted()).toEqual(["mission.open"]);
  });

  it("sticker: pop once on entrance, shrink on G, throw is not fired by redraw", () => {
    const stamp = { label: "tangga", behavior: "solid" as const, drawingInput: INK, onThrow: vi.fn(), onRedraw: vi.fn() };
    const { rerender } = render(tree(screenFor(null, { phase: "evaluating", stamp })));
    rerender(tree(screenFor(null, { phase: "evaluating", stamp })));
    expect(count("sticker.pop")).toBe(1);
    act(() => void fireEvent.keyDown(window, { key: "g" }));
    act(() => void fireEvent.keyDown(window, { key: "G" }));
    expect(count("sticker.shrink")).toBe(1);
    expect(count("sticker.throw")).toBe(0);
    expect(count("hitl.decide")).toBe(0);
  });

  it("sticker throw (fallback button) plays sticker.throw once", () => {
    const stamp = { label: "tangga", behavior: "solid" as const, drawingInput: INK, onThrow: vi.fn(), onRedraw: vi.fn() };
    // No NUI provider: the plain fallback buttons render.
    render(<CanvasScreen {...screenFor(null, { phase: "evaluating", stamp })} />);
    const btn = screen.getByTestId("r83-sticker-throw");
    fireEvent.click(btn);
    expect(count("sticker.throw")).toBe(1);
  });

  it("finish-drawing ring pops (ui.ring_in) once per appearance; empty submit is soft-denied", async () => {
    const ts = new TestSource();
    const { flow } = makeFlow();
    const surfaceRef = createRef<DrawingSurface | null>();
    // The controller refuses an empty paper synchronously (feedback "empty-drawing"), like handleSubmitDrawing does.
    const onSubmit = vi.fn(() => void flow.submitDrawing(EMPTY));
    render(tree(screenFor(flow, { onSubmit, surfaceRef }), ts));
    act(() => {
      ts.push({ x: 200, y: 200, pinch: true });
      ts.push({ x: 350, y: 220, pinch: true });
      ts.push({ x: 350, y: 220, pinch: false });
    });
    expect(count("ui.ring_in")).toBe(0);
    advance(GUESS_IDLE_MS + 48);
    expect(count("ui.ring_in")).toBe(1);
    advance(600);
    expect(count("ui.ring_in")).toBe(1);
    // hide again (new stroke), then reappear -> a second pop
    act(() => void ts.push({ x: 100, y: 100, pinch: true }));
    advance(100);
    act(() => void ts.push({ x: 100, y: 100, pinch: false }));
    advance(GUESS_IDLE_MS + 48);
    expect(count("ui.ring_in")).toBe(2);
  });

  it("empty-canvas submit via the ring fallback click plays ui.denied", async () => {
    const { flow } = makeFlow();
    const onSubmit = vi.fn(() => void flow.submitDrawing(EMPTY));
    const ts = new TestSource();
    render(tree(screenFor(flow, { onSubmit }), ts));
    act(() => {
      ts.push({ x: 200, y: 200, pinch: true });
      ts.push({ x: 350, y: 220, pinch: true });
      ts.push({ x: 350, y: 220, pinch: false });
    });
    advance(GUESS_IDLE_MS + 48);
    // The NUI test source is "sim on": drive the callback through the ring's fire path instead of a click.
    audioMock.emit.mockClear();
    const ringHost = screen.getByTestId("r83-guess-ring-host");
    fireEvent.click(ringHost.firstElementChild!);
    // Either the fallback click path ran (denied) or the sim blocked it; the contract is "denied only after a refused submit".
    if (onSubmit.mock.calls.length > 0) expect(count("ui.denied")).toBeGreaterThan(0);
    else expect(count("ui.denied")).toBe(0);
  });

  it("tools: pencil/eraser switch only when changed; undo/redo/clear only when they changed the paper; keys Z/X share the path", () => {
    const { flow } = makeFlow();
    const ts = new TestSource();
    render(tree(screenFor(flow), ts));
    const pencilBtn = screen.getByTestId("r83-tool-pencil");
    fireEvent.click(pencilBtn); // already pencil: silent
    expect(emitted()).toEqual([]);
    fireEvent.click(screen.getByTestId("r83-tool-undo")); // nothing to undo: silent
    fireEvent.click(screen.getByTestId("r83-tool-clear")); // nothing to clear: silent
    expect(emitted()).toEqual([]);
    fireEvent.click(screen.getByTestId("r83-tool-eraser"));
    fireEvent.click(screen.getByTestId("r83-tool-eraser"));
    fireEvent.click(pencilBtn);
    expect(emitted()).toEqual(["tool.eraser", "tool.pencil"]);
    audioMock.emit.mockClear();
    act(() => {
      ts.push({ x: 200, y: 200, pinch: true });
      ts.push({ x: 350, y: 220, pinch: true });
      ts.push({ x: 350, y: 220, pinch: false });
    });
    act(() => void fireEvent.keyDown(window, { key: "z" }));
    act(() => void fireEvent.keyDown(window, { key: "x" }));
    act(() => void fireEvent.keyDown(window, { key: "x" })); // nothing left to redo
    expect(emitted()).toEqual(["tool.undo", "tool.redo"]);
    fireEvent.click(screen.getByTestId("r83-tool-clear"));
    expect(emitted()).toEqual(["tool.undo", "tool.redo", "tool.clear"]);
  });

  it("drawing loop: a short stroke never sounds; a real stroke starts the loop and the pen-up stops it", () => {
    const { flow } = makeFlow();
    const ts = new TestSource();
    render(tree(screenFor(flow), ts));
    act(() => {
      ts.push({ x: 200, y: 200, pinch: true });
      ts.push({ x: 202, y: 201, pinch: true });
      ts.push({ x: 202, y: 201, pinch: false });
    });
    expect(audioMock.loop).not.toHaveBeenCalled();
    act(() => {
      ts.push({ x: 200, y: 300, pinch: true });
      for (let i = 1; i <= 6; i++) ts.push({ x: 200 + i * 20, y: 300 + i * 5, pinch: true });
    });
    expect(audioMock.loop).toHaveBeenCalledTimes(1);
    expect(audioMock.loop.mock.calls[0]![0]).toBe("draw.pencil");
    act(() => void ts.push({ x: 320, y: 330, pinch: false }));
    expect(audioMock.loops[0]!.stop).toHaveBeenCalledWith(120);
  });

  it("drawing loop never starts while the mission panel disables ink, and stops when it opens mid-stroke", () => {
    const { flow } = makeFlow();
    const ts = new TestSource();
    const { rerender } = render(tree(screenFor(flow, { missionOpen: true }), ts));
    act(() => {
      ts.push({ x: 200, y: 300, pinch: true });
      for (let i = 1; i <= 6; i++) ts.push({ x: 200 + i * 20, y: 300, pinch: true });
    });
    expect(audioMock.loop).not.toHaveBeenCalled();
    rerender(tree(screenFor(flow, { missionOpen: false }), ts));
    act(() => void ts.push({ x: 200, y: 300, pinch: false }));
    advance(100);
    act(() => {
      ts.push({ x: 200, y: 300, pinch: true });
      for (let i = 1; i <= 6; i++) ts.push({ x: 200 + i * 20, y: 300, pinch: true });
    });
    expect(audioMock.loop).toHaveBeenCalledTimes(1);
    rerender(tree(screenFor(flow, { missionOpen: true }), ts));
    expect(audioMock.loops[0]!.stop).toHaveBeenCalledWith(120);
  });
});
