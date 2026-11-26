"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { LegacyGlyph, OwnerIcon } from "@/src/components/ui/owner-icons";
import { TUTORIAL_COPY } from "@/src/domain/copy/tutorial";
import { CharacterAnimationAdapter } from "@/src/game/character/character-animation-adapter";
import { clamp } from "@/src/features/shared/bubble-placement";
import { useJoystick, useOptionalNui } from "@/src/nui/react";
import {
  FIGURE_FPS,
  KEY_STEP,
  WALK_END,
  WALK_START,
  clampWalk,
} from "./tutorial-machine";

export interface CardWalkProps {
  readonly active: boolean;
  readonly onComplete: () => void;
}

/**
 * Praktik Kartu 1 (port kartu.js:96-131):
 * - Thinman rig asli (CharacterAnimationAdapter) dirender maks 30 fps hanya saat perubahan SVG.
 * - Joystick Aturan C (`useJoystick`) + panah keyboard ← → ↑ + drag fallback.
 * - Lompat tap/sentil atau ArrowUp, bendera berkibar & centang hijau saat mencapai 76%.
 */
export function CardWalk({ active, onComplete }: CardWalkProps) {
  const nui = useOptionalNui();
  const [done, setDone] = useState(false);
  const [moved, setMoved] = useState(false);
  const [pctDisplay, setPctDisplay] = useState(0);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const manRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLSpanElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLSpanElement | null>(null);
  const flagRef = useRef<SVGPathElement | null>(null);
  const winRef = useRef<HTMLSpanElement | null>(null);

  const adapterRef = useRef<CharacterAnimationAdapter | null>(null);
  const posRef = useRef(14);
  const doneRef = useRef(false);
  const movedRef = useRef(false);
  const lastMoveRef = useRef(0);
  const lastSvgRef = useRef("");
  const physRef = useRef({ vx: 0, vy: 0, on: true, face: 1 as 1 | -1, term: undefined as "win" | undefined });
  const dragRef = useRef<{ startX: number; anchorPos: number } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finishWalk = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    physRef.current = { vx: 0, vy: 0, on: true, face: 1, term: "win" };
    if (winRef.current) {
      gsap.fromTo(winRef.current, { rotation: -30, scale: 0 }, { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(2.2)" });
    }
    if (flagRef.current) {
      gsap.to(flagRef.current, {
        skewY: 6,
        scaleX: 0.9,
        transformOrigin: "10px 20px",
        duration: 0.45,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    }
    onCompleteRef.current();
  }, []);

  const setPosition = useCallback(
    (nextRaw: number) => {
      const p = clampWalk(nextRaw);
      const dx = p - posRef.current;
      if (Math.abs(dx) < 0.01 && p < WALK_END - 0.01) return;
      if (!movedRef.current) {
        movedRef.current = true;
        setMoved(true);
        if (hintRef.current) gsap.to(hintRef.current, { opacity: 0, duration: 0.35 });
      }
      physRef.current.vx = (dx >= 0 ? 1 : -1) * 130;
      physRef.current.face = dx >= 0 ? 1 : -1;
      lastMoveRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      posRef.current = p;
      setPctDisplay(Math.round(((p - 14) / (WALK_END - 14)) * 100));
      if (manRef.current) {
        manRef.current.style.left = `${p}%`;
        gsap.set(manRef.current, { xPercent: -50 });
      }
      if (trailRef.current) {
        trailRef.current.style.width = `${Math.max(0, p - 14)}%`;
      }
      if (p >= WALK_END - 0.01) finishWalk();
    },
    [finishWalk],
  );

  const hop = useCallback(() => {
    const body = bodyRef.current;
    if (doneRef.current || !physRef.current.on || !body) return;
    physRef.current.on = false;
    physRef.current.vy = -420;
    gsap.fromTo(
      body,
      { y: 0 },
      {
        y: -52,
        duration: 0.28,
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
        onUpdate() {
          if (this.progress() > 0.5) physRef.current.vy = 420;
        },
        onComplete() {
          physRef.current.on = true;
          physRef.current.vy = 0;
        },
      },
    );
  }, []);

  const joy = useJoystick({
    enabled: active && !done,
    showOverlay: true,
    ignore: "[data-nui-off],button,a,.tut-thumb",
    onJump: hop,
  });

  // Hand sweep idle hint
  useEffect(() => {
    const el = handRef.current;
    if (!el || moved) return;
    const ctx = gsap.context(() => {
      gsap.set(el, { x: -22 });
      gsap.to(el, { x: 22, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 });
    }, el);
    return () => ctx.revert();
  }, [moved]);

  // 30 fps CharacterAnimationAdapter loop + joystick movement integration
  useEffect(() => {
    if (!adapterRef.current) adapterRef.current = new CharacterAnimationAdapter({ variant: "A" });
    if (manRef.current) gsap.set(manRef.current, { xPercent: -50 });

    let rafId = 0;
    let lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    let figAcc = 0;
    const minStep = 1 / FIGURE_FPS;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (active && !doneRef.current) {
        if (now - lastMoveRef.current > 140) physRef.current.vx = 0;
        const dir = joy.dir();
        if (dir) setPosition(posRef.current + dir * 24 * dt);
      }

      figAcc += dt;
      if (figAcc >= minStep && bodyRef.current && adapterRef.current) {
        const step = Math.min(0.066, figAcc);
        figAcc = 0;
        const st = physRef.current;
        adapterRef.current.update(
          { x: 0, y: 0, vx: st.vx, vy: st.vy, grounded: st.on, facing: st.face, terminalPhase: st.term },
          step,
        );
        const svg = adapterRef.current.renderSvg(st.face);
        if (svg !== lastSvgRef.current) {
          lastSvgRef.current = svg;
          bodyRef.current.innerHTML = svg;
        }
      }

      if (active || !doneRef.current) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, joy, setPosition]);

  // Arrow keys fallback (matching kartu.js:124-129)
  useEffect(() => {
    if (!active || done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input,textarea,select")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPosition(posRef.current + KEY_STEP);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPosition(posRef.current - KEY_STEP);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        hop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, done, setPosition, hop]);

  return (
    <div
      ref={sceneRef}
      className="tut-scene tut-walk"
      data-testid="r83-tut-walk"
      aria-label={TUTORIAL_COPY.walkSceneAriaLabel(clamp(pctDisplay, 0, 100))}
      onPointerDown={(e) => {
        const st = nui?.getStatus();
        if (!active || done || st?.simOn || st?.handAttached || st?.activeSource === "hand") return;
        dragRef.current = { startX: e.clientX, anchorPos: posRef.current };
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        const scene = sceneRef.current;
        if (!drag || !scene || done) return;
        const st = nui?.getStatus();
        if (st?.simOn || st?.handAttached || st?.activeSource === "hand") {
          dragRef.current = null;
          return;
        }
        const w = Math.max(120, scene.getBoundingClientRect().width);
        setPosition(drag.anchorPos + ((e.clientX - drag.startX) / w) * 100);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <div ref={hintRef} className="tut-handhint" aria-hidden="true">
        <span className="ha"><LegacyGlyph name="left" size={26} /></span>
        <span ref={handRef} className="tut-handhint__hand"><OwnerIcon name="gesture-pinch" size={48} /></span>
        <span className="ha"><LegacyGlyph name="right" size={26} /></span>
      </div>
      <svg className="tut-walk__ground" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 14Q150 8 300 14T600 12" fill="none" stroke="#111" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M30 24l-6 10M90 24l-5 9M170 25l-6 10M260 24l-5 10M350 25l-6 9M450 24l-5 10M530 25l-6 9"
          stroke="#111"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity=".45"
        />
      </svg>
      <div ref={trailRef} className="tut-walk__trail" style={{ width: 0 }} />
      <div ref={manRef} className="tut-walk__man" style={{ left: "14%" }} aria-hidden="true">
        <span ref={bodyRef} className="wb" />
      </div>
      <div className="tut-walk__flag" aria-hidden="true">
        <svg className="tut-flag" viewBox="0 0 60 80" aria-hidden="true" focusable="false">
          <path d="M8 78V4" stroke="#111" strokeWidth="3.4" strokeLinecap="round" />
          <path
            ref={flagRef}
            className="tut-flag__cloth"
            d="M10 6L52 20L10 36Z"
            fill="#ef7a37"
            stroke="#111"
            strokeWidth="3.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span ref={winRef} className="tut-win" data-done={done ? "true" : "false"} aria-hidden="true">
        <OwnerIcon name="check" size={34} />
      </span>
    </div>
  );
}
