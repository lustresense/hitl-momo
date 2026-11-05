import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./level-ribbon-bookmark.css";

export const metadata: Metadata = {
  title: "Sketchbook Universe (demo)",
  description:
    "Game literasi AI untuk siswa SMP: gambar, lihat tebakan AI, lalu putuskan sendiri. Build demo: prediksi masih simulasi.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
