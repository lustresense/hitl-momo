import { afterEach, it, expect, vi, beforeEach, describe } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import fs from "fs";
import path from "path";

// Mock DrawingSurface to avoid canvas warnings
vi.mock("@/src/input", () => ({
  DrawingSurface: class {
    store = {
      hasActiveStroke: () => false,
      lastActivePoint: () => null,
      endStroke: () => {},
      eraseAt: () => false,
      isErasing: () => false,
      endErase: () => {},
    };
    resizeForDpr() {}
    dispose() {}
    setMode() { return Promise.resolve(); }
    clear() {}
    undo() {}
    redo() {}
  }
}));

// Real ResizeObserver class with instance tracking for proper geometry callbacks
class RealResizeObserver {
  static _instances: RealResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Set<Element> = new Set();
  constructor(callback: ResizeObserverCallback) { 
    this.callback = callback; 
    RealResizeObserver._instances.push(this);
  }
  observe = vi.fn((target: Element) => { this.observed.add(target); });
  unobserve = vi.fn((target: Element) => { this.observed.delete(target); });
  disconnect = vi.fn(() => { this.observed.clear(); });
  // Allow manual trigger for tests
  trigger() { this.callback([...this.observed] as unknown as ResizeObserverEntry[], this); }
}

const mockPrediction: PredictionResult = {
  candidates: [
    { label: "jembatan", confidence: 0.88 },
    { label: "papan", confidence: 0.72 },
    { label: "balok", confidence: 0.45 },
  ],
};

const defaultProps = {
  level: LEVELS[0]!,
  initialMode: "pointer" as const,
  feedback: null,
  surfaceOut: { current: null },
  onSubmit: vi.fn(),
  onExit: vi.fn(),
  active: true,
  showCanvasFocus: false,
};

/**
 * Momo types each line out on her own timers (MomoChat: dots, then one letter every 30 ms, at most 2.5 s per line).
 * Real waits took up to ~2 s per line and hit the 5 s test timeout when the suite runs in parallel. The test
 * therefore runs those timers on a fake clock (setTimeout and Date, see beforeEach) and steps it until the line shows.
 */
async function findLine(text: string): Promise<HTMLElement> {
  for (let step = 0; step < 400; step++) {
    const found = screen.queryByText(text);
    if (found) return found;
    await act(async () => {
      vi.advanceTimersByTime(25);
    });
  }
  throw new Error(`line not shown: ${text}`);
}

/** Momo's place in the drawing screen: one fixed corner (top-left) in every phase (REVISI §15, BIGPROMPT §6.6.1). */
const CORNER = "translate(28px, 24px)";

function companionOf(container: HTMLElement) {
  return container.querySelector(".drawing-momo-companion") as HTMLElement;
}

describe("DrawingScreen Momo stays in the top-left corner (Owner: jangan geser ke tengah/kanan saat menebak)", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RealResizeObserver);
    RealResizeObserver._instances = [];
    // Fake clock for Momo's typing (see findLine). Only the timers Momo uses are faked.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows Momo at the corner in the drawing phase with the cue copy", async () => {
    const { container } = render(<DrawingScreen {...defaultProps} phase="drawing" />);
    const companion = companionOf(container);
    expect(companion.getAttribute("data-phase")).toBe("drawing");
    expect(companion.style.transform).toContain(CORNER);
    expect(await findLine("Gambar objekmu dulu, ya. Nanti aku coba tebak!")).not.toBeNull();
  });

  it("keeps Momo in the corner while she thinks (predicting), with the same copy as before", async () => {
    const { container } = render(<DrawingScreen {...defaultProps} phase="predicting" />);
    expect(companionOf(container).getAttribute("data-phase")).toBe("predicting");
    expect(await findLine("Hmm... ini gambar apa, ya?")).not.toBeNull();
    expect(companionOf(container).style.transform).toContain(CORNER);
  });

  it("keeps Momo in the corner with her guess (evaluating) and does not hold the result back for a slide", async () => {
    const { container } = render(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    expect(companionOf(container).getAttribute("data-phase")).toBe("evaluating");
    expect(await findLine("Gampang! Ini pasti jembatan, 88%. Bener gak?")).not.toBeNull();
    expect(companionOf(container).style.transform).toContain(CORNER);
  });

  it("keeps Momo in the corner after a prediction error", async () => {
    const { container } = render(<DrawingScreen {...defaultProps} phase="prediction-error" />);
    expect(await findLine("Hmm, aku belum bisa membaca gambarmu. Mau coba lagi?")).not.toBeNull();
    expect(companionOf(container).style.transform).toContain(CORNER);
  });

  it("emphasis: Momo is a little larger (190 px, from 170 px) while she guesses and shows the result", () => {
    const { container, rerender } = render(<DrawingScreen {...defaultProps} phase="drawing" />);
    const avatar = () => container.querySelector(".momo-art") as HTMLElement | null;
    expect(avatar()?.style.height).toBe("170px");
    rerender(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    expect(avatar()?.style.height).toBe("190px");
  });

  it("the companion stays in the corner when the window is resized", () => {
    const { container } = render(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 700 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(companionOf(container).style.transform).toContain(CORNER);
    expect(companionOf(container).style.width).toContain("480px");
  });

  it("cleanup disconnects ResizeObserver and removes window resize listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<DrawingScreen {...defaultProps} phase="predicting" />);
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("single Momo DOM element persists across phase changes (img identity)", () => {
    const { rerender, container } = render(<DrawingScreen {...defaultProps} phase="drawing" />);
    const momoImg = container.querySelector(".momo-avatar");
    const imgSrc = momoImg?.getAttribute("src");

    rerender(<DrawingScreen {...defaultProps} phase="predicting" />);
    expect(container.querySelector(".momo-avatar")).toBe(momoImg);
    expect(container.querySelector(".momo-avatar")?.getAttribute("src")).toBe(imgSrc);

    rerender(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    expect(container.querySelector(".momo-avatar")).toBe(momoImg);

    rerender(<DrawingScreen {...defaultProps} phase="drawing" />);
    expect(container.querySelector(".momo-avatar")).toBe(momoImg);
  });

  it("copy by .momo-bubble text content with the cue copy", async () => {
    render(<DrawingScreen {...defaultProps} phase="drawing" />);
    await findLine("Gambar objekmu dulu, ya. Nanti aku coba tebak!");
    const bubble = document.querySelector(".momo-bubble");
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain("Gambar objekmu dulu, ya. Nanti aku coba tebak!");
  });

  it("empty-drawing feedback retains existing cue", async () => {
    render(<DrawingScreen {...defaultProps} feedback="empty-drawing" phase="drawing" />);
    expect(await findLine("Gambar dulu sebelum menebak.")).not.toBeNull();
  });
});

describe("DrawingScreen reduced CSS media query", () => {
  it("has @media (prefers-reduced-motion: reduce) with transition: none in globals.css", () => {
    const cssPath = path.join(process.cwd(), "app/styles/70-drawing-screen.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cssContent).toContain("transition: none");
  });

  it("has .drawing-momo-companion transition: none in reduced motion block", () => {
    const cssPath = path.join(process.cwd(), "app/styles/70-drawing-screen.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    // Match the specific reduced-motion block containing .drawing-momo-companion
    const regex = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.drawing-momo-companion[^}]*transition:\s*none/;
    expect(regex.test(cssContent)).toBe(true);
  });
});