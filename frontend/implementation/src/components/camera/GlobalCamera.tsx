"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { setSharedStream } from "../../camera/shared-stream";
import { publishCameraAssistState } from "../../camera/camera-assist-state";
import { Icon } from "../ui/Icon";
import { MomoGuide } from "../momo/MomoGuide";
import { BookFlip } from "../ui/BookFlip";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import { useInputMode } from "@/src/hooks/useHandGesture";
import { COVER_NO_CAMERA_HINT, COVER_WAKE } from "@/src/domain/guide-script";
import { reportCameraAvailable, reportCameraUnavailable } from "../../input/input-mode";
import { subscribeHandLandmarkerStatus, warmHandLandmarker } from "../../camera/landmarker-warmup";
import { DRAWING_MODE_EVENT, HAND_STATUS_EVENT, classifyCameraError, messageFor } from "../../camera/messages";
import type { HandInputStatus } from "../../input/types";
import "./cover-stage.css";
import { COVER_MOMO_FADE_MS } from "./cover-handoff";

export interface GlobalCameraProps {
  /** "cover" = centred camera card with Momo asleep on the right, "floating" = bottom-left mini PIP. */
  mode: "cover" | "floating";
  modelUrl: string;
  /**
   * Called after the stream is playable (or the no-camera fallback), Momo said her lines and the
   * student confirmed with a thumb. Fires at the book's midpoint, when the page under the leaf may change.
   */
  onWave?: () => void;
  /** Same destination as onWave; kept for callers. The cover itself no longer renders a skip button (R1, R13). */
  onSkip?: () => void;
  /**
   * The drawing canvas owns the bottom dock (Aksi Gambar / Kamera / Alat).
   * Recessing keeps the PIP out of those controls while the component (and its
   * MediaStream) stays mounted.
   */
  recessed?: boolean;
  /** Legacy test prop for older callers. Cover no longer waits for waving. */
  waveStartDelayMs?: number;
}

/** Layout effect is a no-op (and warns) while server-rendering the shell. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Cover choreography (R3). One schedule, started by the wake and cancelled on unmount. Story animation keeps its
 * full duration, also with reduced motion (only repeating effects may be softened).
 */
/** Wake beat: the card and Momo start moving after the blink has begun (the blink itself is MOMO_WAKE_MS). */
const FLY_AT_MS = 750;
/** Startled mood (kaget) ends. */
const STARTLED_MS = 900;
/** Camera card: centre -> bottom-left PIP. */
const CARD_MORPH_S = 0.8;
/** Momo: from her corner to the centre of the cover. */
const MOMO_FLY_S = 1.1;
const MOMO_COVER_PX = 250;
const MOMO_CENTER_PX = 320;
/**
 * Her words start after a playable camera stream; the flight runs alongside them (the thumb ring must be holdable within
 * 8 s of the wake). The beats overlap on purpose, the animations themselves keep their full duration.
 */
const DIALOG_START_MS = 300;
/**
 * Speech speed of Momo's wake dialog (MomoChat pace). At 1 the four lines end at ~16.9 s, too long for the budget.
 * 0.45 types and reads them ~2.2x faster and puts the thumb ring at ~7.8 s; every line is still shown in full.
 */
const COVER_DIALOG_PACE = 0.45;
/** Momo's flight and the thumb ring: the student confirms with a 1 s thumb after the last line. */
const COVER_THUMB_HOLD_MS = 1000;

/** Same numbers as the PIP in 60-global-camera.css (phones use the smaller box). */
const PIP_DESKTOP = { inset: 24, width: 150, height: 120 };
const PIP_PHONE = { inset: 12, width: 125, height: 100 };

interface CardRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(el: HTMLElement | null): CardRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function isPhone(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 640px)")?.matches;
}

/** Where the bottom-left PIP sits on this screen (the same box the floating CSS draws). */
function pipRect(): CardRect {
  const box = isPhone() ? PIP_PHONE : PIP_DESKTOP;
  return { left: box.inset, top: window.innerHeight - box.inset - box.height, width: box.width, height: box.height };
}

