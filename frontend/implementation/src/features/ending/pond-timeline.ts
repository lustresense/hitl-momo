import gsap from "gsap";
import { CharacterAnimationAdapter } from "@/src/game/character/character-animation-adapter";
import type { GameTerminalPhase } from "@/src/game/character/character-types";
import { worldPercentH, worldPercentW, worldPercentX, worldPercentY } from "./end-camera";
import { POND_EXIT_X, POND_X, sampleGroundY } from "./end-walker";

export {
  createThinmanFrontRig,
  extractThinmanFrontParts,
  type ThinmanFrontParts,
  type ThinmanFrontRig,
} from "./thinman-front-rig";

/**
 * Utilitas timeline GSAP kolam tinta & renderer sisi Thinman.
 * Port 1:1 `proto-html/r83/shared/end/pond.js` + `world.js:17-38`.
 */

const ADAPTER_VELOCITY_SCALE = 2.6;

export const CHUTE_SVG_MARKUP =
  '<svg viewBox="0 0 120 132" aria-hidden="true">' +
  '<g class="lines" stroke="#111" stroke-width="2" stroke-linecap="round">' +
  '<path d="M8 62L60 126M34 62L60 126M60 62L60 126M86 62L60 126M112 62L60 126"/>' +
  "</g>" +
  '<path class="canopy" d="M6 62C6 26 30 6 60 6C90 6 114 26 114 62Q101 50 87 62Q74 50 60 62Q46 50 33 62Q19 50 6 62Z" fill="#ef7a37" stroke="#111" stroke-width="3.4" stroke-linejoin="round"/>' +
  '<path d="M33 61Q36 26 60 7M60 61V7M87 61Q84 26 60 7" fill="none" stroke="#111" stroke-width="2.4"/>' +
  '<path d="M33 61Q36 26 60 7Q50 28 46 61Z" fill="#f0d487" opacity=".95"/>' +
  '<path d="M87 61Q84 26 60 7Q70 28 74 61Z" fill="#f0d487" opacity=".95"/>' +
  "</svg>";

export const POND_SVG_MARKUP =
  '<svg viewBox="0 0 150 40" aria-hidden="true">' +
  '<ellipse cx="75" cy="22" rx="70" ry="15" fill="#15171b" stroke="#111" stroke-width="3.4"/>' +
  '<path d="M20 18Q42 8 76 9" fill="none" stroke="#fffdf6" stroke-opacity=".6" stroke-width="3.2" stroke-linecap="round"/>' +
  '<path d="M108 13Q122 15 128 20" fill="none" stroke="#fffdf6" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/>' +
  '<ellipse class="idle-rip" cx="75" cy="22" rx="34" ry="6.5" fill="none" stroke="#fffdf6" stroke-opacity=".32" stroke-width="1.6"/>' +
  "</svg>";

export interface HeroMotionState {
  readonly vx: number;
  readonly vy: number;
  readonly on: boolean;
  readonly face: 1 | -1;
}

export interface HeroSideRenderer {
  place(px: number, py: number): void;
  update(st: HeroMotionState, dt: number, terminal?: GameTerminalPhase): void;
  stand(face?: 1 | -1): void;
}

export function createHeroSideRenderer(
  heroEl: HTMLElement,
  artEl: HTMLElement,
): HeroSideRenderer {
  const adapter = new CharacterAnimationAdapter({ variant: "A" });
  let currentFace: 1 | -1 = 1;

  return {
    place(px, py) {
      heroEl.style.left = `${worldPercentX(px)}%`;
      heroEl.style.top = `${worldPercentY(py)}%`;
    },
    update(st, dt, terminal) {
      adapter.update(
        {
          x: 0,
          y: 0,
          vx: st.vx * ADAPTER_VELOCITY_SCALE,
          vy: st.vy * ADAPTER_VELOCITY_SCALE,
          grounded: st.on,
          facing: st.face,
          terminalPhase: terminal,
        },
        dt,
      );
      artEl.innerHTML = adapter.renderSvg(st.face);
      currentFace = st.face;
      heroEl.classList.toggle("flip", st.face < 0);
    },
    stand(face = currentFace) {
      currentFace = face;
      adapter.reset();
      adapter.update({ x: 0, y: 0, vx: 0, vy: 0, grounded: true, facing: face }, 0.016);
      artEl.innerHTML = adapter.renderSvg(face);
      heroEl.classList.toggle("flip", face < 0);
    },
  };
}

