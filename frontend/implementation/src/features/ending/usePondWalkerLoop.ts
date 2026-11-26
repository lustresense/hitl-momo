"use client";

import { useEffect, useLayoutEffect, useRef, type Dispatch, type RefObject } from "react";
import gsap from "gsap";
import type { MomoStageHandle } from "@/src/features/shared/MomoStage";
import { useJoystick } from "@/src/nui";
import { computeEndCameraFit, computeEndCameraTx, stepEndCameraTx } from "./end-camera";
import {
  PARACHUTE_START_X,
  POND_EXIT_X,
  TALK_SPOT_X,
  createInitialWalkerState,
  stepEndWalker,
  type EndWalkerState,
} from "./end-walker";
import {
  isEndingFrontRigActive,
  isEndingJoystickEnabled,
  type EndingEvent,
  type EndingMachineState,
} from "./ending-machine";
import {
  createHeroSideRenderer,
  createThinmanFrontRig,
  type HeroSideRenderer,
  type ThinmanFrontRig,
} from "./pond-timeline";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface UsePondWalkerLoopOptions {
  readonly state: EndingMachineState;
  readonly dispatch: Dispatch<EndingEvent>;
  readonly worldRef: RefObject<HTMLDivElement | null>;
  readonly camRef: RefObject<HTMLDivElement | null>;
  readonly heroRef: RefObject<HTMLDivElement | null>;
  readonly artRef: RefObject<HTMLDivElement | null>;
  readonly pondRef: RefObject<HTMLDivElement | null>;
  readonly momoRef: RefObject<MomoStageHandle | null>;
  readonly onThinmanPoke: () => void;
}

export interface CamTargetState {
  scale: number;
  tx: number;
  ty: number;
  tgtX: number;
  tgtFrac: number;
}

/**
 * Mengelola loop rAF/GSAP walker Thinman (joystick khusus fase `kolam`, auto-walk ke 300),
 * kamera 21%, riak kolam, dan rig pose depan `thinrig` (nol React commit per frame).
 */
