"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import {
  BUBBLE_REPLACE_MS, clamp, createPlacementThrottle, parseBubbleSegments, placeBubble, placementSignature,
  type AnchorName, type BubbleLayout, type BubbleSide, type Pose, type Rect,
} from "./bubble-placement";
import type { MomoStageHandle } from "./MomoStage";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface R83BubbleHandle {
  /** Underlying `.r83-bubble` DOM element (for ring placement & avoid checks). */
  element(): HTMLDivElement | null;
  /** Current bounding rect of the bubble, or null if hidden or unmounted. */
  rect(): Rect | null;
  /** Active tail side (`"left" | "right" | "up" | "down"`). */
  side(): BubbleSide;
  /** Force immediate placement recalculation (bypasses 200 ms throttle). */
  reposition(): void;
}

export interface R83BubbleProps {
  /** Bubble message; `**bold**` spans render safely as `<strong>` React nodes without raw HTML injection. */
  text: string;
  /** Visibility state; animates entrance/text swap/exit matching ui.js:84-94. */
  visible?: boolean;
  /** Momo's active anchor (determines width & side rules from ui.js:95-117). */
  anchor?: AnchorName;
  /** Optional ref to MomoStageHandle (provides both rect and zero-reflow pose signature). */
  momoRef?: RefObject<MomoStageHandle | null>;
  /** Optional custom getter for Momo's viewport rect (takes precedence over `momoRef`). */
  getMomoRect?: () => Rect | null;
  /** Optional custom getter for Momo's pose (used in placement signature to avoid reflows). */
  getMomoPose?: () => Readonly<Pose> | null;
  /** Optional explicit tail side override (`"left" | "right" | "up" | "down"`). */
  side?: BubbleSide;
  /** Optional interactive slot inside the bubble (e.g. BackToCoverRing, GuessPanel, FailPanel). */
  extra?: ReactNode;
  /** Alternative JSX children slot rendered inside `.r83-bubble__extra`. */
  children?: ReactNode;
  className?: string;
  ariaLive?: "polite" | "assertive" | "off";
  /** Optional coarse notification whenever layout placement runs. */
  onLayout?: (layout: BubbleLayout) => void;
}

/**
 * Port of proto-html/r83/shared/ui.js `#su-bubble` (`.r83-bubble`).
 * Renders safe React bold nodes without raw HTML injection, supports an optional
 * interactive extra/ring slot, and updates position via `placeBubble` +
 * `createPlacementThrottle(200)` in rAF through refs (0 React state commits per frame).
 */
