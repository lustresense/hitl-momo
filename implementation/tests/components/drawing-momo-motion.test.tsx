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
};

function mockRect(right: number, top: number, left = 0, bottom = 300, width = 440, height = 276) {
  return { right, top, left, bottom, width, height, x: left, y: top, toJSON: () => ({}) };
}

function mockSectionRect(left = 0, top = 0, right = 1920, bottom = 1080) {
  return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) };
}

describe("DrawingScreen Momo companion (static anchor, short pencil lines)", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RealResizeObserver);
    RealResizeObserver._instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows Momo in the drawing phase with one short line", () => {
    render(<DrawingScreen {...defaultProps} phase="drawing" />);
    const companion = document.querySelector(".drawing-momo-companion");
    expect(companion).not.toBeNull();
    expect(companion?.getAttribute("data-phase")).toBe("drawing");
    expect(screen.getByText("Gambar dulu, ya.")).not.toBeNull();
    expect(document.querySelector(".momo-loader")).toBeNull();
  });

  it("predicting: Momo reads and a pencil loader shows; the Top-3 panel is not shown yet", () => {
    render(<DrawingScreen {...defaultProps} phase="predicting" />);
    expect(document.querySelector(".drawing-momo-companion")?.getAttribute("data-phase")).toBe("predicting");
    expect(screen.getByText("Aku baca dulu…")).not.toBeNull();
    expect(document.querySelector(".momo-loader")).not.toBeNull();
    expect(screen.queryByTestId("popup-evaluating")).toBeNull();
  });

  it("evaluating: Top-3 panel appears immediately beside the drawing; Momo stays put", () => {
    render(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    expect(document.querySelector(".drawing-momo-companion")?.getAttribute("data-phase")).toBe("evaluating");
    expect(screen.getByText("Ini tebakanku. Kamu yang memutuskan.")).not.toBeNull();
    expect(screen.getByTestId("popup-evaluating")).not.toBeNull();
    expect(document.querySelector(".momo-loader")).toBeNull();
  });

  it("prediction-error: Momo apologises in one line and the panel offers retry + redraw", () => {
    render(<DrawingScreen {...defaultProps} phase="prediction-error" errorDetail="Network timeout" />);
    expect(screen.getByText("Aku gagal membaca. Coba lagi?")).not.toBeNull();
    expect(screen.getByTestId("popup-error")).not.toBeNull();
    expect(screen.getByTestId("btn-retry-prediction")).not.toBeNull();
  });

  it("updates bubble message per phase via .momo-bubble", () => {
    const { rerender } = render(<DrawingScreen {...defaultProps} phase="drawing" />);
    expect(screen.getByText("Gambar dulu, ya.")).not.toBeNull();

    rerender(<DrawingScreen {...defaultProps} phase="predicting" />);
    expect(screen.getByText("Aku baca dulu…")).not.toBeNull();

    rerender(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    expect(screen.getByText("Ini tebakanku. Kamu yang memutuskan.")).not.toBeNull();

    rerender(<DrawingScreen {...defaultProps} phase="prediction-error" />);
    expect(screen.getByText("Aku gagal membaca. Coba lagi?")).not.toBeNull();
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

  it("Momo never offers decisions: its bubble is text only", () => {
    render(<DrawingScreen {...defaultProps} phase="evaluating" prediction={mockPrediction} />);
    const companion = document.querySelector(".drawing-momo-companion")!;
    expect(companion.querySelectorAll("button, input, select, textarea")).toHaveLength(0);
  });

  it("empty-drawing feedback tells what happened and what to do", () => {
    render(<DrawingScreen {...defaultProps} feedback="empty-drawing" phase="drawing" />);
    expect(screen.getByRole("alert").textContent).toBe("Kanvas masih kosong. Gambar dulu.");
    expect(screen.getByText("Kanvasnya masih kosong.")).not.toBeNull();
  });

  it("does not advertise unimplemented gesture hints (only pinch-to-draw exists)", () => {
    const { container } = render(<DrawingScreen {...defaultProps} phase="drawing" />);
    const text = (container.textContent ?? "") + [...container.querySelectorAll("[aria-label],[title]")].map((e) => `${e.getAttribute("aria-label")} ${e.getAttribute("title")}`).join(" ");
    expect(text).not.toMatch(/genggam|2 jari|3 jari|gesture|gestur/i);
  });
});

describe("DrawingScreen reduced CSS media query", () => {
  const css = () => fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf-8");

  it("has @media (prefers-reduced-motion: reduce) that switches animations off", () => {
    const cssContent = css();
    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
    const block = cssContent.slice(cssContent.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toContain("transition: none");
  });

  it("covers the Momo companion and the Top-3 bars inside the reduced-motion block", () => {
    const cssContent = css();
    const block = cssContent.slice(cssContent.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain(".drawing-momo-companion");
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation:\s*none/);
  });
});