export function usePondWalkerLoop({
  state,
  dispatch,
  worldRef,
  camRef,
  heroRef,
  artRef,
  pondRef,
  momoRef,
  onThinmanPoke,
}: UsePondWalkerLoopOptions) {
  const joystick = useJoystick({ enabled: isEndingJoystickEnabled(state) });

  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const pokeRef = useRef(onThinmanPoke);
  pokeRef.current = onThinmanPoke;

  const walkerRef = useRef<EndWalkerState>(
    createInitialWalkerState(state.phase === "kolam" ? PARACHUTE_START_X : TALK_SPOT_X),
  );
  const camStateRef = useRef<CamTargetState>({
    scale: 1,
    tx: 0,
    ty: 0,
    tgtX: state.phase === "kolam" ? PARACHUTE_START_X : TALK_SPOT_X,
    tgtFrac: state.phase === "kolam" ? 0.5 : 0.42,
  });
  const heroRendererRef = useRef<HeroSideRenderer | null>(null);
  const frontRigRef = useRef<ThinmanFrontRig | null>(null);
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const pondSentRef = useRef(false);
  const spotSentRef = useRef(false);

  useIsoLayoutEffect(() => {
    const heroEl = heroRef.current;
    const artEl = artRef.current;
    const pondEl = pondRef.current;
    const worldEl = worldRef.current ?? heroEl?.closest<HTMLDivElement>(".world") ?? null;
    const camEl = camRef.current ?? heroEl?.closest<HTMLDivElement>(".cam") ?? null;
    if (!worldEl || !camEl || !heroEl || !artEl || !pondEl || typeof window === "undefined") return;

    const renderer = createHeroSideRenderer(heroEl, artEl);
    heroRendererRef.current = renderer;

    const frontActive = isEndingFrontRigActive(stateRef.current);
    const startX =
      stateRef.current.phase === "kolam"
        ? PARACHUTE_START_X
        : stateRef.current.phase === "bicara" && stateRef.current.bicaraSubPhase === "walking-to-spot"
          ? POND_EXIT_X
          : TALK_SPOT_X;

    walkerRef.current = {
      ...createInitialWalkerState(startX),
      face: frontActive || stateRef.current.phase !== "kolam" ? -1 : 1,
      hold: frontActive,
    };
    heroEl.classList.toggle("alive", stateRef.current.thinmanAlive);
    renderer.place(walkerRef.current.x, walkerRef.current.y);

    if (frontActive) {
      const rig = createThinmanFrontRig(heroEl, artEl);
      frontRigRef.current = rig;
      rig.mount();
      rig.idle();
      void momoRef.current?.moveTo("ending", 0);
    } else {
      renderer.stand(walkerRef.current.face);
    }

    const fitCam = () => {
      gsap.set(camEl, { x: 0, y: 0, scale: 1, transformOrigin: "0 0" });
      const fit = computeEndCameraFit({
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        worldW: worldEl.offsetWidth,
        worldH: worldEl.offsetHeight,
        heroHeightPx: heroEl.getBoundingClientRect().height,
        targetX: camStateRef.current.tgtX,
        targetFrac: camStateRef.current.tgtFrac,
      });
      camStateRef.current.scale = fit.scale;
      camStateRef.current.tx = fit.tx;
      camStateRef.current.ty = fit.ty;
      gsap.set(camEl, { x: fit.tx, y: fit.ty, scale: fit.scale, transformOrigin: "0 0" });
    };

    const ctx = gsap.context(() => {
      gsap.set(heroEl, { clearProps: "transform" });
      gsap.set(heroEl, { x: 0, y: 0, xPercent: -50, yPercent: -100 });
      fitCam();
      if (stateRef.current.phase === "kolam" && stateRef.current.kolamSubPhase === "walk") {
        gsap.from(pondEl, { scale: 0, opacity: 0, duration: 1, ease: "back.out(1.5)" });
      }
      const rip = pondEl.querySelector(".idle-rip");
      if (rip) {
        gsap.set(rip, { transformOrigin: "50% 50%" });
        gsap.fromTo(
          rip,
          { scale: 0.5, opacity: 0.9 },
          { scale: 1.9, opacity: 0, duration: 2.6, repeat: -1, ease: "sine.out" },
        );
      }
    }, worldEl);

    const onKey = (e: KeyboardEvent) => {
      if (!isEndingJoystickEnabled(stateRef.current)) {
        keysRef.current.left = false;
        keysRef.current.right = false;
        return;
      }
      if (e.target instanceof Element && e.target.closest("input,textarea")) return;
      const down = e.type === "keydown";
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        keysRef.current.left = down;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        keysRef.current.right = down;
      }
    };

    const onPoke = (e: PointerEvent) => {
      if (!isEndingFrontRigActive(stateRef.current)) return;
      e.stopPropagation();
      void frontRigRef.current?.react();
      pokeRef.current();
    };

    const tick = (_t: number, dtm: number) => {
      const dt = Math.min(0.05, Math.max(0.001, dtm / 1000));
      const cur = stateRef.current;
      const w = walkerRef.current;

      if (!w.hold) {
        const allowJoy = isEndingJoystickEnabled(cur);
        const res = stepEndWalker(
          w,
          {
            joystickAllowed: allowJoy,
            padDir: allowJoy ? joystick.dir() : 0,
            left: allowJoy && keysRef.current.left,
            right: allowJoy && keysRef.current.right,
          },
          dt,
        );
        walkerRef.current = res.state;
        renderer.place(res.state.x, res.state.y);
        renderer.update(
          { vx: res.state.vx, vy: res.state.vy, on: res.state.on, face: res.state.face },
          dt,
        );
        camStateRef.current.tgtX = res.state.x;

        if (allowJoy && res.enteredPond && !pondSentRef.current) {
          pondSentRef.current = true;
          dispatchRef.current({ type: "POND_REACHED" });
        }
        if (
          cur.phase === "bicara" &&
          cur.bicaraSubPhase === "walking-to-spot" &&
          res.arrivedAuto &&
          !spotSentRef.current
        ) {
          spotSentRef.current = true;
          dispatchRef.current({ type: "BICARA_SPOT_REACHED" });
        }
      }

      const targetTx = computeEndCameraTx(camStateRef.current.tgtX, camStateRef.current.tgtFrac, {
        viewportW: window.innerWidth,
        worldW: worldEl.offsetWidth,
        scale: camStateRef.current.scale,
      });
      const nextTx = stepEndCameraTx(camStateRef.current.tx, targetTx);
      if (nextTx !== camStateRef.current.tx) {
        camStateRef.current.tx = nextTx;
        gsap.set(camEl, { x: nextTx });
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("resize", fitCam);
    heroEl.addEventListener("pointerdown", onPoke);
    gsap.ticker.add(tick);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("resize", fitCam);
      heroEl.removeEventListener("pointerdown", onPoke);
      gsap.ticker.remove(tick);
      frontRigRef.current?.kill();
      frontRigRef.current = null;
      ctx.revert();
    };
  }, [worldRef, camRef, heroRef, artRef, pondRef, momoRef, joystick]);

  return { walkerRef, camStateRef, heroRendererRef, frontRigRef, spotSentRef };
}
