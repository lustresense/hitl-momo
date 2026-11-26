// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TUTORIAL_COPY, getTutorialCards } from "@/src/domain/copy/tutorial";
import {
  CARD_READ_MS,
  TUTORIAL_TOOLS_REQUIRED,
  TutorialScreen,
  cardPhase,
  computeTutorialLayout,
  createTutorialFlowState,
  tutorialFlowReducer,
} from "@/src/features/tutorial";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";

function NuiProbe({ onReady }: { onReady: (ctrl: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => {
    onReady(ctrl);
  }, [ctrl, onReady]);
  return null;
}

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

let gsapClock = 0;

async function advanceTimers(ms: number): Promise<void> {
  const stepMs = 50;
  for (let t = 0; t < ms; t += stepMs) {
    await act(async () => {
      vi.advanceTimersByTime(stepMs);
      gsapClock += stepMs / 1000;
      gsap.updateRoot(gsapClock);
      await Promise.resolve();
    });
  }
}

describe("tutorial-machine pure state & layout", () => {
  it("computes layout matching kartu.js:18-23 (46px top room, rowCentre - 10)", () => {
    const l = computeTutorialLayout(1280, 720);
    expect(l.gw).toBe(384);
    expect(l.pw).toBe(Math.round(384 * 1.6));
    expect(l.miniGap).toBe(62);
    expect(l.vh).toBe(720);
  });

  it("enforces CARD_READ_MS (3333) + practice before card unlocks, Card 2 needs no practice", () => {
    expect(CARD_READ_MS).toBe(3333);
    expect(TUTORIAL_TOOLS_REQUIRED).toBe(5);

    let s = createTutorialFlowState(0);
    s = tutorialFlowReducer(s, { type: "INTRO_TO_STRIP" });
    s = tutorialFlowReducer(s, { type: "DEAL_STARTED" });
    s = tutorialFlowReducer(s, { type: "CARD_OPENED", index: 0 });
    expect(cardPhase(s.gates[0])).toBe("explaining");

    // Stale read event before momo + practice cannot unlock
    s = tutorialFlowReducer(s, { type: "READ_DONE", index: 0 });
    expect(cardPhase(s.gates[0])).toBe("explaining");

    s = tutorialFlowReducer(s, { type: "MOMO_DONE", index: 0 });
    expect(cardPhase(s.gates[0])).toBe("practicing");

    s = tutorialFlowReducer(s, { type: "PRACTICE_DONE", index: 0 });
    expect(cardPhase(s.gates[0])).toBe("reading");

    s = tutorialFlowReducer(s, { type: "READ_DONE", index: 0 });
    expect(cardPhase(s.gates[0])).toBe("ackEligible");

    // Card 1 (safety) needs no practice
    s = tutorialFlowReducer(s, { type: "CARD_OPENED", index: 1 });
    expect(s.gates[1].practiceDone).toBe(true);
    s = tutorialFlowReducer(s, { type: "MOMO_DONE", index: 1 });
    expect(cardPhase(s.gates[1])).toBe("reading");
  });
});

describe("TutorialScreen r8.3 parity (P4)", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    gsapClock = gsap.globalTimeline.time();
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

  it("plays post-name mid greeting -> strip -> deal -> opens Card 1 walk & unlocks after flag + read time", async () => {
    const cards = getTutorialCards("Thinman");
    const onStart = vi.fn();
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <NuiProbe onReady={(c) => { ctrl = c; }} />
        <TutorialScreen
          studentName="Rani"
          characterDisplayName="Thinman"
          onStart={onStart}
          cameraSlot={<div data-testid="cam-pip" />}
        />
      </NuiProvider>,
    );

    expect(screen.getByTestId("r83-tutorial-screen").getAttribute("data-ui")).toBe("r83");
    expect(screen.getByTestId("cam-pip")).toBeTruthy();

    // During Momo intro at mid, she greets the named student; cards stay hidden before dealing
    await advanceTimers(1200);
    now += 1200;
    const bubble = document.querySelector(".r83-bubble");
    expect(bubble?.textContent).toContain("Halo,");
    expect(bubble?.textContent).toContain("Rani");
    expect(cards.map((c) => c.title).every((t) => Boolean(screen.getByText(t)))).toBe(true);

    // Finish greet (3000) + hide (220) + strip flight (950) + deal + open (2960) -> Card 0 active & walk live
    await advanceTimers(7800);
    now += 7800;
    expect(screen.getByTestId("r83-tut-walk")).toBeTruthy();
    expect(screen.getByTestId("r83-tut-hint").textContent).toBe(cards[0]!.hint);

    // Locked before walking to flag
    const thumb = screen.getAllByTestId("r83-tut-thumb")[0]!;
    expect(thumb.classList.contains("tut-thumb--locked")).toBe(true);

    // Walk Thinman to flag via ArrowRight steps
    for (let i = 0; i < 24; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }
    const winBadge = document.querySelector(".tut-win");
    expect(winBadge?.getAttribute("data-done")).toBe("true");

    // Wait Momo lines + CARD_READ_MS (3333) -> thumb unlocks to "Lanjut" (Rule A)
    await advanceTimers(11500);
    now += 11500;
    expect(thumb.classList.contains("tut-thumb--locked")).toBe(false);
    expect(thumb.textContent).toContain("Lanjut");

    // Pinch-hold anywhere (Rule A 1000ms) confirms Card 0
    mockRect(thumb, { left: 200, top: 500, width: 100, height: 110 });
    await act(async () => {
      now += 100;
      ts.push({ t: now, x: 50, y: 50, pinch: true });
      for (let i = 0; i < 22; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 50, y: 50, pinch: false });
    });

    // Transitions cleanly into Card 2 (safety) after close+pause+open
    await advanceTimers(3800);
    expect(screen.getByTestId("r83-tut-safety")).toBeTruthy();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("Card 2 shows Safe & Danger split page and Card 3 enforces all 5 canvas tools + Pilih level (no Bab) before onStart", async () => {
    const onStart = vi.fn();
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;

    // Render Card 2 (safety) directly
    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <NuiProbe onReady={(c) => { ctrl = c; }} />
        <TutorialScreen initialCard={1} characterDisplayName="Thinman" onStart={onStart} />
      </NuiProvider>,
    );
    await advanceTimers(3600);
    now += 3600;
    const safety = screen.getByTestId("r83-tut-safety");
    expect(safety.textContent).toContain(TUTORIAL_COPY.safeBadge);
    expect(safety.textContent).toContain(TUTORIAL_COPY.dangerBadge);

    cleanup();

    // Render Card 3 (canvas & 5 tools) directly
    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <NuiProbe onReady={(c) => { ctrl = c; }} />
        <TutorialScreen initialCard={2} characterDisplayName="Thinman" onStart={onStart} />
      </NuiProvider>,
    );
    await advanceTimers(3600);
    now += 3600;

    const canvas = screen.getByTestId("r83-tut-canvas");
    const toolbar = screen.getByTestId("r83-tut-toolbar");
    mockRect(canvas, { left: 100, top: 100, width: 400, height: 300 });
    expect(toolbar.textContent).toContain("Pensil");
    expect(toolbar.textContent).toContain("Hapus");
    expect(toolbar.textContent).toContain("Mundur");
    expect(toolbar.textContent).toContain("Maju");
    expect(toolbar.textContent).toContain("Bersihkan");
    expect(screen.getByTestId("r83-tutorial-screen").textContent).not.toMatch(/\bBab\b/i);

    const card3Thumb = screen.getAllByTestId("r83-tut-thumb")[2]!;
    expect(card3Thumb.classList.contains("tut-thumb--locked")).toBe(true);

    // 1. Draw stroke (pencil) via NUI Rule D TestSource
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 160, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 280, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 280, y: 200, pinch: false });
      ctrl?.stepNow(now);
    });

    // 2. Select eraser via NUI Rule B point-hold (1000ms) & partial erase over stroke via Rule D
    const eraserBtn = screen.getByTestId("r83-tool-eraser");
    mockRect(eraserBtn, { left: 20, top: 20, width: 64, height: 64 });
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 52, y: 52, pinch: true });
      for (let i = 0; i < 24; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 52, y: 52, pinch: false });
      ctrl?.stepNow(now);
    });

    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 210, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 240, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 240, y: 200, pinch: false });
      ctrl?.stepNow(now);
    });

    // 3. Undo ('z') & 4. Redo ('x') & 5. Clear via NUI Rule B point-hold (1000ms)
    fireEvent.keyDown(window, { key: "z" });
    fireEvent.keyDown(window, { key: "x" });
    const clearBtn = screen.getByTestId("r83-tool-clear");
    mockRect(clearBtn, { left: 20, top: 100, width: 64, height: 64 });
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 52, y: 132, pinch: true });
      for (let i = 0; i < 24; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 52, y: 132, pinch: false });
      ctrl?.stepNow(now);
    });

    // All 5 tool checkmarks must be marked used
    for (const id of ["pencil", "eraser", "undo", "redo", "clear"]) {
      const tick = screen.getByTestId(`r83-tool-${id}`).querySelector(".tut-tool__tick");
      expect(tick?.getAttribute("data-used"), id).toBe("true");
    }

    // Advance Momo speech + CARD_READ_MS (3333) -> thumb unlocks with "Pilih level"
    await advanceTimers(11500);
    now += 11500;
    expect(card3Thumb.classList.contains("tut-thumb--locked")).toBe(false);
    expect(card3Thumb.textContent).toContain("Pilih level");

    // Trigger Rule A pinch on final ring -> exit timeline -> onStart()
    mockRect(card3Thumb, { left: 200, top: 500, width: 100, height: 110 });
    await act(async () => {
      now += 100;
      ts.push({ t: now, x: 50, y: 50, pinch: true });
      for (let i = 0; i < 22; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 50, y: 50, pinch: false });
    });
    await advanceTimers(2500);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("Card 1 early completion cancels stale intro timers so intro lines never overwrite cardDoneMomoLines[0] and keeps CARD_READ_MS", async () => {
    const introLines = TUTORIAL_COPY.cardMomoLines(0, "Thinman").lines;
    const doneLines = TUTORIAL_COPY.cardDoneMomoLines(0, "Thinman");
    let now = 0;
    const ts = new TestSource(() => now);

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <TutorialScreen studentName="Rani" characterDisplayName="Thinman" onStart={vi.fn()} />
      </NuiProvider>,
    );

    await advanceTimers(9000);
    now += 9000;
    expect(screen.getByTestId("r83-tut-walk")).toBeTruthy();

    const bubble = document.querySelector(".r83-bubble");
    expect(bubble?.textContent).toBe(introLines[0]);

    // Finish Card 1 walk while intro line 1->2 timer is still pending
    for (let i = 0; i < 24; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }
    await advanceTimers(50);
    expect(bubble?.textContent).toBe(doneLines[0]);

    // Before CARD_READ_MS (3333ms) completes, thumb stays locked and doneLines[1] is shown (not overwritten by intro line 2)
    await advanceTimers(2500);
    const thumb = screen.getAllByTestId("r83-tut-thumb")[0]!;
    expect(thumb.classList.contains("tut-thumb--locked")).toBe(true);
    expect(bubble?.textContent).toBe(doneLines[1]);

    // Advance past when stale intro lines 1 & 2 (~2750ms / ~6350ms) would have fired
    for (const step of [1000, 1500, 2000, 2000]) {
      await advanceTimers(step);
      expect(bubble?.textContent).not.toBe(introLines[1]);
      expect(bubble?.textContent).not.toBe(introLines[2]);
      expect(bubble?.textContent).toBe(doneLines[1]);
    }

    expect(thumb.classList.contains("tut-thumb--locked")).toBe(false);
    expect(thumb.textContent).toContain("Lanjut");
  });

  it("Card 3 early completion cancels stale intro timers so intro lines never overwrite cardDoneMomoLines[2]", async () => {
    const introLines = TUTORIAL_COPY.cardMomoLines(2, "Thinman").lines;
    const doneLines = TUTORIAL_COPY.cardDoneMomoLines(2, "Thinman");
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <NuiProbe onReady={(c) => { ctrl = c; }} />
        <TutorialScreen initialCard={2} characterDisplayName="Thinman" onStart={vi.fn()} />
      </NuiProvider>,
    );

    await advanceTimers(3600);
    now += 3600;
    const bubble = document.querySelector(".r83-bubble");
    expect(bubble?.textContent).toBe(introLines[0]);

    const canvas = screen.getByTestId("r83-tut-canvas");
    mockRect(canvas, { left: 100, top: 100, width: 400, height: 300 });

    // 1. Pencil stroke
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 160, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 280, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 280, y: 200, pinch: false });
      ctrl?.stepNow(now);
    });

    // 2. Eraser + erase
    const eraserBtn = screen.getByTestId("r83-tool-eraser");
    mockRect(eraserBtn, { left: 20, top: 20, width: 64, height: 64 });
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 52, y: 52, pinch: true });
      for (let i = 0; i < 24; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 52, y: 52, pinch: false });
      ctrl?.stepNow(now);
    });
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 210, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 240, y: 200, pinch: true });
      ctrl?.stepNow(now);
      now += 30;
      ts.push({ t: now, x: 240, y: 200, pinch: false });
      ctrl?.stepNow(now);
    });

    // 3. Undo + 4. Redo + 5. Clear
    fireEvent.keyDown(window, { key: "z" });
    fireEvent.keyDown(window, { key: "x" });
    const clearBtn = screen.getByTestId("r83-tool-clear");
    mockRect(clearBtn, { left: 20, top: 100, width: 64, height: 64 });
    await act(async () => {
      now += 60;
      ts.push({ t: now, x: 52, y: 132, pinch: true });
      for (let i = 0; i < 24; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 52, y: 132, pinch: false });
      ctrl?.stepNow(now);
    });

    await advanceTimers(50);
    expect(bubble?.textContent).toBe(doneLines[0]);

    const card3Thumb = screen.getAllByTestId("r83-tut-thumb")[2]!;
    await advanceTimers(2000);
    expect(card3Thumb.classList.contains("tut-thumb--locked")).toBe(true);
    expect(bubble?.textContent).toBe(doneLines[1]);

    for (const step of [1500, 2000, 2500, 2500]) {
      await advanceTimers(step);
      expect(bubble?.textContent).not.toBe(introLines[1]);
      expect(bubble?.textContent).not.toBe(introLines[2]);
      expect(bubble?.textContent).toBe(doneLines[1]);
    }
    expect(card3Thumb.classList.contains("tut-thumb--locked")).toBe(false);
    expect(card3Thumb.textContent).toContain("Pilih level");
  });
});

