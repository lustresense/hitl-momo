"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BenchDashboard, useLabBenchConfig } from "@/src/components/nui-lab/bench/BenchControls";
import {
  AUTO_RUNTIME_UI_LABEL,
  DEFAULT_PREPROCESS,
  ENGINE_SPECS,
  PREPROCESS_CANDIDATES,
  formatHonestEngineDiagnostics,
} from "@/src/components/nui-lab/bench/engines";
import { getAppBuildInfo } from "@/src/components/nui-lab/bench/env";
import "@/src/components/nui-lab/NuiLabPage.css";

type CameraApiReadiness = "checking" | "available" | "unavailable";

/** Static-export NUI Lab landing. Passively inspects navigator.mediaDevices without ever calling getUserMedia(). */
export default function NuiLabLanding() {
  const [cameraApi, setCameraApi] = useState<CameraApiReadiness>("checking");
  const cfg = useLabBenchConfig();
  const buildInfo = getAppBuildInfo();
  const activeSpec = ENGINE_SPECS[cfg.engineId];
  const diag = formatHonestEngineDiagnostics({
    engineId: cfg.engineId,
    modelSha256: activeSpec.sha256,
    modelHashVerified: false,
    isTrainedR22Model: activeSpec.isTrainedR22Model,
  });

  useEffect(() => {
    document.title = "NUI Lab · Sketchbook Universe";
    const hasMediaDevices = typeof navigator !== "undefined" && "mediaDevices" in navigator && Boolean(navigator.mediaDevices);
    const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
    setCameraApi(hasGetUserMedia ? "available" : "unavailable");
  }, []);

  const readinessCopy =
    cameraApi === "checking"
      ? "Memeriksa kesiapan kamera browser..."
      : cameraApi === "available"
        ? "Kamera siap dipakai. Izin baru diminta setelah Anda menekan Nyalakan kamera."
        : "Kamera tidak tersedia di browser atau konteks ini. Anda tetap dapat memakai mouse atau sentuh di Canvas.";

  return (
    <main className="nui-lab nui-lab--landing" data-testid="nui-lab-landing">
      <div className="nui-lab__landing">
        <header className="nui-lab__landing-header">
          <div className="nui-lab__landing-badges">
            <span className="nui-lab__eyebrow">SKETCHBOOK UNIVERSE / NUI LAB</span>
            <span className="nui-lab__pill nui-lab__pill--ok" data-testid="nui-lab-status-badge">
              {AUTO_RUNTIME_UI_LABEL}
            </span>
            <span className="nui-lab__pill" data-testid="nui-lab-version-badge">
              {buildInfo.version} ({buildInfo.gitCommit.slice(0, 7)})
            </span>
          </div>
          <h1>NUI Lab</h1>
          <p className="nui-lab__lede">
            Pilih pengalaman yang ingin langsung dicoba. Sistem berjalan otomatis di CPU perangkat Anda tanpa perlu
            mengatur model, pencahayaan, atau label teknis.
          </p>
        </header>

        <section className="nui-lab__landing-grid" aria-label="Pilihan utama NUI Lab">
          <Link className="nui-lab__landing-card nui-lab__cta-card" href="/nui-lab/gesture" data-testid="cta-try-gesture">
            <span className="nui-lab__landing-count">01 / UJI KONTROL GESTUR</span>
            <strong>Coba Gestur</strong>
            <span>
              Uji kontrol arah telunjuk dan jempol (Kiri, Lompat, Kanan, dan kombo diagonal) serta pembacaan langsung
              0–5 jari terbuka.
            </span>
            <span className="nui-lab__landing-open">Buka Coba Gestur →</span>
          </Link>
          <Link className="nui-lab__landing-card nui-lab__cta-card" href="/nui-lab/canvas" data-testid="cta-try-canvas">
            <span className="nui-lab__landing-count">02 / KANVAS GAMBAR TANGAN</span>
            <strong>Coba Canvas</strong>
            <span>
              Cubit rapat untuk menggambar, buka telapak 5 jari untuk menghapus, serta kepal lalu 1 atau 2 jari untuk
              Undo dan Redo.
            </span>
            <span className="nui-lab__landing-open">Buka Coba Canvas →</span>
          </Link>
        </section>

        <section
          className="nui-lab__info-card nui-lab__readiness-card"
          data-testid="nui-lab-camera-readiness"
          aria-label="Kesiapan kamera browser"
          data-camera-api={cameraApi}
        >
          <div className="nui-lab__info-head">
            <strong>Kesiapan Kamera Perangkat</strong>
            <span
              className={`nui-lab__pill ${
                cameraApi === "available"
                  ? "nui-lab__pill--ok"
                  : cameraApi === "unavailable"
                    ? "nui-lab__pill--err"
                    : ""
              }`}
            >
              {cameraApi === "checking" ? "MEMERIKSA" : cameraApi === "available" ? "SIAP" : "TIDAK TERSEDIA"}
            </span>
          </div>
          <p className="nui-lab__muted" role="status">
            {readinessCopy}
          </p>
        </section>

        <BenchDashboard />

        <details className="nui-lab__diagnostics-details" data-testid="nui-lab-diagnostics-details">
          <summary>Rincian Runtime &amp; Diagnostik Internal</summary>
          <div className="nui-lab__info-card nui-lab__diagnostics-card" data-testid="nui-lab-engine-info">
            <div className="nui-lab__info-head">
              <span className="nui-lab__landing-count">MODEL &amp; RUNTIME NYATA</span>
              <span className="nui-lab__pill nui-lab__pill--warn">Webcam Fisik: NOT_TESTED</span>
            </div>
            <p className="nui-lab__muted">
              Lencana UI <code>{diag.uiBadge}</code> merujuk ke runtime otomatis berikut: {diag.honestyNote}
            </p>
            <dl className="nui-lab__numbers">
              <div className="nui-lab__stat">
                <dt>Model aktif nyata</dt>
                <dd>{activeSpec.label}</dd>
              </div>
              <div className="nui-lab__stat">
                <dt>ID model / URL</dt>
                <dd>
                  <code>{activeSpec.engineId}</code> · <code>{activeSpec.modelUrl}</code>
                </dd>
              </div>
              <div className="nui-lab__stat">
                <dt>SHA-256 tersemat</dt>
                <dd>
                  <code>{activeSpec.sha256}</code>
                </dd>
              </div>
              <div className="nui-lab__stat">
                <dt>Detektor &amp; delegate</dt>
                <dd>
                  <code>{cfg.detector === "cpu-worker" ? "CPU Web Worker" : "CPU Main-Thread"}</code> · MediaPipe
                  HandLandmarker (VIDEO · default <code>fixed-2</code>)
                </dd>
              </div>
              <div className="nui-lab__stat">
                <dt>Preprocessing aktif &amp; kandidat</dt>
                <dd>
                  <code>{cfg.preprocess}</code> (default: <code>{DEFAULT_PREPROCESS}</code> · kandidat:{" "}
                  <code>{PREPROCESS_CANDIDATES.join(", ")}</code>)
                </dd>
              </div>
              <div className="nui-lab__stat">
                <dt>Versi build &amp; branch</dt>
                <dd>
                  <code>{buildInfo.version}</code> · <code>{buildInfo.gitBranch}@{buildInfo.gitCommit.slice(0, 7)}</code>
                </dd>
              </div>
            </dl>
          </div>
        </details>

        <footer className="nui-lab__landing-footer" style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--nui-border, #333)", fontSize: "0.85rem", opacity: 0.85, display: "flex", gap: "1rem" }}>
          <a
            href="https://github.com/lustresense/hitl-momo"
            target="_blank"
            rel="noopener noreferrer"
            className="nui-lab__source-link"
          >
            Kode sumber (AGPL-3.0)
          </a>
          <a
            href="https://github.com/lustresense/hitl-momo/blob/main/THIRD_PARTY_NOTICES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="nui-lab__notices-link"
          >
            Third-Party Notices
          </a>
        </footer>
      </div>
    </main>
  );
}