export interface PondDiveParams {
  readonly heroEl: HTMLElement;
  readonly pondEl: HTMLElement;
  readonly fxLayer: HTMLElement;
  readonly worldEl: HTMLElement;
  readonly heroRenderer: HeroSideRenderer;
  readonly startX: number;
  readonly onFollowCam: (x: number) => void;
  readonly onAlive?: () => void;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Animasi kolam tinta: lompat -> cipratan -> tenggelam -> cahaya -> keluar bercahaya & oranye. */
export function runPondDiveSequence(
  params: PondDiveParams,
): { readonly promise: Promise<void>; readonly cancel: () => void } {
  const { heroEl, pondEl, fxLayer, worldEl, heroRenderer, startX, onFollowCam, onAlive } = params;
  let cancelled = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const spawned = new Set<HTMLElement>();
  const tweens = new Set<gsap.core.Animation>();

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (cancelled) { resolve(); return; }
      const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
      timers.add(id);
    });

  const tw = (target: gsap.TweenTarget, vars: gsap.TweenVars): Promise<void> =>
    new Promise((resolve) => {
      if (cancelled) { resolve(); return; }
      const tween = gsap.to(target, { ...vars, onComplete: () => { tweens.delete(tween); resolve(); } });
      tweens.add(tween);
    });

  const arc = (
    from: readonly [number, number],
    to: readonly [number, number],
    dur: number,
    height: number,
    face: 1 | -1,
    onT?: (t: number) => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      if (cancelled) { resolve(); return; }
      const o = { t: 0 };
      const tween = gsap.to(o, {
        t: 1,
        duration: dur,
        ease: "none",
        onUpdate: () => {
          if (cancelled) return;
          const t = o.t;
          const x = from[0] + (to[0] - from[0]) * t;
          const y = from[1] + (to[1] - from[1]) * t - height * 4 * t * (1 - t);
          heroRenderer.place(x, y);
          heroRenderer.update(
            {
              vx: (to[0] - from[0]) / dur,
              vy: (to[1] - from[1]) / dur - (height * 4 * (1 - 2 * t)) / dur,
              on: false,
              face,
            },
            0.016,
          );
          onFollowCam(x);
          onT?.(t);
        },
        onComplete: () => { tweens.delete(tween); resolve(); },
      });
      tweens.add(tween);
    });

  const spawn = (cls: string, css: string): HTMLElement => {
    const el = document.createElement("i");
    el.className = cls;
    el.style.cssText = css;
    fxLayer.appendChild(el);
    spawned.add(el);
    return el;
  };
  const dropNode = (el: HTMLElement) => {
    spawned.delete(el);
    el.remove();
  };

  const promise = (async () => {
    const u = (worldEl.offsetWidth || 490) / 490;
    const cyu = sampleGroundY(POND_X);
    const px = `${worldPercentX(POND_X)}%`;
    const py = `${worldPercentY(cyu)}%`;

    await arc([startX, sampleGroundY(startX)], [POND_X, cyu + 3], 0.85, 38, 1);
    if (cancelled) return;

    for (let k = 0; k < 14; k++) {
      const d = spawn("ink", `left:${px};top:${py};width:${u * rnd(1.6, 3)}px;height:${u * rnd(1.6, 3)}px`);
      gsap.set(d, { xPercent: -50, yPercent: -50 });
      tweens.add(gsap.to(d, { x: rnd(-1, 1) * u * 30, y: -u * rnd(14, 38), duration: rnd(0.3, 0.5), ease: "power2.out" }));
      tweens.add(gsap.to(d, { y: `+=${u * 34}`, opacity: 0, duration: 0.45, delay: 0.35, ease: "power2.in", onComplete: () => dropNode(d) }));
    }
    for (let k = 0; k < 3; k++) {
      const r = spawn("ripple", `left:${px};top:${py};width:${worldPercentW(70)}%`);
      gsap.set(r, { xPercent: -50, yPercent: -50 });
      tweens.add(gsap.fromTo(r, { scale: 0.3, opacity: 0.85 }, { scale: 1.5, opacity: 0, duration: 1.1, delay: k * 0.22, ease: "power1.out", onComplete: () => dropNode(r) }));
    }

    await tw(heroEl, { y: u * 15, scaleY: 0.5, opacity: 0, duration: 0.55, ease: "power2.in" });
    await sleep(450);
    if (cancelled) return;

    const beam = spawn("beam", `left:${px};top:${py};width:${worldPercentW(46)}%;height:${worldPercentH(150)}%`);
    gsap.set(beam, { xPercent: -50, yPercent: -100, transformOrigin: "50% 100%", scaleY: 0, opacity: 0 });
    tweens.add(gsap.to(pondEl, { filter: "drop-shadow(0 0 24px #f0d487)", duration: 0.5, yoyo: true, repeat: 1 }));
    for (let k = 0; k < 11; k++) {
      const g = spawn("glint", `left:${px};top:${py};width:${u * rnd(2, 3.6)}px;height:${u * rnd(2, 3.6)}px`);
      gsap.set(g, { xPercent: -50, yPercent: -50, x: rnd(-1, 1) * u * 14, opacity: 0 });
      tweens.add(gsap.fromTo(g, { y: 0, scale: 0.4, opacity: 0 }, { y: -u * rnd(30, 90), scale: 1, opacity: 1, duration: rnd(0.7, 1.1), delay: 0.15 + k * 0.07, ease: "power1.out", yoyo: true, repeat: 1, onComplete: () => dropNode(g) }));
    }
    await tw(beam, { scaleY: 1, opacity: 1, duration: 0.7, ease: "power2.out" });
    if (cancelled) return;

    heroEl.classList.add("alive");
    onAlive?.();
    gsap.set(heroEl, { opacity: 1, y: 0, scaleY: 1, scale: 0.6, filter: "drop-shadow(0 0 16px #fff4b0) brightness(1.5)" });
    const lx = POND_EXIT_X;
    const ly = sampleGroundY(lx);
    tweens.add(gsap.to(beam, { opacity: 0, duration: 0.9, delay: 0.5, onComplete: () => dropNode(beam) }));
    await arc([POND_X, cyu], [lx, ly], 1.25, 64, -1, (t) => {
      gsap.set(heroEl, { scale: 0.6 + 0.4 * t, rotation: t < 0.8 ? t * 540 : 0 });
    });
    if (cancelled) return;

    gsap.set(heroEl, { rotation: 0, scale: 1, filter: "none" });
    heroRenderer.place(lx, ly);
    heroRenderer.update({ vx: 0, vy: 0, on: true, face: -1 }, 0.016);
    await sleep(350);
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const t of tweens) t.kill();
      tweens.clear();
      for (const el of spawned) el.remove();
      spawned.clear();
    },
  };
}
