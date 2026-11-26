"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { MomoAvatar } from "@/src/components/momo/MomoAvatar";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import {
  anchorPoint, clamp, momoBase, momoPath, samplePath,
  type AnchorName, type Base, type EndingTarget, type PathPoint, type Pose, type Rect,
} from "./bubble-placement";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface ActiveFlight { start: number; duration: number; points: readonly PathPoint[]; resolve: () => void }

export interface MomoStageHandle {
  /** Fly to an anchor (ui.js:63-71 momoTo). Resolves on arrival; ms <= 0 jumps immediately. */
  moveTo(name: AnchorName, ms?: number, tilt?: number): Promise<void>;
  /** Fly along an explicit Hermite keyframe path (momo.js:60-71,103-106). */
  moveAlong(points: readonly PathPoint[], ms: number): Promise<void>;
  /** Jump directly to a pose without changing the active anchor. */
  setPose(next: Pose): void;
  /** Elastic landing squash on Momo inner artwork (matches dream.js:132). */
  squash(): void;
  /** Current viewport rect of Momo, or null if not mounted. */
  rect(): Rect | null;
  anchor(): AnchorName;
  pose(): Readonly<Pose>;
  element(): HTMLDivElement | null;
}

export interface MomoStageProps {
  /** Initial anchor on mount (later moves go through the imperative handle). */
  at?: AnchorName;
  expression: MomoExpression;
  sleeping?: boolean;
  flapKey?: number;
  waveKey?: number;
  fog?: number;
  pointKey?: number;
  pointSide?: "left" | "right";
  /** Optional eye gaze target element (tracks toward target rect in SVG art units). */
  gazeTarget?: () => { left: number; top: number; width: number; height: number } | null;
  /** Returns Thinman's rect; read only by the `ending` anchor (end.js:145-148). */
  endingTarget?: () => EndingTarget | null;
  /** Initial start pose override (e.g., flying in from off-screen); defaults to `at`. */
  from?: Pose;
  hidden?: boolean;
  className?: string;
  label?: string;
}

const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Port of proto-html/r83/shared/ui.js anchors + momo.js Hermite flight.
 * Reuses MomoAvatar (momo-engine) and drives transforms exclusively via refs + rAF
 * (0 React state commits per frame, idempotent under React StrictMode).
 */
