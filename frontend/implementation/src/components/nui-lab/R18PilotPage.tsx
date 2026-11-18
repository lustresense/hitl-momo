"use client";

/**
 * R18-UX3 model pilot for the Owner. This page only observes camera and
 * displays hypothetical actions. It never dispatches gameplay, canvas,
 * undo/redo, or destructive erase actions to the actual product.
 *
 * Candidate code + model source: research-can/r18 (Agy).
 * Evidence here: STATIC_ONLY until Ujang runs build and Owner webcam tests.
 */
import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { startLabCamera } from "./lab-camera";
import { FullFrameHandLock } from "./lab-hand-lock";
import { createHandLandmarker, getDelegateInfo } from "@/src/camera/hand-landmarker";
import { frameForDetection, getFrameSourceStats, setLowLightEnhancement, type LowLightMode } from "@/src/camera/frame-source";
import { getInferenceStats, pollDetection } from "@/src/camera/inference-scheduler";
import { classifyHandPose, palmCenterNormalized } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";
import { Ux3RuntimePipeline } from "./r18/ux3_integrated";
import type { Ux3ExportedModel } from "./r18/ux3_model";
import "./NuiLabPage.css";

type Phase = "off" | "loading" | "on" | "error";
type View = {
  baselinePose: string;
  topLabel: string;
  confidence: number | null;
  allProbabilities: Array<{ label: string; probability: number }>;
  lock: string;
  lockReason: string;
  handCount: number;
  e2eMs: number;
  fps: number;
  uiInput: string;
  pinch: boolean;
  erase: boolean;
  swipe: string;
  pointing: boolean;
  modelMs: number;
  delegate: string;
  status: string;
};
const EMPTY: View = {
  baselinePose: "—", topLabel: "—", confidence: null, allProbabilities: [],
  lock: "waiting", lockReason: "—", handCount: 0, e2eMs: 0, fps: 0,
  uiInput: "—", pinch: false, erase: false, swipe: "—",
  pointing: false, modelMs: 0, delegate: "—", status: "Kamera belum aktif",
};
type LiveSession = {
  stream: MediaStream;
  detector: HandLandmarker;
  pipeline: Ux3RuntimePipeline;
  handLock: FullFrameHandLock;
  raf: number;
  lastTime: number;
  acquisitionId: number;
  lastReport: number;
  processed: number;
  framesWindowStart: number;
};

function stopSession(s: LiveSession | null) {
  if (!s) return;
  cancelAnimationFrame(s.raf);
  s.stream.getTracks().forEach((track) => track.stop());
  s.detector.close();
  s.pipeline.reset();
  s.handLock.reset();
}

