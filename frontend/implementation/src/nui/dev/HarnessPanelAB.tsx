"use client";

import { useEffect, useRef, useState } from "react";
import { NuiRing, type NuiRingHandle } from "../react";

export type PanelABMode = "A" | "B" | "latch";

export interface HarnessPanelABProps {
  mode: PanelABMode;
}

/**
 * Skenario G2 untuk Aturan A (1 target, cubit di mana saja),
 * Aturan B (2 target min 64 px, celah 24 px, hover lengket & kunci saat cubit),
 * serta uji Latch (target muncul saat cubit masih ditahan) & keyboard Enter/Spasi.
 */
export function HarnessPanelAB({ mode }: HarnessPanelABProps) {
  const [countA, setCountA] = useState(0);
  const [countB1, setCountB1] = useState(0);
  const [countB2, setCountB2] = useState(0);
  const [latchVisible, setLatchVisible] = useState(false);
  const [latchCount, setLatchCount] = useState(0);
  const [latchArming, setLatchArming] = useState(false);

  const ringARef = useRef<NuiRingHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const armDelayedTarget = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLatchVisible(false);
    setLatchArming(true);
    timerRef.current = setTimeout(() => {
      setLatchArming(false);
      setLatchVisible(true);
      timerRef.current = null;
    }, 1500);
  };

  if (mode === "A") {
    return (
      <section data-testid="r83-harness-mode-a" style={{ display: "grid", gap: 16, justifyItems: "center", padding: 24 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
          Aturan A: cubit &amp; tahan di mana saja (atau tahan Enter / Spasi) untuk mengisi ring 1000 ms.
        </p>
        <NuiRing
          ref={ringARef}
          label="Ayo"
          holdMs={1000}
          mode="any"
          autoResetMs={600}
          testId="r83-ring-a"
          onFire={() => setCountA((c) => c + 1)}
        />
        <div data-nui-off="true" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span data-testid="r83-count-a">Konfirmasi A: {countA}</span>
          <button type="button" data-nui-chrome="true" onClick={() => ringARef.current?.reset()}>
            Reset Ring
          </button>
        </div>
      </section>
    );
  }

  if (mode === "B") {
    return (
      <section data-testid="r83-harness-mode-b" style={{ display: "grid", gap: 18, justifyItems: "center", padding: 24 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
          Aturan B: dua target (min 64 px, celah 24 px). Yang terdekat menyala dan terkunci saat cubit mulai.
        </p>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <NuiRing
            label="Ulangi"
            holdMs={1000}
            mode="any"
            autoResetMs={600}
            testId="r83-ring-b1"
            style={{ minWidth: 64, minHeight: 64 }}
            onFire={() => setCountB1((c) => c + 1)}
          />
          <NuiRing
            label="Ya, itu namaku"
            holdMs={2000}
            mode="any"
            autoResetMs={600}
            testId="r83-ring-b2"
            style={{ minWidth: 64, minHeight: 64 }}
            onFire={() => setCountB2((c) => c + 1)}
          />
        </div>
        <div data-nui-off="true" style={{ display: "flex", gap: 16 }}>
          <span data-testid="r83-count-b1">Target 1 (1 dtk): {countB1}</span>
          <span data-testid="r83-count-b2">Target 2 (2 dtk): {countB2}</span>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="r83-harness-latch" style={{ display: "grid", gap: 16, justifyItems: "center", padding: 24 }}>
      <p style={{ margin: 0, fontWeight: 700, textAlign: "center", maxWidth: 520 }}>
        Uji Latch &amp; Keyboard: klik tombol chrome di bawah lalu SEGERA tahan cubit sebelum target muncul. Target baru
        wajib menunggu cubit dilepas dulu. Enter/Spasi menahan target yang menyala.
      </p>
      <div data-nui-off="true" style={{ display: "flex", gap: 12 }}>
        <button type="button" data-testid="r83-latch-spawn" onClick={armDelayedTarget}>
          {latchArming ? "Menunggu 1,5 dtk..." : "Munculkan target tertunda (1,5 dtk)"}
        </button>
        <button type="button" data-testid="r83-latch-now" onClick={() => setLatchVisible(true)}>
          Munculkan sekarang
        </button>
      </div>
      {latchVisible ? (
        <NuiRing
          label="Target Latch"
          holdMs={1000}
          mode="any"
          autoResetMs={600}
          testId="r83-ring-latch"
          onFire={() => setLatchCount((c) => c + 1)}
        />
      ) : (
        <div style={{ minHeight: 108, display: "grid", placeItems: "center", opacity: 0.65 }}>
          (Belum ada target aktif)
        </div>
      )}
      <span data-testid="r83-count-latch">Konfirmasi Latch: {latchCount}</span>
    </section>
  );
}
