// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Profiler, createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawingFlowScreenProps } from "@/src/app/screens/DrawingFlowScreen";
import { FlowController } from "@/src/app/state-machine";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import { LEVELS } from "@/src/domain/levels";
import type { DrawingInput } from "@/src/domain/types";
import { CanvasScreen, Toolbar, overrideCatalogFor, type CanvasToolId } from "@/src/features/canvas";
import { resetCanvasRecommendationsForTest } from "@/src/features/canvas/CanvasScreen";
import type { DrawingSurface } from "@/src/input";
import { GUESS_IDLE_MS, STAMP_THROW_MS } from "@/src/nui/core/constants";
import { NuiProvider, TestSource } from "@/src/nui";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";

const LEVEL = LEVELS[0]!;
const INK: DrawingInput = {
  strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.85, y: 0.5 }]],
  hasInk: true,
  aspectRatio: 1,
};

function mockRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...r,
      right: r.left + r.width,
      bottom: r.top + r.height,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    }),
  });
}

function advanceTimers(ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      vi.advanceTimersByTime(16);
    });
  }
}

async function resolveWithTimers<T>(fn: () => Promise<T>): Promise<T> {
  let result!: T;
  await act(async () => {
    const p = fn();
    vi.advanceTimersByTime(16);
    result = await p;
  });
  return result;
}

