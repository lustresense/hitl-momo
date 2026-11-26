"use client";

import { useEffect, useRef, useState } from "react";
import { PipHand, useNui, useNuiStatus } from "../react";
import { WebcamHandDetector } from "./webcam-hand-detector";

/**
 * Kontrol kamera live (chrome `[data-nui-off]`) + kartu PIP kiri-bawah (`#cam-pip`)
 * dengan indikator `PipHand` untuk uji G2 webcam Owner. Gagal-tertutup bila izin ditolak.
 */
export function HarnessCameraPip() {
  const controller = useNui();
  const status = useNuiStatus();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<WebcamHandDetector | null>(null);

  const [camOn, setCamOn] = useState(false);
  const [camNote, setCamNote] = useState("Kamera mati (mouse/sentuh aktif)");

  useEffect(
    () => () => {
      controller.setHandDetector(null);
      detectorRef.current?.stop();
      detectorRef.current = null;
    },
    [controller],
  );

  const toggleCamera = () => {
    if (camOn) {
      controller.setHandDetector(null);
      detectorRef.current?.stop();
      detectorRef.current = null;
      setCamOn(false);
      setCamNote("Kamera mati (fallback mouse/sentuh aktif)");
      return;
    }
    const detector = new WebcamHandDetector({
      getVideo: () => videoRef.current,
      onStatus: (s) => {
        setCamNote(s.message);
        if (s.state === "error") {
          setCamOn(false);
          controller.setHandDetector(null);
        }
      },
    });
    detectorRef.current = detector;
    setCamOn(true);
    controller.setHandDetector(detector);
  };

  return (
    <>
      <div
        data-nui-off="true"
        data-testid="r83-camera-controls"
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "8px 12px",
          borderRadius: 12,
          background: "rgba(29,29,27,0.06)",
        }}
      >
        <button type="button" data-testid="r83-camera-toggle" onClick={toggleCamera}>
          {camOn ? "Matikan Kamera Live" : "Nyalakan Kamera Live (G2)"}
        </button>
        <span data-testid="r83-camera-note" style={{ fontSize: 13 }}>
          {status.handError ? `Fallback mouse: ${status.handError}` : camNote}
        </span>
        <span data-testid="r83-active-source" style={{ fontSize: 12, fontWeight: 700 }}>
          Sumber: {status.activeSource ?? "belum ada"} {status.frozen ? "· BEKU (<T_gap)" : ""}
        </span>
      </div>

      <div
        id="cam-pip"
        className={camOn ? "has-video" : undefined}
        data-testid="r83-cam-pip"
        style={{
          position: "fixed",
          left: 20,
          bottom: 20,
          width: 150,
          height: 120,
          borderRadius: 14,
          border: "4px solid var(--nb-orange, #ef7a37)",
          background: "#23211d",
          overflow: "hidden",
          zIndex: 25,
          pointerEvents: "none",
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
            opacity: camOn ? 1 : 0,
          }}
        />
        <PipHand />
      </div>
    </>
  );
}
