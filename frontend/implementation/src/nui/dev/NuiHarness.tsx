"use client";

import { Profiler, useCallback, useRef, useState, type ProfilerOnRenderCallback } from "react";
import { env } from "@/src/config/env";
import { HandLegend, NuiProvider, useOptionalNui } from "../react";
import { HarnessCameraPip } from "./HarnessCameraPip";
import { HarnessPanelAB } from "./HarnessPanelAB";
import { HarnessPanelC } from "./HarnessPanelC";
import { HarnessPanelD } from "./HarnessPanelD";

type ScenarioId = "A" | "B" | "joystick" | "drag" | "D" | "latch";

const SCENARIOS: readonly { id: ScenarioId; label: string }[] = [
  { id: "A", label: "1. Mode A (1 Target)" },
  { id: "B", label: "2. Mode B (2 Target)" },
  { id: "joystick", label: "3. Mode C Joystick" },
  { id: "drag", label: "4. Mode C Drag" },
  { id: "D", label: "5. Mode D Kanvas" },
  { id: "latch", label: "6. Latch & Keyboard" },
];

export interface NuiHarnessProps {
  initialScenario?: ScenarioId;
  /** Pasang `window.__skbNui` saat berdiri sendiri (default `env.testHooksEnabled`). */
  testHooks?: boolean;
}

/**
 * Harness pengembangan NUI r8.3 (`/dev/nui`) untuk uji Lampiran D / G2 webcam Owner.
 * Membungkus panggung interaksi di dalam React `<Profiler>` untuk membuktikan
 * 0 React commit per frame selama kursor bergerak.
 */
export function NuiHarness({ initialScenario = "A", testHooks = env.testHooksEnabled }: NuiHarnessProps) {
  const hasParentProvider = useOptionalNui() !== null;
  const [scenario, setScenario] = useState<ScenarioId>(initialScenario);
  const commitsRef = useRef(0);
  const counterElRef = useRef<HTMLSpanElement | null>(null);

  const onProfilerRender = useCallback<ProfilerOnRenderCallback>((_id, phase) => {
    commitsRef.current += 1;
    if (counterElRef.current) {
      counterElRef.current.textContent = `React commits: ${commitsRef.current} (terakhir: ${phase})`;
    }
  }, []);

  const resetProfilerCounter = () => {
    commitsRef.current = 0;
    if (counterElRef.current) {
      counterElRef.current.textContent = "React commits: 0 (gerakkan kursor untuk cek 0 commit/frame)";
    }
  };

  const content = (
    <main
      data-ui="r83"
      data-testid="r83-nui-harness"
      style={{
        minHeight: "100vh",
        height: "auto",
        overflowY: "auto",
        padding: "20px 24px 160px",
        background: "var(--nb-paper, #fffaf0)",
        color: "var(--nb-ink, #1d1d1b)",
        fontFamily: '"Hanken Grotesk", system-ui, sans-serif',
        display: "grid",
        alignContent: "start",
        gap: 16,
      }}
    >
      <header data-nui-off="true" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>NUI r8.3 Harness (G2 / Lampiran D)</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span
              ref={counterElRef}
              data-testid="r83-profiler-commits"
              style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}
            >
              React commits: 0
            </span>
            <button type="button" data-testid="r83-profiler-reset" onClick={resetProfilerCounter}>
              Reset Profiler
            </button>
          </div>
        </div>

        <nav aria-label="Pilih skenario NUI" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`r83-tab-${s.id}`}
              aria-pressed={scenario === s.id}
              onClick={() => setScenario(s.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                border: "2px solid #1d1d1b",
                background: scenario === s.id ? "var(--nb-orange, #ef7a37)" : "#fff",
                fontWeight: 700,
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <HarnessCameraPip />
      </header>

      <Profiler id="r83-nui-stage" onRender={onProfilerRender}>
        <div
          data-testid="r83-harness-stage"
          style={{
            minHeight: 340,
            borderRadius: 20,
            border: "3px solid var(--nb-ink, #1d1d1b)",
            background: "#fff",
            display: "grid",
            placeItems: "center",
          }}
        >
          {(scenario === "A" || scenario === "B" || scenario === "latch") && <HarnessPanelAB mode={scenario} />}
          {(scenario === "joystick" || scenario === "drag") && <HarnessPanelC mode={scenario} />}
          {scenario === "D" && <HarnessPanelD />}
        </div>
      </Profiler>

      <HandLegend />
    </main>
  );

  return hasParentProvider ? content : <NuiProvider devTools testHooks={testHooks}>{content}</NuiProvider>;
}