describe("CanvasScreen (P6 Kanvas, 5 Alat, Top-3 HITL, Stiker)", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    resetCanvasRecommendationsForTest();
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
        "Date",
      ],
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  function renderCanvasScreen(
    overrides: Partial<DrawingFlowScreenProps> = {},
    nuiOpts: { testSource?: TestSource } = {},
  ) {
    const provider = new MockPredictionProvider({
      vocabulary: LEVEL.vocabulary,
      stage: LEVEL.stage,
      latencyMs: 0,
    });
    const flow = new FlowController({ provider, goalCompletesLevel: true });
    flow.enterLevel(LEVEL);
    const surfaceRef = createRef<DrawingSurface | null>();
    const onSubmit = vi.fn();
    const onExit = vi.fn();
    const onOpenMission = vi.fn();
    const onCloseMission = vi.fn();

    const baseProps: DrawingFlowScreenProps = {
      level: LEVEL,
      snapshot: flow.getSnapshot(),
      phase: "drawing",
      controller: flow,
      providerMode: "mock",
      surfaceRef,
      drawingRevision: 0,
      stamp: null,
      missionOpen: false,
      onOpenMission,
      onCloseMission,
      onSubmit,
      onExit,
      ...overrides,
    };

    const result = render(
      <NuiProvider testSource={nuiOpts.testSource}>
        <CanvasScreen {...baseProps} />
      </NuiProvider>,
    );

    return {
      ...result,
      flow,
      provider,
      surfaceRef,
      onSubmit,
      onOpenMission,
      onCloseMission,
      baseProps,
    };
  }

  it("renders 5 tools with Owner icons, MissionBulb using 'Level' (not 'Bab'), and CanvasCursor", () => {
    const { onOpenMission } = renderCanvasScreen();

    expect(screen.getByTestId("r83-canvas-screen").getAttribute("data-ui")).toBe("r83");
    expect(screen.getByTestId("r83-canvas-cursor")).toBeTruthy();

    for (const id of ["pencil", "eraser", "undo", "redo", "clear"]) {
      const btn = screen.getByTestId(`r83-tool-${id}`);
      expect(btn).toBeTruthy();
      expect(btn.classList.contains("nui-target")).toBe(true);
      expect(btn.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByText("Pensil")).toBeTruthy();
    expect(screen.getByText("Hapus")).toBeTruthy();
    expect(screen.getByText("Mundur")).toBeTruthy();
    expect(screen.getByText("Maju")).toBeTruthy();
    expect(screen.getByText("Bersihkan")).toBeTruthy();

    // Bottom .r83-hint matches proto-html canvas.js:25 and is visible immediately
    const hint = screen.getByRole("note");
    expect(hint.classList.contains("r83-hint")).toBe(true);
    expect(hint.style.opacity).toBe("1");
    expect(hint.textContent).toBe(CANVAS_COPY.hint);

    // Mission bulb opens mission popover labeled "Level 1" (never "Bab")
    const bulb = screen.getByTestId("r83-mission-bulb");
    expect(bulb.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bulb);
    expect(onOpenMission).toHaveBeenCalledTimes(1);
    const pop = screen.getByTestId("r83-mission-popover");
    expect(pop.textContent).toContain("Level 1");
    expect(pop.textContent).not.toContain("Bab 1");
  });

  it("populates surfaceRef, shows GuessRing after 1000ms idle (O-14), never mumbles (O-13), and submits on 2000ms point hold", async () => {
    const ts = new TestSource();
    const { surfaceRef, onSubmit } = renderCanvasScreen({}, { testSource: ts });

    expect(surfaceRef.current).not.toBeNull();
    expect(surfaceRef.current!.toDrawingInput().hasInk).toBe(false);
    expect(screen.queryByTestId("r83-guess-ring")).toBeNull();

    // Draw stroke via TestSource
    act(() => {
      ts.push({ x: 200, y: 200, pinch: true });
      ts.push({ x: 350, y: 220, pinch: true });
      ts.push({ x: 350, y: 220, pinch: false });
    });
    expect(surfaceRef.current!.toDrawingInput().hasInk).toBe(true);
    // O-13: Momo keeps cue line without provisional guess/mumble before idle.
    expect(screen.getByText(CANVAS_COPY.momo.cue)).toBeTruthy();

    // O-14: GuessRing appears after GUESS_IDLE_MS (1000 ms)
    advanceTimers(GUESS_IDLE_MS + 48);
    const ring = screen.getByTestId("r83-guess-ring");
    expect(ring).toBeTruthy();
    expect(ring.textContent).toContain("Tebak Gambarku");
    expect(screen.getByText(/Sudah selesai\?/)).toBeTruthy();

    // Point-mode ring requires pointing directly on GuessRing and holding 2000 ms.
    mockRect(ring, { left: 420, top: 200, width: 96, height: 112 });
    advanceTimers(48);

    // Pinching on paper hides GuessRing until 1000ms idle again (never submits prematurely).
    act(() => {
      ts.push({ x: 100, y: 100, pinch: true });
    });
    advanceTimers(200);
    expect(screen.queryByTestId("r83-guess-ring")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    act(() => {
      ts.push({ x: 100, y: 100, pinch: false });
    });
    advanceTimers(GUESS_IDLE_MS + 48);
    const ringAgain = screen.getByTestId("r83-guess-ring");
    mockRect(ringAgain, { left: 420, top: 200, width: 96, height: 112 });
    advanceTimers(48);

    // Pointing directly on GuessRing and holding 2000 ms submits once.
    act(() => {
      ts.push({ x: 460, y: 250, pinch: true });
    });
    advanceTimers(2100);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("evaluating phase: shows provider Top-3, Mock provenance without 'Demo', keyboard 1-3, and Override catalog minus Top-3", async () => {
    const provider = new MockPredictionProvider({
      vocabulary: LEVEL.vocabulary,
      stage: LEVEL.stage,
      latencyMs: 0,
    });
    const flow = new FlowController({ provider, goalCompletesLevel: true });
    flow.enterLevel(LEVEL);
    await resolveWithTimers(() => flow.submitDrawing(INK));
    const top3 = flow.prediction!.candidates;
    const expectedOverride = overrideCatalogFor(LEVEL, top3);

    render(
      <NuiProvider>
        <CanvasScreen
          level={LEVEL}
          snapshot={flow.getSnapshot()}
          phase="evaluating"
          controller={flow}
          providerMode="mock"
          surfaceRef={createRef<DrawingSurface | null>()}
          drawingRevision={0}
          missionOpen={false}
          onOpenMission={vi.fn()}
          onCloseMission={vi.fn()}
          onSubmit={vi.fn()}
          onExit={vi.fn()}
        />
      </NuiProvider>,
    );

    const prov = screen.getByTestId("r83-prediction-source");
    expect(prov.textContent).toBe(CANVAS_COPY.guess.provenance.mock);
    expect(prov.textContent?.toLowerCase()).not.toContain("demo");

    // Top-3 labels & confidences from provider
    expect(screen.getByTestId("r83-guess-accept").textContent).toContain("86%");
    expect(screen.getByTestId("r83-guess-correct-2").textContent).toContain("9%");
    expect(screen.getByTestId("r83-guess-correct-3").textContent).toContain("5%");

    // Keyboard shortcut '2' -> decideCorrect(2)
    const spyCorrect = vi.spyOn(flow, "decideCorrect");
    act(() => {
      fireEvent.keyDown(window, { key: "2" });
    });
    expect(spyCorrect).toHaveBeenCalledWith(2);

    // Re-enter evaluating on a fresh mount with autoSim={false} to test Override catalog & Back/Redraw
    cleanup();
    const flow2 = new FlowController({ provider, goalCompletesLevel: true });
    flow2.enterLevel(LEVEL);
    await resolveWithTimers(() => flow2.submitDrawing(INK));
    const spyOverride = vi.spyOn(flow2, "decideOverride");

    render(
      <NuiProvider autoSim={false}>
        <CanvasScreen
          level={LEVEL}
          snapshot={flow2.getSnapshot()}
          phase="evaluating"
          controller={flow2}
          providerMode="mock"
          surfaceRef={createRef<DrawingSurface | null>()}
          drawingRevision={1}
          missionOpen={false}
          onOpenMission={vi.fn()}
          onCloseMission={vi.fn()}
          onSubmit={vi.fn()}
          onExit={vi.fn()}
        />
      </NuiProvider>,
    );

    fireEvent.click(screen.getByTestId("r83-guess-other"));
    const picker = screen.getByTestId("r83-override-picker");
    expect(picker.textContent).toContain("Benda lain di level ini:");
    for (const c of top3) {
      expect(screen.queryByTestId(`r83-override-${c.label}`)).toBeNull();
    }
    expect(screen.getByTestId(`r83-override-${expectedOverride[0]!.labelId}`)).toBeTruthy();

    // Kembali returns to Top-3
    fireEvent.click(screen.getByTestId("r83-guess-back"));
    expect(screen.queryByTestId("r83-override-picker")).toBeNull();

    // Open again and pick override
    fireEvent.click(screen.getByTestId("r83-guess-other"));
    fireEvent.click(screen.getByTestId(`r83-override-${expectedOverride[0]!.labelId}`));
    expect(spyOverride).toHaveBeenCalledWith(expectedOverride[0]!.labelId);
  });

  it("prediction-error phase: retries prediction and recovers to drawing on redraw", async () => {
    const provider = new MockPredictionProvider({
      vocabulary: LEVEL.vocabulary,
      stage: LEVEL.stage,
      mode: "fail",
      latencyMs: 0,
    });
    const flow = new FlowController({ provider, goalCompletesLevel: true });
    flow.enterLevel(LEVEL);
    await resolveWithTimers(() => flow.submitDrawing(INK));
    expect(flow.phase).toBe("prediction-error");

    const retrySpy = vi.spyOn(flow, "retryPrediction");

    const { rerender } = render(
      <NuiProvider autoSim={false}>
        <CanvasScreen
          level={LEVEL}
          snapshot={flow.getSnapshot()}
          phase="prediction-error"
          controller={flow}
          providerMode="mock"
          surfaceRef={createRef<DrawingSurface | null>()}
          drawingRevision={0}
          missionOpen={false}
          onOpenMission={vi.fn()}
          onCloseMission={vi.fn()}
          onSubmit={vi.fn()}
          onExit={vi.fn()}
        />
      </NuiProvider>,
    );

    expect(screen.getByTestId("r83-guess-error")).toBeTruthy();
    provider.setMode("normal");
    await resolveWithTimers(async () => {
      fireEvent.click(screen.getByTestId("r83-guess-retry"));
      await Promise.resolve();
    });
    expect(retrySpy).toHaveBeenCalledTimes(1);
    expect(flow.phase).toBe("evaluating");

    // Test redrawFromError
    provider.setMode("fail");
    const flowErr = new FlowController({ provider, goalCompletesLevel: true });
    flowErr.enterLevel(LEVEL);
    await resolveWithTimers(() => flowErr.submitDrawing(INK));
    const redrawErrSpy = vi.spyOn(flowErr, "redrawFromError");

    rerender(
      <NuiProvider autoSim={false}>
        <CanvasScreen
          level={LEVEL}
          snapshot={flowErr.getSnapshot()}
          phase="prediction-error"
          controller={flowErr}
          providerMode="mock"
          surfaceRef={createRef<DrawingSurface | null>()}
          drawingRevision={1}
          missionOpen={false}
          onOpenMission={vi.fn()}
          onCloseMission={vi.fn()}
          onSubmit={vi.fn()}
          onExit={vi.fn()}
        />
      </NuiProvider>,
    );
    fireEvent.click(screen.getByTestId("r83-guess-redraw-error"));
    expect(redrawErrSpy).toHaveBeenCalledTimes(1);
    expect(flowErr.phase).toBe("drawing");
  });

  it("sticker stage: upward flick (50px/160ms) triggers throw after 1200ms and G/ring triggers Gambar lagi", () => {
    const ts = new TestSource();
    const onThrow = vi.fn();
    const onRedraw = vi.fn();

    const { rerender } = renderCanvasScreen(
      {
        phase: "evaluating",
        stamp: {
          label: "tangga",
          behavior: "solid",
          drawingInput: INK,
          onThrow,
          onRedraw,
        },
      },
      { testSource: ts },
    );

    expect(screen.getByTestId("r83-sticker")).toBeTruthy();
    expect(screen.getByTestId("r83-sticker-throw").textContent).toContain("Lempar");
    expect(screen.getByTestId("r83-sticker-redraw").textContent).toContain("Gambar lagi");

    // Upward flick > 50 px within 160 ms (down + move start + move up)
    act(() => {
      ts.push({ x: 400, y: 400, pinch: true });
    });
    advanceTimers(32);
    act(() => {
      ts.push({ x: 400, y: 400, pinch: true });
    });
    advanceTimers(48);
    act(() => {
      ts.push({ x: 400, y: 330, pinch: true });
      ts.push({ x: 400, y: 330, pinch: false });
    });

    expect(screen.queryByTestId("r83-sticker-rings")).toBeNull();
    expect(onThrow).not.toHaveBeenCalled();
    advanceTimers(STAMP_THROW_MS);
    expect(onThrow).toHaveBeenCalledTimes(1);

    // Fresh sticker for Gambar lagi via 'g' key
    const onRedraw2 = vi.fn();
    rerender(
      <NuiProvider testSource={ts}>
        <CanvasScreen
          level={LEVEL}
          snapshot={{
            phase: "falling",
            levelId: LEVEL.levelId,
            attemptId: "att-2",
            hasPrediction: true,
            decision: { type: "accept", finalLabel: "tangga", sourceRank: 1 },
            behavior: "solid",
            cyclesCompleted: 0,
            redrawCount: 0,
          }}
          phase="evaluating"
          controller={null}
          providerMode="mock"
          surfaceRef={createRef<DrawingSurface | null>()}
          drawingRevision={1}
          stamp={{
            label: "jembatan",
            behavior: "solid",
            drawingInput: INK,
            onThrow: vi.fn(),
            onRedraw: onRedraw2,
          }}
          missionOpen={false}
          onOpenMission={vi.fn()}
          onCloseMission={vi.fn()}
          onSubmit={vi.fn()}
          onExit={vi.fn()}
        />
      </NuiProvider>,
    );
    fireEvent.keyDown(window, { key: "g" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onRedraw2).toHaveBeenCalledTimes(1);
  });

  it("Toolbar supports mode:'point' + onToolUsed callback (P4 Card 3 reuse) and 0 React commits during cursor motion", async () => {
    const ts = new TestSource();
    const onSelectTool = vi.fn();
    const onToolUsed = vi.fn();
    const used: CanvasToolId[] = [];

    render(
      <NuiProvider testSource={ts}>
        <Toolbar
          activeTool="pencil"
          usedTools={used}
          onSelectTool={onSelectTool}
          onToolUsed={onToolUsed}
        />
      </NuiProvider>,
    );

    const eraserBtn = screen.getByTestId("r83-tool-eraser");
    mockRect(eraserBtn, { left: 100, top: 200, width: 68, height: 68 });
    advanceTimers(48);

    // Pinch outside eraser button does not trigger point-mode tool
    act(() => {
      ts.push({ x: 10, y: 10, pinch: true });
    });
    advanceTimers(1200);
    expect(onSelectTool).not.toHaveBeenCalled();

    // Release, then pinch directly on eraser button for 1000 ms
    act(() => {
      ts.push({ x: 10, y: 10, pinch: false });
    });
    advanceTimers(48);
    act(() => {
      ts.push({ x: 130, y: 230, pinch: true });
    });
    advanceTimers(1100);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSelectTool).toHaveBeenCalledWith("eraser");
    expect(onToolUsed).toHaveBeenCalledWith("eraser");

    cleanup();

    // Zero React commits across 20 cursor-move frames on CanvasScreen
    const commits: string[] = [];
    const ts2 = new TestSource();
    const provider = new MockPredictionProvider({
      vocabulary: LEVEL.vocabulary,
      stage: LEVEL.stage,
      latencyMs: 0,
    });
    const flow = new FlowController({ provider, goalCompletesLevel: true });
    flow.enterLevel(LEVEL);

    render(
      <Profiler id="r83-canvas-prof" onRender={(_id, phase) => commits.push(phase)}>
        <NuiProvider testSource={ts2}>
          <CanvasScreen
            level={LEVEL}
            snapshot={flow.getSnapshot()}
            phase="drawing"
            controller={flow}
            providerMode="mock"
            surfaceRef={createRef<DrawingSurface | null>()}
            drawingRevision={0}
            missionOpen={false}
            onOpenMission={vi.fn()}
            onCloseMission={vi.fn()}
            onSubmit={vi.fn()}
            onExit={vi.fn()}
          />
        </NuiProvider>
      </Profiler>,
    );

    act(() => {
      ts2.push({ x: 200, y: 200, pinch: false });
    });
    commits.length = 0;

    act(() => {
      for (let i = 1; i <= 20; i++) {
        ts2.push({ x: 200 + i * 5, y: 200 + i * 2, pinch: false });
        vi.advanceTimersByTime(16);
      }
    });
    expect(commits).toHaveLength(0);
  });

  it("canvas.css is 100% scoped under [data-ui='r83'] with no mix-blend-mode or backdrop-filter", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/features/canvas/canvas.css"),
      "utf8",
    );
    expect(css).not.toMatch(/mix-blend-mode\s*:/i);
    expect(css).not.toMatch(/backdrop-filter\s*:/i);
    expect(css).toContain('[data-ui="r83"] :where(.nb-iconbtn--accent)');
    expect(css).toContain('[data-ui="r83"] .t3-row.sel');
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const headers = [...clean.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1]!.trim())
      .filter((h) => Boolean(h) && !/^@(media|supports|layer)\b/i.test(h));
    expect(headers.length).toBeGreaterThan(0);
    for (const block of headers) {
      for (const sel of block.split(",").map((s) => s.trim()).filter(Boolean)) {
        expect(sel).toContain('[data-ui="r83"]');
      }
    }
  });

  it("shows per-level recommendation chips in Momo bubble on first canvas entry, hides after ink/2nd visit, and shows chips in MissionBulb", () => {
    const ts = new TestSource();
    const { rerender, baseProps } = renderCanvasScreen({ level: LEVELS[0]!, drawingRevision: 0 }, { testSource: ts });

    const rec = screen.getByTestId("r83-canvas-rec-chips");
    expect(rec.textContent).toContain("Tangga");
    expect(rec.textContent).toContain("Jembatan");
    expect(rec.textContent).toContain("Bangku");
    expect(rec.textContent).toContain("Papan luncur");

    const missionChips = screen.getByTestId("r83-mission-chips");
    expect(missionChips.querySelectorAll("svg").length).toBeGreaterThanOrEqual(4);

    // Drawing first stroke dismisses Momo's intro recommendation chips
    act(() => {
      ts.push({ x: 200, y: 200, pinch: true });
      ts.push({ x: 320, y: 210, pinch: true });
      ts.push({ x: 320, y: 210, pinch: false });
    });
    expect(screen.queryByTestId("r83-canvas-rec-chips")).toBeNull();

    // Returning for 2nd drawing in same level does not repeat intro chips
    rerender(
      <NuiProvider testSource={ts}>
        <CanvasScreen {...baseProps} drawingRevision={1} />
      </NuiProvider>,
    );
    expect(screen.queryByTestId("r83-canvas-rec-chips")).toBeNull();

    // Entering Level 2 shows Level 2's own recommended objects
    rerender(
      <NuiProvider testSource={ts}>
        <CanvasScreen {...baseProps} level={LEVELS[1]!} drawingRevision={0} />
      </NuiProvider>,
    );
    const rec2 = screen.getByTestId("r83-canvas-rec-chips");
    expect(rec2.textContent).toContain("Anak tangga");
    expect(rec2.textContent).toContain("Meja");
  });
});
