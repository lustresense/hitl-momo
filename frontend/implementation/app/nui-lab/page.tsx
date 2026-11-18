import type { Metadata } from "next";
import "@/src/components/nui-lab/NuiLabPage.css";

export const metadata: Metadata = {
  title: "NUI Lab · Sketchbook Universe",
  description: "Workspace khusus eksperimen gesture dan canvas MediaPipe. Tidak masuk ke alur game.",
  robots: { index: false, follow: false },
};

/** Static-export landing. No camera permission is requested on this page. */
export default function NuiLabLanding() {
  return (
    <main className="nui-lab nui-lab--landing">
      <div className="nui-lab__landing">
        <p className="nui-lab__eyebrow">SKETCHBOOK UNIVERSE / EXPERIMENT</p>
        <h1>NUI Lab</h1>
        <p className="nui-lab__lede">
          Ruang uji kamera, MediaPipe, dan kanvas. Pilih halaman untuk langsung menguji interaksi tanpa
          melewati onboarding, klasifikasi, atau gameplay.
        </p>
        <div className="nui-lab__landing-grid">
          <a className="nui-lab__landing-card" href="/nui-lab/gesture">
            <span className="nui-lab__landing-count">01 / DETEKSI</span>
            <strong>Gesture Detection</strong>
            <span>Uji jempol, pinch, kepal, jumlah jari, telapak, hand lock, serta metrik kamera.</span>
            <span className="nui-lab__landing-open">Buka Gesture Lab</span>
          </a>
          <a className="nui-lab__landing-card" href="/nui-lab/canvas">
            <span className="nui-lab__landing-count">02 / GAMBAR</span>
            <strong>Canvas Lab</strong>
            <span>Gambar dengan gerakan tangan, uji stroke smoothing, penghapus, undo, redo, dan fallback pointer.</span>
            <span className="nui-lab__landing-open">Buka Canvas Lab</span>
          </a>
        </div>
        <p className="nui-lab__lede">Kamera hanya diminta setelah tombol ON di halaman eksperimen ditekan. NUI Lab bukan bukti bahwa webcam nyata sudah lolos validasi.</p>
        <a className="nui-lab__diagnostics-link" href="/nui-lab/diagnostics">Buka dashboard diagnostik lama</a>
      </div>
    </main>
  );
}