export const MomoStage = forwardRef<MomoStageHandle, MomoStageProps>(function MomoStage(
  { at = "corner", expression, sleeping = false, flapKey, waveKey, fog, pointKey, pointSide, gazeTarget, endingTarget, from, hidden = false, className, label },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialAnchorRef = useRef<AnchorName>(at);
  const initialFromRef = useRef<Pose | undefined>(from);
  const anchorRef = useRef<AnchorName>(at);
  const poseRef = useRef<Pose>({ x: 0, y: 0, s: 1, r: 0 });
  const baseRef = useRef<Base>({ w: 176, h: 261 });
  const targetRef = useRef(endingTarget);
  targetRef.current = endingTarget;

  const flightRef = useRef<ActiveFlight | null>(null);
  const rafRef = useRef<number>(0);
  const [base, setBase] = useState<Base>(() => baseRef.current);
  const gazeFnRef = useRef(gazeTarget);
  gazeFnRef.current = gazeTarget;
  const hasGaze = Boolean(gazeTarget);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hasGaze || typeof window === "undefined") {
      setGaze(null);
      return;
    }
    let raf = 0;
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    const stepGaze = () => {
      const fn = gazeFnRef.current;
      const el = hostRef.current;
      if (fn && el) {
        const t = fn();
        const mr = el.getBoundingClientRect();
        if (t && mr.width > 0 && mr.height > 0) {
          const tx = t.left + t.width / 2;
          const ty = t.top + t.height / 2;
          const mx = mr.left + mr.width / 2;
          const my = mr.top + mr.height * 0.34;
          const angle = Math.atan2(ty - my, tx - mx);
          const dist = Math.min(1, Math.hypot(tx - mx, ty - my) / 400);
          const gx = Math.round(Math.cos(angle) * 34 * dist);
          const gy = Math.round(Math.sin(angle) * 28 * dist);
          if (gx !== lastX || gy !== lastY) {
            lastX = gx;
            lastY = gy;
            setGaze({ x: gx, y: gy });
          }
        }
      }
      raf = window.requestAnimationFrame(stepGaze);
    };
    raf = window.requestAnimationFrame(stepGaze);
    return () => { window.cancelAnimationFrame(raf); };
  }, [hasGaze]);

  const computeAnchor = useCallback((name: AnchorName) => {
    if (typeof window === "undefined") return { x: 0, y: 0, s: 1 };
    return anchorPoint(name, { w: window.innerWidth, h: window.innerHeight }, baseRef.current, targetRef.current?.() ?? undefined);
  }, []);

  const applyPose = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const p = poseRef.current, b = baseRef.current;
    el.dataset.anchor = anchorRef.current;
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
    el.style.transformOrigin = "50% 50%";
    el.style.transform = `translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0) translate(-50%,-50%) rotate(${p.r.toFixed(2)}deg) scale(${Math.max(0.015, p.s).toFixed(4)})`;
  }, []);

  const cancelFlight = useCallback(() => {
    if (rafRef.current && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const prev = flightRef.current;
    flightRef.current = null;
    prev?.resolve();
  }, []);

  const startFlight = useCallback(
    (points: readonly PathPoint[], duration: number): Promise<void> => {
      cancelFlight();
      if (typeof window === "undefined" || duration <= 0 || points.length === 0) {
        const last = points[points.length - 1];
        if (last) {
          poseRef.current = { x: last.x, y: last.y, s: last.s, r: last.r };
          applyPose();
        }
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        flightRef.current = { start: nowMs(), duration, points, resolve };
        const step = (now: number) => {
          const active = flightRef.current;
          if (!active) { rafRef.current = 0; return; }
          const t = clamp((now - active.start) / active.duration, 0, 1);
          poseRef.current = samplePath(active.points, t);
          applyPose();
          if (t >= 1) { flightRef.current = null; rafRef.current = 0; active.resolve(); return; }
          rafRef.current = window.requestAnimationFrame(step);
        };
        rafRef.current = window.requestAnimationFrame(step);
      });
    },
    [applyPose, cancelFlight],
  );

  useImperativeHandle(ref, () => ({
    moveTo(name, ms = 900, tilt = 0) {
      anchorRef.current = name;
      const dest = computeAnchor(name);
      if (ms <= 0) {
        cancelFlight();
        poseRef.current = { x: dest.x, y: dest.y, s: dest.s, r: 0 };
        applyPose();
        return Promise.resolve();
      }
      const pts = momoPath(poseRef.current, dest, tilt);
      if (!pts) { cancelFlight(); applyPose(); return Promise.resolve(); }
      return startFlight(pts, ms);
    },
    moveAlong: (points, ms) => startFlight(points, ms),
    setPose(next) {
      cancelFlight();
      poseRef.current = { x: next.x, y: next.y, s: next.s, r: next.r };
      applyPose();
    },
    squash() {
      const inner = hostRef.current?.querySelector(".momo-art");
      if (!inner) return;
      gsap.killTweensOf(inner);
      gsap.timeline()
        .to(inner, { scaleX: 1.03, scaleY: 0.95, duration: 0.28, ease: "sine.inOut" })
        .to(inner, { scaleX: 1, scaleY: 1, duration: 0.4, ease: "elastic.out(1, 0.5)" });
    },
    rect() {
      const r = hostRef.current?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    },
    anchor: () => anchorRef.current,
    pose: () => ({ ...poseRef.current }),
    element: () => hostRef.current,
  }), [applyPose, cancelFlight, computeAnchor, startFlight]);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const fit = () => {
      const next = momoBase({ w: window.innerWidth, h: window.innerHeight });
      baseRef.current = next;
      setBase((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    fit();
    anchorRef.current = initialAnchorRef.current;
    const startFrom = initialFromRef.current;
    if (startFrom) {
      poseRef.current = { x: startFrom.x, y: startFrom.y, s: startFrom.s, r: startFrom.r };
    } else {
      const a = computeAnchor(anchorRef.current);
      poseRef.current = { x: a.x, y: a.y, s: a.s, r: 0 };
    }
    applyPose();

    const onResize = () => {
      fit();
      if (!flightRef.current) {
        const a = computeAnchor(anchorRef.current);
        poseRef.current = { x: a.x, y: a.y, s: a.s, r: 0 };
      }
      applyPose();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelFlight();
    };
  }, [applyPose, cancelFlight, computeAnchor]);

  useIsoLayoutEffect(() => { applyPose(); }, [base, applyPose]);

  return (
    <div
      ref={hostRef}
      className={`r83-momo${className ? ` ${className}` : ""}`}
      data-anchor={at}
      aria-hidden={hidden || undefined}
      style={{ position: "fixed", left: 0, top: 0, pointerEvents: "none", display: hidden ? "none" : "flex", alignItems: "center", justifyContent: "center" }}
    >
      <MomoAvatar
        expression={expression}
        height={base.h}
        trackMotion
        sleeping={sleeping}
        flapKey={flapKey}
        waveKey={waveKey}
        fog={fog}
        pointKey={pointKey}
        pointSide={pointSide}
        gaze={gaze}
        label={label}
      />
    </div>
  );
});