export function R18PilotPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const current = useRef<LiveSession | null>(null);
  const generation = useRef(0);
  const initialLowLight = useRef<LowLightMode>("auto");
  const [phase, setPhase] = useState<Phase>("off");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>(EMPTY);
  const [light, setLight] = useState<LowLightMode>("auto");

  useEffect(() => {
    initialLowLight.current = getFrameSourceStats().mode;
    setLight(initialLowLight.current);
    return () => {
      generation.current++;
      stopSession(current.current);
      current.current = null;
      setLowLightEnhancement(initialLowLight.current);
    };
  }, []);

  const stop = () => {
    generation.current++;
    stopSession(current.current);
    current.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("off");
    setView(EMPTY);
    setLowLightEnhancement(initialLowLight.current);
    setLight(initialLowLight.current);
  };

  const start = async () => {
    if (phase === "loading" || current.current) return;
    const token = ++generation.current;
    setPhase("loading");
    setError("");
    let stream: MediaStream | null = null;
    let detector: HandLandmarker | null = null;
    try {
      const response = await fetch("/models/r18-ux3-model.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Model R18 tidak berhasil dimuat");
      const model = await response.json() as Ux3ExportedModel;
      // Checks label and feature length during construction.
      const pipeline = new Ux3RuntimePipeline(model, 4 / 3);
      if (token !== generation.current) return;
      const camera = await startLabCamera(navigator.mediaDevices);
      if (camera.kind !== "ok") throw new Error(camera.message);
      stream = camera.stream;
      if (token !== generation.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const video = videoRef.current;
      if (!video) throw new Error("Video belum tersedia");
      video.srcObject = stream;
      await video.play();
      const created = await createHandLandmarker({
        wasmRoot: "/mediapipe/wasm",
        modelUrl: "/models/hand_landmarker.task",
        numHands: 2,
      });
      detector = created.landmarker;
      if (token !== generation.current) {
        detector.close(); stream.getTracks().forEach(t => t.stop());
        return;
      }
      // In contrast to the sandbox's fixed 4:3 default, use the camera's actual aspect.
      const aspect = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 4 / 3;
      const s: LiveSession = {
        stream, detector,
        pipeline: new Ux3RuntimePipeline(model, aspect),
        handLock: new FullFrameHandLock(),
        raf: 0, lastTime: -1, acquisitionId: 0, lastReport: 0,
        processed: 0, framesWindowStart: performance.now(),
      };
      current.current = s;
      setPhase("on");
      const loop = () => {
        if (current.current !== s) return;
        s.raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2 || v.currentTime === s.lastTime) return;
        s.lastTime = v.currentTime;
        const time = performance.now();
        let inferMs = 0;
        let hands: Landmark[][] | null;
        try {
          hands = pollDetection(s, v, ts => {
            const begin = performance.now();
            try { return s.detector.detectForVideo(frameForDetection(v), ts).landmarks; }
            finally { inferMs = performance.now() - begin; }
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Deteksi kamera gagal");
          stop();
          setPhase("error");
          return;
        }
        if (hands === null) return;
        s.processed++;
        const selected = s.handLock.pick(hands, time);
        const lm = selected.index === null ? undefined : hands[selected.index];
        if (s.handLock.acquisitionId !== s.acquisitionId) {
          s.acquisitionId = s.handLock.acquisitionId;
          s.pipeline.reset();
        }
        const baseline = lm ? classifyHandPose(lm, { experimentalRobust: true, aspect }) : "none";
        const center = lm ? palmCenterNormalized(lm) : { x: 0.5, y: 0.5 };
        const scale = lm ? Math.max(
          Math.hypot((lm[0]!.x - lm[9]!.x) * aspect, lm[0]!.y - lm[9]!.y),
          Math.hypot((lm[5]!.x - lm[17]!.x) * aspect, lm[5]!.y - lm[17]!.y),
        ) : 1;
        const startModel = performance.now();
        const output = s.pipeline.step(lm, time, baseline, center.x, center.y, scale);
        const modelMs = performance.now() - startModel;
        const canvas = overlayRef.current;
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) {
          canvas.width = Math.max(v.videoWidth || 640, 1);
          canvas.height = Math.max(v.videoHeight || 360, 1);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (lm) {
            const indices = [0, 4, 8, 12, 16, 20];
            ctx.fillStyle = "#0d9488";
            for (const i of indices) {
              const p = lm[i]!;
              ctx.beginPath();
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        if (time - s.lastReport < 250) return;
        const fps = 1000 * s.processed / Math.max(1, time - s.framesWindowStart);
        if (time - s.framesWindowStart > 2000) {
          s.processed = 0;
          s.framesWindowStart = time;
        }
        s.lastReport = time;
        const action = output.steer.input;
        const virtualKey = action.left ? "KIRI" : action.right ? "KANAN" : action.jump ? "LOMPAT" : "NETRAL";
        const stats = getInferenceStats();
        const delegate = getDelegateInfo();
        setView({
          baselinePose: baseline,
          topLabel: output.topLabel,
          confidence: output.probs ? Math.max(...output.probs) : null,
          allProbabilities: output.probs ? model.labels.map((label, i) => ({ label, probability: output.probs![i] ?? 0 })) : [],
          lock: selected.status, lockReason: s.handLock.reason,
          handCount: hands.length,
          e2eMs: inferMs + modelMs,
          fps: Number.isFinite(fps) ? fps : 0,
          uiInput: virtualKey,
          pinch: output.pinchActive,
          erase: output.eraseActive,
          swipe: output.swipeAction ?? "—",
          pointing: output.steer.pointingOk,
          modelMs,
          delegate: delegate.delegate ?? "—",
          status: "MODEL AKTIF · shadow mode · tanpa aksi game",
        });
        void stats;
      };
      s.raf = requestAnimationFrame(loop);
    } catch (e) {
      detector?.close();
      stream?.getTracks().forEach(t => t.stop());
      if (token !== generation.current) return;
      if (videoRef.current) videoRef.current.srcObject = null;
      setError(e instanceof Error ? e.message : "Gagal membuka NUI Lab R18");
      setPhase("error");
    }
  };

  const selectLight = (value: LowLightMode) => {
    setLowLightEnhancement(value);
    setLight(value);
  };

  return (
    <main className="nui-lab nui-lab--diagnostics" data-testid="nui-lab-r18">
      <div className="nui-lab__header">
        <p className="nui-lab__eyebrow">SKETCHBOOK UNIVERSE / R18 LAB-ONLY PILOT</p>
        <h1>R18 · MediaPipe + MLP UX3</h1>
        <p className="nui-lab__muted">
          Jalankan kamera lu sendiri untuk membandingkan aturan R17 dengan model UX3 hasil training Agy.
          Ini shadow test yang hanya menampilkan calon aksi, tanpa menyentuh gameplay atau kanvas siswa.
          DimHand belum dipakai dalam training UX3.
        </p>
        <a href="/nui-lab">Kembali ke NUI Lab</a>
      </div>
      <div className="nui-lab__layout">
        <section className="nui-lab__panel">
          <h2>Kamera</h2>
          <div className="nui-lab__stage" style={{ position: "relative" }}>
            <video ref={videoRef} muted playsInline autoPlay aria-label="Kamera R18" style={{ display: "block", width: "100%", transform: "scaleX(-1)" }} />
            <canvas ref={overlayRef} aria-label="Landmark tangan" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "scaleX(-1)", pointerEvents: "none" }} />
          </div>
          <div className="nui-lab__actions">
            <button type="button" className="nui-lab__button" onClick={() => { void start(); }} disabled={phase === "loading" || phase === "on"}>
              {phase === "loading" ? "Memuat model dan kamera…" : "Nyalakan kamera R18"}
            </button>
            <button type="button" className="nui-lab__button" onClick={stop} disabled={phase === "off"}>Matikan</button>
          </div>
          {error && <p role="alert">{error}</p>}
          <p aria-live="polite">{phase === "error" ? "Gagal" : phase === "loading" ? "Memuat…" : phase === "on" ? "Kamera aktif" : "Kamera mati"}</p>
          <h3>Pemrosesan cahaya yang tersedia</h3>
          <p className="nui-lab__muted">Ini mode frame-source existing, bukan UX2 M3. Uji kondisi lampu yang sama.</p>
          <div className="nui-lab__actions">
            {(["off", "auto", "on"] as LowLightMode[]).map(mode => (
              <button key={mode} type="button" className="nui-lab__button"
                aria-pressed={light === mode} onClick={() => selectLight(mode)}>
                {mode === "off" ? "RAW" : mode === "auto" ? "AUTO" : "CLAHE"}
              </button>
            ))}
          </div>
        </section>
        <section className="nui-lab__panel" aria-live="polite">
          <h2>Perbandingan pada frame yang sama</h2>
          <dl className="nui-lab__numbers">
            <dt>Aturan R17</dt><dd>{view.baselinePose}</dd>
            <dt>Prediksi MLP R18</dt><dd>{view.topLabel} {view.confidence === null ? "" : "(" + (view.confidence * 100).toFixed(1) + "%)"}</dd>
            <dt>Hand lock</dt><dd>{view.lock} · {view.lockReason}</dd>
            <dt>Tangan terlihat</dt><dd>{view.handCount}</dd>
            <dt>Virtual key (simulasi)</dt><dd>{view.uiInput}</dd>
            <dt>Pinch boleh aktif</dt><dd>{view.pinch ? "YA" : "TIDAK"}</dd>
            <dt>Erase boleh aktif</dt><dd>{view.erase ? "YA" : "TIDAK"}</dd>
            <dt>Swipe kandidat</dt><dd>{view.swipe}</dd>
            <dt>Pointing aman</dt><dd>{view.pointing ? "YA" : "TIDAK"}</dd>
            <dt>FPS deteksi</dt><dd>{view.fps.toFixed(1)}</dd>
            <dt>Waktu model UX3</dt><dd>{view.modelMs.toFixed(2)} ms</dd>
            <dt>Deteksi + UX3</dt><dd>{view.e2eMs.toFixed(2)} ms</dd>
            <dt>Delegate</dt><dd>{view.delegate}</dd>
          </dl>
          <p>{view.status}</p>
          <h3>Probabilitas model (bukan confidence MediaPipe)</h3>
          <dl className="nui-lab__numbers">
            {view.allProbabilities.map(p => (
              <div key={p.label}><dt>{p.label}</dt><dd>{(p.probability * 100).toFixed(1)}%</dd></div>
            ))}
          </dl>
          <p className="nui-lab__muted">
            Pengujian fisik masih perlu dilakukan. False swipe/erase, low-light, dan latensi pada kamera siswa
            belum dinyatakan lolos. Bukan model DimHand dan bukan pengganti gesture game.
          </p>
        </section>
      </div>
    </main>
  );
}