/**
 * GSAP FLIP-style morph of the single persistent camera card.
 * Starts exactly where the card was painted in the previous mode (position +
 * size), then glides into the current layout box. No-op in jsdom/SSR where
 * rects are zeroed, and when the user prefers reduced motion.
 */
function morphCameraCard(card: HTMLElement, from: CardRect | null, to: CardRect | null): void {
  if (!from || !to) return;
  if (from.width < 2 || from.height < 2 || to.width < 2 || to.height < 2) return;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return;
  }
  const x = from.left - to.left;
  const y = from.top - to.top;
  const dw = Math.abs(from.width - to.width);
  const dh = Math.abs(from.height - to.height);
  if (Math.abs(x) < 1 && Math.abs(y) < 1 && dw < 1 && dh < 1) return;
  gsap.killTweensOf(card);
  gsap.fromTo(
    card,
    { width: from.width, height: from.height, x, y },
    {
      width: to.width,
      height: to.height,
      x: 0,
      y: 0,
      duration: 0.6,
      ease: "power2.out",
      clearProps: "width,height,x,y",
    },
  );
}

/**
 * NUI-2 anti motion blur: 720p at 24-60 fps in the same single request, so a fast wave is not smeared. Existing
 * fields (the 5:4 preference, the chosen device) are kept.
 */
function cameraConstraints(selectedDevice: string): MediaTrackConstraints {
  const quality = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 24 } };
  return selectedDevice
    ? { deviceId: { exact: selectedDevice }, ...quality }
    : { facingMode: "user", aspectRatio: { ideal: 5 / 4 }, ...quality };
}

function isOverconstrained(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "OverconstrainedError";
}

/**
 * One getUserMedia request with the quality constraints. A camera that cannot meet them must still start, so an
 * OverconstrainedError retries with the plain request. A chosen device stays chosen: only the quality is dropped.
 */
async function requestCameraStream(selectedDevice: string): Promise<MediaStream> {
  const devices = navigator.mediaDevices;
  try {
    return await devices.getUserMedia({ video: cameraConstraints(selectedDevice), audio: false });
  } catch (error) {
    if (!isOverconstrained(error)) throw error;
    return devices.getUserMedia({ video: selectedDevice ? { deviceId: { exact: selectedDevice } } : true, audio: false });
  }
}

/** Same wasm folder the wave tracker uses, so the warm-up and the tracker share one model file. */
const WASM_ROOT = "/mediapipe/wasm";

/**
 * Cover card -> PIP as ONE uniform scale plus a bottom crop (I1). The PIP is 5:4, the cover card is taller (the controls
 * sit under the video), so the crop keeps the top 5:4 part and that part scales exactly onto the PIP box. The video is
 * never stretched. A card already shorter than 5:4 cannot be cropped; it is only scaled.
 * The origin is the card's top-left, so `x`/`y` move that corner onto the PIP's corner.
 */
export function pipMorph(from: CardRect, to: CardRect): { x: number; y: number; scale: number; cutBottom: number } {
  const scale = to.width / from.width;
  const visibleHeight = from.width * (to.height / to.width);
  const cutBottom = Math.max(0, from.height - visibleHeight);
  return { x: to.left - from.left, y: to.top - from.top, scale, cutBottom };
}