describe("tutorial.css Polo Factory specificity parity", () => {
  it("scopes all rules under [data-ui=\"r83\"] and lowers specificity via :where(...) for 112-r83-paper.css overrides", () => {
    const tutCss = readFileSync(resolve(process.cwd(), "src/features/tutorial/tutorial.css"), "utf8");
    const paperCss = readFileSync(resolve(process.cwd(), "app/styles/112-r83-paper.css"), "utf8");
    const stripped = tutCss.replace(/\/\*[\s\S]*?\*\//g, "");

    const selectors = [...stripped.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel.startsWith('[data-ui="r83"]'), sel).toBe(true);
    }

    const extractRule = (css: string, selector: string) => {
      const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = css.match(new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, "m"));
      return m ? m[1]! : "";
    };

    // Polo Factory overrides exist in 112-r83-paper.css
    expect(paperCss).toContain('[data-ui="r83"] .tut-face,');
    expect(paperCss).toContain('[data-ui="r83"] .tut-play');
    expect(paperCss).toContain("border-radius: 20px 0 0 20px;");
    expect(paperCss).toContain("border-radius: 0 20px 20px 0;");
    expect(paperCss).toContain("width: 22px;");

    // Overridden base selectors in tutorial.css use :where(...) so 112-r83-paper.css wins regardless of import order
    const whereTargets = [
      '[data-ui="r83"] :where(.tut-face)',
      '[data-ui="r83"] :where(.tut-front__done)',
      '[data-ui="r83"] :where(.tut-back)',
      '[data-ui="r83"] :where(.tut-steps i)',
      '[data-ui="r83"] :where(.tut-steps i.is-now)',
      '[data-ui="r83"] :where(.tut-steps i.is-done)',
      '[data-ui="r83"] :where(.tut-back .tut-gesture)',
      '[data-ui="r83"] :where(.tut-play)',
      '[data-ui="r83"] :where(.tut-play)::before',
      '[data-ui="r83"] :where(.tut-handhint__hand)',
      '[data-ui="r83"] :where(.tut-win)',
      '[data-ui="r83"] :where(.tut-zone__badge)',
      '[data-ui="r83"] :where(.tut-draw__paper)',
    ];
    for (const sel of whereTargets) {
      expect(stripped, sel).toContain(sel);
    }

    // Equal-specificity base rules must not shadow Polo Factory properties
    expect(extractRule(stripped, '[data-ui="r83"] .tut-face')).not.toMatch(/border(?:-color|-radius)?\s*:|box-shadow\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-back')).not.toMatch(/border-radius\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-play')).not.toMatch(/border(?:-color|-radius|-left-width)?\s*:|box-shadow\s*:|background\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-play::before')).not.toMatch(/width\s*:|background\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-steps i')).not.toMatch(/border\s*:|background\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-back .tut-gesture')).not.toMatch(/border\s*:|background\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-handhint__hand')).not.toMatch(/border\s*:|background\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-front__done')).not.toMatch(/border\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-win')).not.toMatch(/border\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-zone__badge')).not.toMatch(/border\s*:/);
    expect(extractRule(stripped, '[data-ui="r83"] .tut-draw__paper')).not.toMatch(/border\s*:|background\s*:/);
  });
});
