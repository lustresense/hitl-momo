"use client";

import { useEffect, useRef } from "react";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { useNui } from "./NuiProvider";

const FROZEN_COLOR = "#9a968c";

export interface PipHandProps {
  /** "auto": pakai raw mirrored MCP5 saat sumber hand, atau viewport% saat mouse/test. */
  coordMode?: "auto" | "viewport" | "raw";
  testId?: string;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Indikator posisi tangan live (`nui-pip-hand`) di dalam kartu PIP kamera kiri-bawah.
 * Port 1:1 `hand.js:147-157` + `hand.css:30-32`. Update penuh lewat DOM ref di rAF (0 commit/frame).
 * Abu-abu saat `frozen` (tangan hilang < T_gap).
 */
export function PipHand({ coordMode = "auto", testId = "r83-pip-hand" }: PipHandProps) {
  const controller = useNui();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const openRef = useRef<HTMLSpanElement | null>(null);
  const pinchRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    return controller.subscribeFrame((frame) => {
      const el = rootRef.current;
      if (!el) return;

      const st = controller.getStatus();
      const handWaiting = st.handAttached && frame.source !== "hand";
      const visible = frame.simOn || frame.source === "hand" || handWaiting;
      if (!visible) {
        el.style.display = "none";
        return;
      }

      const pinched = frame.down || frame.key || frame.pinch;
      el.classList.toggle("is-pinch", pinched && !handWaiting);
      el.classList.toggle("is-frozen", frame.frozen);

      if (openRef.current) openRef.current.style.display = !pinched || handWaiting ? "block" : "none";
      if (pinchRef.current) pinchRef.current.style.display = pinched && !handWaiting ? "block" : "none";

      let nx = 0.5;
      let ny = 0.5;
      if (handWaiting || (frame.source === "hand" && !frame.rawHand)) {
        nx = 0.5;
        ny = 0.5;
      } else if ((coordMode === "raw" || (coordMode === "auto" && frame.source === "hand")) && frame.rawHand) {
        nx = clamp01(frame.rawHand.x);
        ny = clamp01(frame.rawHand.y);
      } else if (typeof window !== "undefined") {
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        nx = clamp01(frame.x / w);
        ny = clamp01(frame.y / h);
      }

      el.style.display = "block";
      el.style.left = `${(nx * 100).toFixed(1)}%`;
      el.style.top = `${(ny * 100).toFixed(1)}%`;
      if (handWaiting) {
        el.style.color = "";
        el.style.opacity = "0.45";
      } else if (frame.frozen) {
        el.style.color = FROZEN_COLOR;
        el.style.opacity = "0.65";
      } else {
        el.style.color = "";
        el.style.opacity = frame.inFrame ? "1" : "0.35";
      }
    });
  }, [controller, coordMode]);

  return (
    <span
      ref={rootRef}
      className="nui-pip-hand"
      aria-hidden="true"
      data-testid={testId}
      style={{
        position: "absolute",
        width: "26px",
        height: "26px",
        margin: "-13px 0 0 -13px",
        zIndex: 5,
        pointerEvents: "none",
        color: "#f1efe8",
        display: "none",
      }}
    >
      <span ref={openRef} style={{ display: "block" }}>
        <OwnerIcon name="gesture-open" size={26} />
      </span>
      <span ref={pinchRef} style={{ display: "none" }}>
        <OwnerIcon name="gesture-pinch" size={26} />
      </span>
    </span>
  );
}