export function GlobalCamera({ mode, modelUrl, onWave, recessed = false }: GlobalCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * Monotonic request token. Every start/stop/unmount bumps it; an async
   * getUserMedia that resolves with a stale token stops its own tracks instead
   * of publishing a camera nobody asked for (toggle off while "Membuka kamera").
   */
  const requestRef = useRef(0);
  const unmountedRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onWaveRef = useRef(onWave);
  onWaveRef.current = onWave;
  const modelUrlRef = useRef(modelUrl);
  modelUrlRef.current = modelUrl;
  /** The model warm-up starts once per mount, after the camera permission. */
  const warmStartedRef = useRef(false);
  const handDelegateRef = useRef("");
  /** The one camera card node: ref'd so GSAP can morph it between layouts. */
  const cameraCardRef = useRef<HTMLDivElement>(null);
  /** Momo's wrapper: flown from her corner to the centre (FLIP). */
  const momoRef = useRef<HTMLDivElement>(null);
  /** Where the card was painted on the previous commit (morph start point). */
  const lastRectRef = useRef<CardRect | null>(null);
  const lastPlacementRef = useRef(`${mode}:${recessed ? "recessed" : "pip"}`);
  /** Rects measured at the wake, before anything moves: the start points of both flights. */
  const cameraFromRef = useRef<CardRect | null>(null);
  const momoFromRef = useRef<CardRect | null>(null);
  const cameraTweenRef = useRef<gsap.core.Tween | null>(null);
  const momoTweenRef = useRef<gsap.core.Tween | null>(null);
  /** Synchronous guard: a playable stream or fallback wakes Momo only once. */
  const wokenRef = useRef(false);
  /** One confirmation = one book turn. */
  const flipStartedRef = useRef(false);
  const leftCoverRef = useRef(false);

  const [isOn, setIsOn] = useState(false);
  const [drawingInputMode, setDrawingInputMode] = useState<"pointer" | "hand">("pointer");
  const [hasStream, setHasStream] = useState(false);
  const [previewLabel, setPreviewLabel] = useState("Camera Preview");
  const [toggleLabel, setToggleLabel] = useState("Nyalakan Kamera");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  /** Short always-visible status line (failures, tracker backend). Empty = hidden. */
  const [statusNote, setStatusNote] = useState("");
  const [failed, setFailed] = useState(false);
  const [delegate, setDelegate] = useState("");
  const inputMode = useInputMode();
  /** Momo sleeps until the user enables a playable stream or uses the no-camera fallback. */
  const [awake, setAwake] = useState(false);
  const [wake, setWake] = useState({ key: 0, startled: false, wave: 0 });
  /** Momo is (or has been) moved to the centre of the cover. */
  const [flying, setFlying] = useState(false);
  /** The camera card is in its bottom-left PIP box: the layout switches here (no jump, the box is the same). */
  const [pipReached, setPipReached] = useState(false);
  /** The book has been started: the cover text and the thumb confirmation are gone. */
  const [coverDone, setCoverDone] = useState(false);
  /** Momo has typed her last line: the thumb ring appears now, not after the reading pause. */
  const [coverLinesTyped, setCoverLinesTyped] = useState(false);
  /** Momo on the cover: on, fading (0.3 s after the midpoint), gone. */
  const [momoPhase, setMomoPhase] = useState<"on" | "fading" | "gone">("on");
  /** BookFlip play key: bumps once per confirmation. */
  const [flipKey, setFlipKey] = useState(0);

  /**
   * The cover's card and Momo are the same cover mode until the card has landed in its PIP box. After that the
   * layout is the floating one, even though `mode` still reads "cover" until the navigation at the book's midpoint.
   */
  const layoutMode: "cover" | "floating" = mode === "floating" || pipReached ? "floating" : "cover";

  const wakeMomo = () => {
    if (modeRef.current !== "cover" || wokenRef.current) return;
    wokenRef.current = true;
    cameraFromRef.current = readRect(cameraCardRef.current);
    momoFromRef.current = readRect(momoRef.current);
    // The "typed" flag may be left over from the sleepy nudge line; the ring must wait for the wake lines.
    setCoverLinesTyped(false);
    setAwake(true);
  };
  const wakeRef = useRef(wakeMomo);
  wakeRef.current = wakeMomo;
  /** The one wake-up schedule: startle, the card and Momo fly, Momo waves on landing. Cancelled on unmount. */
  useEffect(() => {
    if (!awake) return;
    setWake((w) => ({ ...w, key: w.key + 1, startled: true }));
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setWake((w) => ({ ...w, startled: false })), STARTLED_MS));
    timers.push(window.setTimeout(startFlights, FLY_AT_MS));
    timers.push(window.setTimeout(() => setWake((w) => ({ ...w, wave: w.wave + 1 })), FLY_AT_MS + MOMO_FLY_S * 1000));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      cameraTweenRef.current?.kill();
      momoTweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awake]);

  /** Momo's FLIP: the layout has just moved her to the centre; fly her from her old box, sized 250 -> 320 px. */
  useIsoLayoutEffect(() => {
    if (!flying) return;
    const el = momoRef.current;
    const from = momoFromRef.current;
    const to = readRect(el);
    if (!el || !from || !to || from.height < 2 || to.width < 2 || to.height < 2) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    momoTweenRef.current = gsap.fromTo(
      el,
      { x: dx, y: dy, scale: from.height / to.height },
      { x: 0, y: 0, scale: 1, duration: MOMO_FLY_S, ease: "power2.inOut", clearProps: "transform" },
    );
  }, [flying]);

  /**
   * Camera card: the same node flies to the PIP box and ends there, so the floating layout takes over seamlessly.
   * Without a camera (V1) the card makes the same single morph, so Momo gets the centre of the cover; the PIP then
   * shows the existing "no camera" status instead of a picture.
   */
  function startFlights() {
    if (unmountedRef.current) return;
    setFlying(true);
    if (!streamRef.current) setStatusNote((note) => note || messageFor("camera-unavailable"));
    const card = cameraCardRef.current;
    const from = cameraFromRef.current;
    if (!card || !from || from.width < 2 || from.height < 2) {
      setPipReached(true);
      return;
    }
    const morph = pipMorph(from, pipRect());
    cameraTweenRef.current = gsap.fromTo(
      card,
      { x: 0, y: 0, scale: 1, clipPath: "inset(0px 0px 0px 0px round 20px)", transformOrigin: "0px 0px" },
      {
        x: morph.x,
        y: morph.y,
        scale: morph.scale,
        clipPath: `inset(0px 0px ${morph.cutBottom}px 0px round 14px)`,
        duration: CARD_MORPH_S,
        ease: "power2.inOut",
        onComplete: () => {
          if (!unmountedRef.current) setPipReached(true);
        },
      },
    );
  }

  /** Once the lines are done the thumb confirms, and only then does the book open. */
  const onThumbConfirm = () => {
    if (flipStartedRef.current) return;
    flipStartedRef.current = true;
    setFlipKey((k) => k + 1);
  };

  /**
   * Midpoint of the book: the page under the leaf switches now (ruler). Momo's last word fades out from this moment, so
   * the next screen's Momo can fade in once this one is gone (no two Momos at once, R12-03).
   */
  const handOff = () => {
    if (leftCoverRef.current) return;
    leftCoverRef.current = true;
    setCoverDone(true);
    setMomoPhase("fading");
    onWaveRef.current?.();
  };

  useEffect(() => {
    if (!coverDone) return;
    const gone = window.setTimeout(() => setMomoPhase("gone"), COVER_MOMO_FADE_MS);
    return () => window.clearTimeout(gone);
  }, [coverDone]);

  /** Only a failed warm-up is shown (one honest sentence); loading and GPU/CPU states stay hidden from the student. */
  useEffect(() => {
    if (mode !== "cover") return;
    return subscribeHandLandmarkerStatus((status) => {
      if (unmountedRef.current || status.kind !== "failed") return;
      setStatusNote(status.message);
    });
  }, [mode]);

  // Legacy test-only hook simulates wake choreography. No wave detection is active in the cover.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" || mode !== "cover") return;
    const w = window as Window & { __skbWave?: () => void };
    w.__skbWave = () => wakeRef.current();
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "w" || event.key === "W") && !(event.target instanceof HTMLInputElement)) wakeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete w.__skbWave;
      window.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  useEffect(() => {
    unmountedRef.current = false;
    void populateCameraChoices();
    // A real page unload / bfcache entry must release the camera too.
    const onPageHide = () => stopStream();
    window.addEventListener("pagehide", onPageHide);
    // Hand-drawing status (published by DrawingSurface) and mode fallbacks.
    const onHandStatus = (event: Event) => {
      const status = (event as CustomEvent<HandInputStatus>).detail;
      if (!status) return;
      if (status.kind === "error") setStatusNote(status.message ?? messageFor("tracker-error"));
      else if (status.kind === "tracking-lost") setStatusNote("Tangan tidak terlihat.");
      else if (status.kind === "ready") {
        if (status.delegate) handDelegateRef.current = status.delegate;
        setStatusNote(handDelegateRef.current ? `Tangan siap · ${handDelegateRef.current}` : "");
      } else if (status.kind === "idle") setStatusNote("");
    };
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<"pointer" | "hand">).detail;
      if (next === "pointer" || next === "hand") setDrawingInputMode(next);
    };
    window.addEventListener(HAND_STATUS_EVENT, onHandStatus);
    window.addEventListener(DRAWING_MODE_EVENT, onMode);
    return () => {
      unmountedRef.current = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener(HAND_STATUS_EVENT, onHandStatus);
      window.removeEventListener(DRAWING_MODE_EVENT, onMode);
      cameraTweenRef.current?.kill();
      momoTweenRef.current?.kill();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Single persistent card: every commit records where the card currently sits,
   * so the next placement change (cover <-> PIP, or PIP -> recessed on canvas)
   * can be animated from the exact previous position/size with GSAP.
   */
  useIsoLayoutEffect(() => {
    const card = cameraCardRef.current;
    if (!card) return;
    const placement = `${layoutMode}:${recessed ? "recessed" : "pip"}`;
    if (layoutMode === "floating") {
      // The PIP is anchored from its first paint; no cached cover/phase FLIP.
      gsap.killTweensOf(card);
      gsap.set(card, { clearProps: "transform,width,height,x,y,clipPath,transformOrigin" });
      lastPlacementRef.current = placement;
    } else if (placement !== lastPlacementRef.current) {
      const from = lastRectRef.current;
      const to = readRect(card);
      lastPlacementRef.current = placement;
      morphCameraCard(card, from, to);
    }
    lastRectRef.current = readRect(card);
  });

  async function populateCameraChoices(preferredId = "") {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((device) => device.kind === "videoinput");
      setDevices(cameras);
      if (preferredId && cameras.some((camera) => camera.deviceId === preferredId)) {
        setDeviceId(preferredId);
      }
    } catch {
      setDevices([]);
    }
  }

  function stopStream() {
    requestRef.current++; // invalidate any getUserMedia still pending
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setSharedStream(null);
    try {
      videoRef.current?.pause();
    } catch {
      // jsdom or unsupported media environment
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!unmountedRef.current) {
      setHasStream(false);
      setDelegate("");
    }
  }

  /** Failure path: back to "off" with a short reason, pointer/keyboard unaffected. */
  function reportCameraFailure(message: string) {
    reportCameraUnavailable();
    publishCameraAssistState("failed");
    setHasStream(false);
    setIsOn(false);
    setFailed(true);
    setToggleLabel("Nyalakan Kamera");
    setPreviewLabel(message);
    setStatusNote(message);
  }

  async function startCamera(selectedDevice = "") {
    stopStream();
    const token = requestRef.current; // stopStream() just bumped it; this request owns the new value
    const isStale = () => token !== requestRef.current || unmountedRef.current;
    setFailed(false);
    setStatusNote("");
    setPreviewLabel("Membuka kamera…");
    if (!navigator.mediaDevices?.getUserMedia) {
      reportCameraFailure(messageFor("unsupported"));
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await requestCameraStream(selectedDevice);
      if (isStale()) {
        // Toggled off / switched / unmounted while the permission prompt was open: do not keep the lens live.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      // Publish app-wide: the canvas hand driver reuses this exact stream
      // instead of opening a second camera (zero double camera).
      streamRef.current = stream;
      setSharedStream(stream);
      reportCameraAvailable();
      if (modeRef.current === "cover") warmModelOnce();
      // Camera unplugged / permission revoked mid-session: tear down and say why.
      const live = stream;
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener?.("ended", () => {
          if (streamRef.current !== live) return;
          stopStream();
          reportCameraFailure(messageFor("camera-lost"));
        }),
      );
      const video = videoRef.current;
      if (!video) {
        // Card node must never be recreated, but guard anyway: keep the stream
        // alive on the ref so a late <video> attach can still use it.
        setHasStream(true);
        return;
      }
      video.srcObject = stream;
      // Owner B04-004: a successful user-enabled, playable camera stream wakes Momo.
      // A click alone, denied permission, failed playback, or stale request must never wake her.
      await video.play();
      if (isStale()) return;
      if (stream.getVideoTracks().length === 0 || stream.getVideoTracks().some((track) => track.readyState === "ended")) {
        throw new Error("Camera stream ended before playback");
      }
      setHasStream(true);
      publishCameraAssistState("ready");
      setPreviewLabel("Kamera siap!");
      if (modeRef.current === "cover" && !wokenRef.current) wakeRef.current();
      const activeTrack = stream.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings?.().deviceId || selectedDevice;
      await populateCameraChoices(activeDeviceId);
    } catch (error) {
      if (isStale()) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      // Playback or permission failed: release the stream and leave Momo asleep.
      stopStream();
      const reason = classifyCameraError(error);
      reportCameraFailure(messageFor(reason === "model-error" || reason === "tracker-error" ? "camera-failed" : reason));
    }
  }

  /**
   * Cold start (I1): on the cover, the hand model starts loading as soon as the camera permission is granted, in the
   * background and once per mount. The loader may have already prewarmed it; this is idempotent.
   * The cover does not start a wave tracker, so this does not block waking on a playable stream.
   */
  function warmModelOnce() {
    if (warmStartedRef.current) return;
    warmStartedRef.current = true;
    void warmHandLandmarker({ wasmRoot: WASM_ROOT, modelUrl: modelUrlRef.current }).catch(() => undefined);
  }

  async function setCameraState(nextOn: boolean) {
    setIsOn(nextOn);
    if (nextOn) setFailed(false);
    if (nextOn) {
      setToggleLabel("Kamera Aktif");
      await startCamera(deviceId);
      return;
    }
    stopStream();
    publishCameraAssistState("idle");
    setFailed(false);
    setStatusNote("");
    setToggleLabel("Nyalakan Kamera");
    setPreviewLabel("Camera Preview");
  }

  const coverStep = awake ? { ...COVER_WAKE, mood: wake.startled ? "Kaget" : COVER_WAKE.mood } : null;
  const showCoverMomo = mode === "cover" || momoPhase !== "gone";
  // Only the explicit no-camera fallback shows a text wake button.
  const showWakeButton = mode === "cover" && !awake && !coverDone && inputMode === "fallback";

  return (
    <div
      className={`global-camera-host camera-prototype-root mode-${layoutMode}${recessed ? " is-recessed" : ""}${awake ? " has-momo-awake" : ""}${mode === "cover" ? " is-cover-stage" : ""}`}
      data-testid="global-camera-widget"
    >
      {/*
        Fixed child order (content -> card -> skip block) is deliberate: React
        keeps the SAME card node (and therefore the same <video> + MediaStream)
        when the mode flips, so the camera is never re-requested.
      */}
      <div className="content">
        {mode === "cover" && (
          <>
            <div className="eyebrow">Sketchbook Universe Present</div>
            {/* R12-01: the visible title of the cover. Stays while Momo sleeps; the PIP never shows it (CSS). */}
            <p className="cover-wordmark" data-testid="cover-wordmark">Sketchbook Universe</p>
            {/* Page title for screen readers only: the cover shows Momo and the camera, not a headline (R3). */}
            <h1 className="visually-hidden">Jarimu Adalah Kuas Ajaibnya!</h1>
          </>
        )}

        <div
          key="camera-core-card"
          ref={cameraCardRef}
          data-testid="camera-card"
          className={`camera-widget-card toggle-card ${isOn ? "on" : ""} ${hasStream ? "has-stream" : ""} ${failed ? "failed" : ""}`}
          data-delegate={delegate || undefined}
        >
          <div className="video-wrap">
            <video
              ref={videoRef}
              className="camera-video"
              autoPlay
              playsInline
              muted
              aria-label="Preview kamera"
            />
            <div className="video-inner">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span className="label">{previewLabel}</span>
            </div>
            <div className="rec-dot">REC</div>

          </div>

          <div className="toggle-row">
            <span className="toggle-label" onClick={() => void setCameraState(!isOn)}>
              {toggleLabel}
            </span>
            <button
              className="toggle-switch"
              type="button"
              role="switch"
              aria-checked={isOn}
              aria-label={isOn ? "Matikan kamera" : "Nyalakan kamera"}
              onClick={() => void setCameraState(!isOn)}
              data-testid="btn-camera-toggle-switch"
            />
          </div>

          <div className="camera-status" role="status" aria-live="polite" data-testid="camera-status">
            {statusNote}
          </div>

          {layoutMode === "floating" && !hasStream && (
            <div className="camera-off-nudge" data-testid="camera-off-nudge" role="status" aria-live="polite">
              <p className="camera-off-nudge__text">Aku belum bisa lihat kamu nih. Coba nyalakan kameranya, ya.</p>
            </div>
          )}

          {recessed && (
            <div className="global-camera-mode-switch" role="group" aria-label="Mode input gambar">
              <button type="button" className="mode-btn" data-input-mode="pointer" aria-pressed={drawingInputMode === "pointer"} onClick={() => { setDrawingInputMode("pointer"); setStatusNote(""); window.dispatchEvent(new CustomEvent("drawing-input-mode", { detail: "pointer" })); }}>Pointer</button>
              <button type="button" className="mode-btn" data-input-mode="hand" aria-pressed={drawingInputMode === "hand"} onClick={() => { setDrawingInputMode("hand"); setStatusNote(""); window.dispatchEvent(new CustomEvent("drawing-input-mode", { detail: "hand" })); }}>Tangan</button>
            </div>
          )}
          <div className="camera-select-wrap">
            <select
              className="camera-select"
              aria-label="Pilih kamera"
              value={deviceId}
              disabled={!devices.length}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                setDeviceId(event.target.value);
                if (isOn) void startCamera(event.target.value);
              }}
            >
              {devices.length ? (
                devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Kamera ${index + 1}`}
                  </option>
                ))
              ) : (
                <option value="">Pilih kamera</option>
              )}
            </select>
          </div>
        </div>

        {showCoverMomo && (
          <MomoGuide
            placement="cover"
            height={flying ? MOMO_CENTER_PX : MOMO_COVER_PX}
            fullSize={flying}
            className={[flying ? "is-centered" : "", momoPhase === "fading" ? "is-leaving" : ""].filter(Boolean).join(" ")}
            rootRef={momoRef}
            sleeping={!awake}
            step={coverStep}
            flapKey={awake ? wake.key : 0}
            waveKey={awake ? wake.wave : 0}
            startDelay={awake ? DIALOG_START_MS : 0}
            pace={COVER_DIALOG_PACE}
            extrasFrom="first"
            onDone={() => setCoverLinesTyped(true)}
            testId="cover-momo"
          >
            {awake && coverLinesTyped && !coverDone && (
              <ThumbConfirm holdMs={COVER_THUMB_HOLD_MS} label="Aku mengerti" onConfirm={onThumbConfirm} testId="cover-thumb" />
            )}
          </MomoGuide>
        )}

        {showWakeButton && (
          <div className="cover-skip-block cover-fallback" data-testid="cover-fallback">
            {inputMode === "fallback" && <p className="cover-fallback__note">{COVER_NO_CAMERA_HINT}</p>}
            <button type="button" className="camera-skip nb-btn" data-testid="cover-wake" onClick={() => wakeRef.current()}>
              Bangunkan Momo
              <Icon name="arrow-right" size={18} stroke={2.8} />
            </button>
          </div>
        )}
      </div>
      <BookFlip playKey={flipKey} direction="open" label="Sketchbook Universe" testId="cover-book-flip" onMidpoint={handOff} />
    </div>
  );
}
