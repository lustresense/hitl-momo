"use client";

import { useRef, useState } from "react";
import { DRAG_START_PX } from "../core";
import { useDragRelative, useFlick, useJoystick } from "../react";

export type PanelCMode = "joystick" | "drag";

export interface HarnessPanelCProps {
  mode: PanelCMode;
}

/**
 * Skenario G2 untuk Aturan C:
 * - Joystick: indikator axis ditulis lewat DOM ref (0 React commit/frame), tap lompat, sentil ke atas lompat.
 * - Drag relatif: kotak tarik ambang 12 px, posisi ditulis lewat DOM ref.
 */
export function HarnessPanelC({ mode }: HarnessPanelCProps) {
  const [tapJumps, setTapJumps] = useState(0);
  const [flickJumps, setFlickJumps] = useState(0);
  const [stickerFlicks, setStickerFlicks] = useState(0);
  const [dragCount, setDragCount] = useState(0);

  const axisBarRef = useRef<HTMLDivElement | null>(null);
  const axisLabelRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragLabelRef = useRef<HTMLSpanElement | null>(null);
  const boxPosRef = useRef({ x: 0, y: 0 });
  const grabStartRef = useRef({ x: 0, y: 0 });

  useJoystick({
    enabled: mode === "joystick",
    onAxis: (axis) => {
      if (axisBarRef.current) {
        const pct = ((axis + 1) / 2) * 100;
        axisBarRef.current.style.left = `${pct.toFixed(1)}%`;
      }
      if (axisLabelRef.current) {
        axisLabelRef.current.textContent = `axis: ${axis.toFixed(2)}`;
      }
    },
    onJump: (kind) => {
      if (kind === "tap") setTapJumps((c) => c + 1);
      else setFlickJumps((c) => c + 1);
    },
  });

  useFlick(() => setStickerFlicks((c) => c + 1), { enabled: mode === "joystick" });

  useDragRelative({
    enabled: mode === "drag",
    threshold: DRAG_START_PX,
    onStart: () => {
      grabStartRef.current = { ...boxPosRef.current };
      if (boxRef.current) boxRef.current.style.boxShadow = "0 0 0 4px var(--nb-orange, #ef7a37)";
    },
    onMove: (dx, dy) => {
      const nx = Math.max(-180, Math.min(180, grabStartRef.current.x + dx));
      const ny = Math.max(-90, Math.min(90, grabStartRef.current.y + dy));
      boxPosRef.current = { x: nx, y: ny };
      if (boxRef.current) boxRef.current.style.transform = `translate(${nx.toFixed(1)}px, ${ny.toFixed(1)}px)`;
      if (dragLabelRef.current) dragLabelRef.current.textContent = `dx=${Math.round(dx)} dy=${Math.round(dy)}`;
    },
    onEnd: () => {
      if (boxRef.current) boxRef.current.style.boxShadow = "";
      setDragCount((c) => c + 1);
    },
  });

  if (mode === "joystick") {
    return (
      <section data-testid="r83-harness-joystick" style={{ display: "grid", gap: 16, justifyItems: "center", padding: 24 }}>
        <p style={{ margin: 0, fontWeight: 700, textAlign: "center" }}>
          Aturan C Joystick: cubit lalu geser kiri/kanan (deadzone 14 px), tap (&lt;230 ms, &le;10 px) = lompat, sentil ke
          atas (&gt;40 px / 140 ms) = lompat.
        </p>
        <div
          style={{
            position: "relative",
            width: 320,
            height: 24,
            borderRadius: 999,
            background: "rgba(29,29,27,0.12)",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#1d1d1b" }} />
          <div
            ref={axisBarRef}
            data-testid="r83-joy-knob"
            style={{
              position: "absolute",
              top: 2,
              left: "50%",
              width: 20,
              height: 20,
              marginLeft: -10,
              borderRadius: "50%",
              background: "var(--nb-orange, #ef7a37)",
            }}
          />
        </div>
        <span ref={axisLabelRef} data-testid="r83-joy-axis" style={{ fontFamily: "monospace", fontWeight: 700 }}>
          axis: 0.00
        </span>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <span data-testid="r83-joy-tap">Lompat tap: {tapJumps}</span>
          <span data-testid="r83-joy-flick">Lompat sentil: {flickJumps}</span>
          <span data-testid="r83-sticker-flick">Sentil stiker (&gt;50 px): {stickerFlicks}</span>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="r83-harness-drag" style={{ display: "grid", gap: 16, justifyItems: "center", padding: 24 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>
        Aturan C Tarik Relatif (ambang {DRAG_START_PX} px): cubit di mana saja lalu geser untuk menggerakkan kotak.
      </p>
      <div
        style={{
          position: "relative",
          width: 440,
          height: 220,
          borderRadius: 16,
          border: "2px dashed rgba(29,29,27,0.3)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <div
          ref={boxRef}
          data-testid="r83-drag-box"
          style={{
            width: 84,
            height: 84,
            borderRadius: 14,
            background: "var(--nb-leaf, #c8d9a4)",
            border: "3px solid var(--nb-ink, #1d1d1b)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
          }}
        >
          Benda
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <span ref={dragLabelRef} data-testid="r83-drag-delta" style={{ fontFamily: "monospace" }}>
          dx=0 dy=0
        </span>
        <span data-testid="r83-drag-count">Selesai tarik: {dragCount}</span>
      </div>
    </section>
  );
}