export const R83Bubble = forwardRef<R83BubbleHandle, R83BubbleProps>(function R83Bubble(
  { text, visible = true, anchor = "corner", momoRef, getMomoRect, getMomoPose, side, extra, children, className, ariaLive = "polite", onLayout },
  ref,
) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const activeSideRef = useRef<BubbleSide>(side ?? "left");
  const wasVisibleRef = useRef(false);
  const hasExtra = Boolean(extra) || Boolean(children);

  const cfgRef = useRef({ visible, anchor, momoRef, getMomoRect, getMomoPose, side, textLength: text.length, hasExtra, onLayout });
  cfgRef.current = { visible, anchor, momoRef, getMomoRect, getMomoPose, side, textLength: text.length, hasExtra, onLayout };

  const segments = useMemo(() => parseBubbleSegments(text), [text]);

  const placeNow = useCallback(() => {
    const el = bubbleRef.current, cfg = cfgRef.current;
    if (!el || !cfg.visible || typeof window === "undefined") return;
    const mr = cfg.getMomoRect?.() ?? cfg.momoRef?.current?.rect() ?? null;
    if (!mr || (mr.width === 0 && mr.height === 0)) return;

    const vp = { w: window.innerWidth, h: window.innerHeight };
    const isVertical = cfg.side === "up" || cfg.side === "down" || (!cfg.side && cfg.anchor === "bottom");
    let layout: BubbleLayout;
    if (isVertical) {
      const bw0 = Math.min(clamp(vp.w * 0.42, 360, 600), vp.w - 24);
      el.style.width = `${bw0}px`;
      layout = placeBubble({ anchor: cfg.anchor, momo: mr, vp, extra: 0, height: el.offsetHeight, sideOverride: cfg.side });
    } else {
      const bw0 = Math.min(clamp(vp.w * 0.24, 300, 420), vp.w - 24);
      el.style.width = `${bw0}px`;
      const borderPad = Math.max(0, el.offsetWidth - bw0);
      const draft = placeBubble({ anchor: cfg.anchor, momo: mr, vp, extra: borderPad, height: 0, sideOverride: cfg.side });
      el.style.width = `${draft.width}px`;
      layout = placeBubble({
        anchor: cfg.anchor, momo: mr, vp, extra: borderPad,
        height: el.offsetHeight, renderedWidth: el.offsetWidth, sideOverride: cfg.side,
      });
    }

    el.style.width = `${layout.width}px`;
    el.style.left = `${layout.left}px`;
    el.style.top = `${layout.top}px`;
    el.dataset.side = layout.side;
    activeSideRef.current = layout.side;
    if (layout.tailX !== undefined) {
      el.style.setProperty("--tail-x", `${layout.tailX}px`);
      el.style.removeProperty("--tail-y");
    } else if (layout.tailY !== undefined) {
      el.style.setProperty("--tail-y", `${layout.tailY}px`);
      el.style.removeProperty("--tail-x");
    }
    cfg.onLayout?.(layout);
  }, []);

  useImperativeHandle(ref, () => ({
    element: () => bubbleRef.current,
    rect: () => {
      if (!cfgRef.current.visible) return null;
      const r = bubbleRef.current?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    },
    side: () => activeSideRef.current,
    reposition: () => placeNow(),
  }), [placeNow]);

  // Throttled rAF placement while visible (200 ms or immediate on signature change, §5.6).
  useIsoLayoutEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const throttle = createPlacementThrottle(BUBBLE_REPLACE_MS);
    let raf = 0;
    const tick = (now: number) => {
      const cfg = cfgRef.current;
      const pose = cfg.getMomoPose?.() ?? cfg.momoRef?.current?.pose() ?? null;
      const sig = placementSignature({
        pose, anchor: cfg.anchor, visible: cfg.visible, textLength: cfg.textLength,
        hasExtra: cfg.hasExtra, vp: { w: window.innerWidth, h: window.innerHeight }, extraKey: cfg.side,
      });
      if (throttle(now, sig)) placeNow();
      raf = window.requestAnimationFrame(tick);
    };
    const onResize = () => placeNow();
    placeNow();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, placeNow]);

  // Immediate re-measure when layout-affecting props change while visible.
  useIsoLayoutEffect(() => {
    if (visible) placeNow();
  }, [visible, anchor, side, hasExtra, text, placeNow]);

  // GSAP entrance, text-swap, and exit animations (ui.js:90-94).
  useIsoLayoutEffect(() => {
    const el = bubbleRef.current, txt = textRef.current;
    if (!el || !txt || typeof window === "undefined") return;
    if (!visible) {
      if (wasVisibleRef.current) {
        wasVisibleRef.current = false;
        gsap.killTweensOf(el);
        gsap.to(el, { opacity: 0, duration: 0.2 });
      } else {
        gsap.set(el, { opacity: 0 });
      }
      return;
    }
    const first = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    placeNow();
    gsap.killTweensOf([el, txt]);
    if (first) {
      audio.emit("bubble.show"); // edge: hidden -> visible (never on a text swap); wasVisibleRef is the previous value
      gsap.fromTo(el, { opacity: 0, y: 10, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.7)" });
    } else {
      gsap.fromTo(txt, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
    }
  }, [visible, text, placeNow]);

  // Kill tweens and reset visibility state on unmount (StrictMode safe).
  useIsoLayoutEffect(() => {
    const el = bubbleRef.current, txt = textRef.current;
    return () => {
      if (el && txt) gsap.killTweensOf([el, txt]);
      wasVisibleRef.current = false;
    };
  }, []);

  const rootClass = `r83-bubble${hasExtra ? " has-extra" : ""}${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`;
  return (
    <div
      ref={bubbleRef}
      className={rootClass}
      role="status"
      aria-live={ariaLive}
      aria-hidden={!visible || undefined}
      data-side={side ?? "left"}
      data-anchor={anchor}
      style={{ position: "fixed", zIndex: 46, pointerEvents: visible && hasExtra ? "auto" : "none" }}
    >
      <div ref={textRef} className="r83-bubble__text">
        {segments.map((seg, idx) => (seg.bold ? <strong key={idx}>{seg.text}</strong> : seg.text))}
      </div>
      {hasExtra ? <div className="r83-bubble__extra">{extra}{children}</div> : null}
    </div>
  );
});
