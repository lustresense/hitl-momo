"use client";

import { useEffect, useRef, useState } from "react";
import { ERASER_RADIUS_PX } from "../core/constants";
import type { TimedPt } from "../sources/hand";
import { CanvasCursor, NuiRing, useNui, type CanvasToolKind } from "../react";

function toLocal(canvas: HTMLCanvasElement, x: number, y: number, t: number): TimedPt | null {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: x - r.left, y: y - r.top, t };
}

function insideCanvas(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  const r = canvas.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function eraseSegmentsAt(strokes: TimedPt[][], p: TimedPt, radius: number): TimedPt[][] {
  const out: TimedPt[][] = [];
  for (const stroke of strokes) {
    let run: TimedPt[] = [];
    for (const q of stroke) {
      if (Math.hypot(q.x - p.x, q.y - p.y) <= radius) {
        if (run.length >= 2) out.push(run);
        run = [];
      } else {
        run.push(q);
      }
    }
    if (run.length >= 2) out.push(run);
  }
  return out;
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: TimedPt[][], active: TimedPt[] | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1e2126";
  ctx.lineWidth = 3.4;

  const all = active ? [...strokes, active] : strokes;
  for (const s of all) {
    if (s.length < 2) continue;
    const p0 = s[0];
    if (!p0) continue;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < s.length - 1; i++) {
      const a = s[i];
      const b = s[i + 1];
      if (!a || !b) continue;
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const last = s[s.length - 1];
    if (last) ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

/**
 * Skenario G2 untuk Aturan D (kanvas mini):
 * - Kursor pensil / hapus 44 px aktif HANYA di mode ini.
 * - Sumber tangan memakai rollback 200 ms (`beginNib`) & potong ekor (`endNib`).
 * - Ring "Tebak Gambarku" mode `point` wajib ditunjuk.
 */
export function HarnessPanelD() {
  const controller = useNui();
  const [tool, setTool] = useState<CanvasToolKind>("pencil");
  const [pointFires, setPointFires] = useState(0);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<TimedPt[][]>([]);
  const activeRef = useRef<TimedPt[] | null>(null);
  const drawingRef = useRef(false);
  const toolRef = useRef<CanvasToolKind>(tool);
  toolRef.current = tool;

  useEffect(() => {
    controller.setCanvasMode(true);
    return () => {
      controller.setCanvasMode(false);
    };
  }, [controller]);

  useEffect(() => {
    let prevPinch = false;
    let activeSourceIsHand = false;

    return controller.subscribeSample((sample, chrome) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const inkPt = sample.nib ?? sample;

      if (sample.pinch && !prevPinch) {
        if (!chrome && insideCanvas(canvas, inkPt.x, inkPt.y)) {
          drawingRef.current = true;
          activeSourceIsHand = sample.source === "hand";
          const local = toLocal(canvas, inkPt.x, inkPt.y, sample.t);
          if (local) {
            if (toolRef.current === "eraser") {
              strokesRef.current = eraseSegmentsAt(strokesRef.current, local, ERASER_RADIUS_PX);
            } else if (activeSourceIsHand) {
              const hs = controller.getHandSource();
              const seeded = hs
                ? hs
                    .beginNib(sample.t)
                    .map((p) => toLocal(canvas, p.x, p.y, p.t))
                    .filter((p): p is TimedPt => p !== null)
                : [];
              activeRef.current = seeded.length > 0 ? seeded : [local];
            } else {
              activeRef.current = [local];
            }
            drawStrokes(canvas, strokesRef.current, activeRef.current);
          }
        }
      } else if (sample.pinch && prevPinch && drawingRef.current) {
        const local = toLocal(canvas, inkPt.x, inkPt.y, sample.t);
        if (local) {
          if (toolRef.current === "eraser") {
            strokesRef.current = eraseSegmentsAt(strokesRef.current, local, ERASER_RADIUS_PX);
          } else if (activeRef.current) {
            const last = activeRef.current[activeRef.current.length - 1];
            if (!last || Math.hypot(local.x - last.x, local.y - last.y) > 2.2) {
              activeRef.current.push(local);
            }
          }
          drawStrokes(canvas, strokesRef.current, activeRef.current);
        }
      } else if (!sample.pinch && prevPinch && drawingRef.current) {
        drawingRef.current = false;
        if (activeRef.current && activeRef.current.length >= 2) {
          const hs = controller.getHandSource();
          const finalStroke = activeSourceIsHand && hs ? hs.endNib(activeRef.current, sample.t) : activeRef.current;
          if (finalStroke.length >= 2) strokesRef.current.push(finalStroke);
        }
        activeRef.current = null;
        drawStrokes(canvas, strokesRef.current, null);
      }
      prevPinch = sample.pinch;
    });
  }, [controller]);

  const clearCanvas = () => {
    strokesRef.current = [];
    activeRef.current = null;
    if (canvasRef.current) drawStrokes(canvasRef.current, [], null);
  };

  return (
    <section data-testid="r83-harness-mode-d" style={{ display: "grid", gap: 14, justifyItems: "center", padding: 16 }}>
      <CanvasCursor tool={tool} paperRef={paperRef} />
      <p style={{ margin: 0, fontWeight: 700, textAlign: "center" }}>
        Aturan D Kanvas Mini: kursor pensil/hapus 44 px hanya tampil di mode ini; ring mode <code>point</code> harus
        ditunjuk.
      </p>
      <div data-nui-off="true" style={{ display: "flex", gap: 10 }}>
        <button type="button" data-testid="r83-tool-pencil" onClick={() => setTool("pencil")} aria-pressed={tool === "pencil"}>
          Pensil {tool === "pencil" ? "(aktif)" : ""}
        </button>
        <button type="button" data-testid="r83-tool-eraser" onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}>
          Hapus 44px {tool === "eraser" ? "(aktif)" : ""}
        </button>
        <button type="button" data-testid="r83-tool-clear" onClick={clearCanvas}>
          Bersihkan
        </button>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <div
          ref={paperRef}
          className="sk-wrap"
          data-testid="r83-mini-canvas-wrap"
          style={{
            position: "relative",
            width: 480,
            height: 260,
            background: "#fffaf0",
            border: "3px solid var(--nb-ink, #1d1d1b)",
            borderRadius: 16,
            overflow: "hidden",
            touchAction: "none",
          }}
        >
          <canvas ref={canvasRef} data-testid="r83-mini-canvas" style={{ width: "100%", height: "100%", display: "block" }} />
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <NuiRing
            label="Tebak Gambarku"
            holdMs={2000}
            mode="point"
            autoResetMs={600}
            testId="r83-ring-d-point"
            onFire={() => setPointFires((c) => c + 1)}
          />
          <span data-testid="r83-count-d">Konfirmasi Point: {pointFires}</span>
        </div>
      </div>
    </section>
  );
}
