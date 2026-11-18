"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_R19_MODEL_URL } from "@/src/components/nui-lab/r19/r19_loader";
import "@/src/components/nui-lab/NuiLabPage.css";

type CameraApiReadiness = "checking" | "available" | "unavailable";

/** Static-export NUI Lab landing. Passively inspects navigator.mediaDevices without ever calling getUserMedia(). */
export default function NuiLabLanding() {
  const [cameraApi, setCameraApi] = useState<CameraApiReadiness>("checking");

  useEffect(() => {
    document.title = "NUI Lab · Sketchbook Universe";
    const hasMediaDevices = typeof navigator !== "undefined" && "mediaDevices" in navigator && Boolean(navigator.mediaDevices);
    const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
    setCameraApi(hasGetUserMedia ? "available" : "unavailable");
  }, []);

  const readinessCopy =
    cameraApi === "checking"
      ? "Memeriksa ketersediaan API kamera browser secara pasif..."
      : cameraApi === "available"
        ? "API kamera tersedia (navigator.mediaDevices siap). Izin kamera belum diminta."
        : "API kamera (navigator.mediaDevices.getUserMedia) tidak tersedia di browser atau konteks ini.";

  return (
    <main className="nui-lab nui-lab--landing" data-testid="nui-lab-landing">
      <div className="nui-lab__landing">
        <p className="nui-lab__eyebrow">SKETCHBOOK UNIVERSE / NUI LAB</p>
        <h1>NUI Lab</h1>
        <p className="nui-lab__lede">
          Ruang uji diagnostik kamera, MediaPipe Hands, dan gestur R19. Halaman ini terpisah dari alur onboarding
          dan gameplay siswa produksi.
        </p>

        <div className="nui-lab__landing-meta">
          <section className="nui-lab__info-card" data-testid="nui-lab-engine-info" aria-label="Informasi engine aktif">
            <div className="nui-lab__info-head">
              <span className="nui-lab__landing-count">ENGINE AKTIF</span>
              <span className="nui-lab__pill nui-lab__pill--warn">Webcam Fisik: NOT_TESTED</span>
            </div>
            <strong>R19 G4 Hybrid</strong>
            <p className="nui-lab__muted">
              Arsitektur: <code>G1 Geometry + G3 MLP 82-&gt;96-&gt;48-&gt;3 + PistolVirtualKeyFSM</code>
            </p>
            <p className="nui-lab__muted">
              Model bobot: <code>{DEFAULT_R19_MODEL_URL}</code>
            </p>
            <p className="nui-lab__muted">
              Status uji webcam fisik saat ini: <strong>NOT_TESTED</strong>. Hasil NUI Lab adalah diagnostik lokal,
              bukan bukti validasi webcam nyata maupun keputusan gameplay produksi.
            </p>
          </section>

          <section
            className="nui-lab__info-card"
            data-testid="nui-lab-camera-readiness"
            aria-label="Kesiapan API kamera"
            data-camera-api={cameraApi}
          >
            <div className="nui-lab__info-head">
              <span className="nui-lab__landing-count">KESIAPAN KAMERA</span>
              <span
                className={`nui-lab__pill ${
                  cameraApi === "available"
                    ? "nui-lab__pill--ok"
                    : cameraApi === "unavailable"
                      ? "nui-lab__pill--err"
                      : ""
                }`}
              >
                {cameraApi === "checking" ? "MEMERIKSA" : cameraApi === "available" ? "API SIAP" : "TIDAK TERSEDIA"}
              </span>
            </div>
            <strong>Pemeriksaan Pasif Browser</strong>
            <p className="nui-lab__muted" role="status">
              {readinessCopy}
            </p>
            <p className="nui-lab__muted">
              Kamera hanya diminta saat Anda menekan tombol <strong>Nyalakan kamera (ON)</strong> di dalam halaman
              eksperimen. Halaman ringkasan ini tidak pernah memanggil <code>getUserMedia()</code>.
            </p>
          </section>
        </div>

        <div className="nui-lab__landing-grid">
          <Link className="nui-lab__landing-card" href="/nui-lab/gesture">
            <span className="nui-lab__landing-count">01 / DETEKSI &amp; TELEMETRI R19</span>
            <strong>Gesture Detection Lab</strong>
            <span>
              Uji klasifikasi R19 G4 Hybrid (POINT_READY, POINT_PRESS, OTHER), tombol virtual LEFT / JUMP / RIGHT,
              probabilitas MLP, arah telunjuk, status jari, hand lock, dan perekam angka landmark.
            </span>
            <span className="nui-lab__landing-open">Buka Gesture Detection Lab</span>
          </Link>
          <Link className="nui-lab__landing-card" href="/nui-lab/canvas">
            <span className="nui-lab__landing-count">02 / KANVAS GAMBAR NUI</span>
            <strong>Canvas Lab</strong>
            <span>
              Gambar dengan cubit (pinch), hapus 5 jari, swipe kiri/kanan (undo/redo), uji stroke smoothing,
              penghapus, dan fallback mouse/sentuh dengan pemantauan R19 read-only.
            </span>
            <span className="nui-lab__landing-open">Buka Canvas Lab</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
