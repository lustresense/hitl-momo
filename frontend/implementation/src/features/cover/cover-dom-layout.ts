import { useRef, type RefObject } from "react";
import gsap from "gsap";
import type { BookCurlHandle } from "./BookCurlTransition";
import {
  clampCover,
  computeCoverLayout,
  computeGatePlacement,
  computeNameParkingPose,
  type CoverLayout,
} from "./cover-layout";
import type { CoverPhase } from "./cover-machine";

export interface CoverTimelineRefs {
  readonly root: RefObject<HTMLDivElement>;
  readonly hero: RefObject<HTMLDivElement>;
  readonly logoSlot: RefObject<HTMLDivElement>;
  readonly doodles: RefObject<HTMLDivElement>;
  readonly doodleBook: RefObject<SVGSVGElement>;
  readonly doodlePencil: RefObject<SVGSVGElement>;
  readonly momo: RefObject<HTMLDivElement>;
  readonly shadow: RefObject<HTMLDivElement>;
  readonly camera: RefObject<HTMLDivElement>;
  readonly gate: RefObject<HTMLDivElement>;
  readonly shade: RefObject<HTMLDivElement>;
  readonly spot: RefObject<HTMLDivElement>;
  readonly bubble: RefObject<HTMLDivElement>;
  readonly confirm: RefObject<HTMLDivElement>;
  readonly bookCurl: RefObject<BookCurlHandle>;
  readonly rulerPage: RefObject<HTMLDivElement>;
  readonly bookInsideBubble: RefObject<HTMLDivElement>;
  readonly nameCard: RefObject<HTMLDivElement>;
}

export function useCoverTimelineRefs(): CoverTimelineRefs {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const logoSlot = useRef<HTMLDivElement>(null);
  const doodles = useRef<HTMLDivElement>(null);
  const doodleBook = useRef<SVGSVGElement>(null);
  const doodlePencil = useRef<SVGSVGElement>(null);
  const momo = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const camera = useRef<HTMLDivElement>(null);
  const gate = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLDivElement>(null);
  const bookCurl = useRef<BookCurlHandle>(null);
  const rulerPage = useRef<HTMLDivElement>(null);
  const bookInsideBubble = useRef<HTMLDivElement>(null);
  const nameCard = useRef<HTMLDivElement>(null);
  const bundle = useRef<CoverTimelineRefs>({
    root, hero, logoSlot, doodles, doodleBook, doodlePencil, momo, shadow, camera,
    gate, shade, spot, bubble, confirm, bookCurl, rulerPage, bookInsideBubble, nameCard,
  });
  return bundle.current;
}

export function setMomoCenterPose(
  el: HTMLElement | null,
  x: number,
  y: number,
  s: number,
  r: number,
  layout: CoverLayout,
): void {
  if (!el) return;
  el.style.left = "0px";
  el.style.top = "0px";
  el.style.width = `${layout.mW}px`;
  el.style.height = `${layout.mH}px`;
  el.style.transformOrigin = "50% 50%";
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%) rotate(${r.toFixed(2)}deg) scale(${Math.max(0.015, s).toFixed(4)})`;
}

export function positionInsideBubble(
  bubbleEl: HTMLElement | null,
  momoEl: HTMLElement | null,
  vpW: number,
  vpH: number,
  dy = 0,
): void {
  if (!bubbleEl || !momoEl) return;
  const head = momoEl.getBoundingClientRect();
  if (head.width <= 0 || head.height <= 0) return;
  const bw = bubbleEl.getBoundingClientRect().width || Math.min(300, Math.max(190, vpW * 0.24));
  const left = Math.max(12, head.left - bw - 18);
  const bh = bubbleEl.offsetHeight || 68;
  const top = Math.max(16, Math.min(vpH - bh - 16, head.top - 15 + dy));
  bubbleEl.style.left = `${Math.round(left)}px`;
  bubbleEl.style.top = `${Math.round(top)}px`;
  bubbleEl.style.setProperty(
    "--tail-y",
    `${Math.round(clampCover(head.top + head.height * 0.35 - top, 18, Math.max(19, bh - 18)))}px`,
  );
}

/** Menyelaraskan visibilitas spotlight & gelembung sampul secara langsung (aman dari cleanup `ctx.revert()`). */
export function applySpotlightState(
  refs: CoverTimelineRefs,
  shadeOpacity: number,
  spotOpacity: number,
  bubbleOpacity: number,
): void {
  if (refs.shade.current) gsap.set(refs.shade.current, { opacity: shadeOpacity });
  if (refs.spot.current) gsap.set(refs.spot.current, { opacity: spotOpacity });
  if (refs.bubble.current) {
    gsap.set(
      refs.bubble.current,
      bubbleOpacity > 0 ? { opacity: bubbleOpacity, y: 0, scale: 1 } : { opacity: bubbleOpacity },
    );
  }
}

/** Mengumpulkan target DOM yang meluncur keluar saat fase `name-exit`. */
export function collectNameExitTargets(refs: CoverTimelineRefs): Element[] {
  return [
    refs.rulerPage.current?.querySelector(".ruler-heading"),
    refs.rulerPage.current?.querySelector(".ruler-sub"),
    refs.nameCard.current,
    refs.bookInsideBubble.current,
    refs.root.current?.querySelector("#replay"),
  ].filter((el): el is Element => Boolean(el));
}

/** Memposisikan elemen sampul secara deterministik berdasarkan viewport (`index.html:556-578, 863-884, 1207-1240`). */
export function applyCoverDomLayout(
  refs: CoverTimelineRefs,
  ph: CoverPhase,
  layout: CoverLayout = computeCoverLayout(1024, 768),
): void {
  const { w, h } = layout;
  const preWake = ph === "sleep" || ph === "gate" || ph === "camera-on";
  const cam = refs.camera.current;
  if (cam) {
    if (preWake) gsap.set(cam, { left: layout.cX, top: layout.smallY, width: layout.cardW, height: layout.smallH });
    else if (ph !== "wake") gsap.set(cam, { left: layout.pipX, top: layout.pipY, width: layout.pipW, height: layout.pipH });
  }
  if (refs.shadow.current) {
    refs.shadow.current.style.left = `${layout.mCX - 60}px`;
    refs.shadow.current.style.top = `${layout.smallY - 6}px`;
  }
  if (refs.spot.current) {
    refs.spot.current.style.left = `${Math.round(layout.midCX)}px`;
    refs.spot.current.style.top = `${Math.round(layout.midCY)}px`;
  }
  if (refs.bubble.current) {
    refs.bubble.current.style.left = `${layout.dialogLeft}px`;
    refs.bubble.current.style.top = `${layout.dialogTop}px`;
    refs.bubble.current.style.setProperty("--tail-x", layout.mobile ? "45%" : "24%");
    refs.bubble.current.style.setProperty("--tail-y", "42%");
  }
  if (refs.confirm.current) {
    const bubbleEl = refs.bubble.current;
    const bubbleW = bubbleEl?.offsetWidth || Math.min(340, w - 32);
    const bubbleH = bubbleEl?.offsetHeight ?? 0;
    const maxTop = h - (layout.mobile ? 110 : 124);
    const desiredTop = bubbleH > 0
      ? Math.round(layout.dialogTop + bubbleH + 20)
      : layout.dialogTop + (layout.mobile ? 151 : 175);
    refs.confirm.current.style.left = `${Math.round(layout.dialogLeft + bubbleW / 2 - 62)}px`;
    refs.confirm.current.style.top = `${Math.min(maxTop, desiredTop)}px`;
  }
  if (preWake && refs.momo.current) {
    refs.momo.current.style.zIndex = "3";
    setMomoCenterPose(refs.momo.current, layout.mCX, layout.mCY, 1, 3, layout);
  } else if ((ph === "intro" || ph === "ayo") && refs.momo.current) {
    refs.momo.current.style.zIndex = "8";
    setMomoCenterPose(refs.momo.current, layout.midCX, layout.midCY, layout.finalScale, 0, layout);
  } else if ((ph === "name" || ph === "name-confirm") && refs.momo.current) {
    refs.momo.current.style.zIndex = "38";
    const park = computeNameParkingPose(layout);
    setMomoCenterPose(refs.momo.current, park.x, park.y, park.s, 0, layout);
    positionInsideBubble(refs.bookInsideBubble.current, refs.momo.current, w, h, 0);
  }

  const heroEl = refs.hero.current;
  if (heroEl && (preWake || ph === "book-curl")) {
    heroEl.classList.remove("tight-k", "tight-all");
    const slotRect = refs.logoSlot.current?.getBoundingClientRect();
    if (layout.FL && cam) {
      const camBottom = preWake && cam.getBoundingClientRect().height > 0 ? cam.getBoundingClientRect().bottom : layout.cardBottom;
      const top0 = Math.round(camBottom + clampCover(h * 0.05, 24, 56));
      const logoTop = slotRect && slotRect.height > 0 ? slotRect.top : h - 122;
      const limit = logoTop - clampCover(h * 0.025, 12, 28);
      let fs = clampCover(w * 0.105, 40, 280);
      for (let i = 0; i < 44; i++) {
        heroEl.style.setProperty("--fs", `${fs}px`);
        heroEl.style.top = `${top0}px`;
        if (heroEl.offsetHeight <= 0 || top0 + heroEl.offsetHeight <= limit || fs <= 40) break;
        fs = Math.max(40, fs * 0.97);
      }
      const dd = refs.doodles.current;
      const uSpan = heroEl.querySelector("h1.h2 span");
      if (dd && uSpan) {
        const cr = dd.getBoundingClientRect();
        const ur = uSpan.getBoundingClientRect();
        if (ur.width > 0 && cr.width > 0) {
          const mid = ur.top + ur.height / 2;
          if (refs.doodleBook.current) {
            refs.doodleBook.current.style.left = `${Math.max(10, ur.left - 108) - cr.left}px`;
            refs.doodleBook.current.style.top = `${mid - 43 - cr.top}px`;
          }
          if (refs.doodlePencil.current) {
            refs.doodlePencil.current.style.left = `${Math.min(w - 114, ur.right + 12) - cr.left}px`;
            refs.doodlePencil.current.style.top = `${mid - 28 - cr.top}px`;
          }
        }
      }
    } else if (preWake && refs.momo.current) {
      const mRect = refs.momo.current.getBoundingClientRect();
      const mTop = mRect.height > 0 ? mRect.top : layout.mY;
      const logoBottom = slotRect && slotRect.height > 0 ? slotRect.bottom : 74;
      let fs = clampCover(w * 0.105, 40, 280);
      let top = 0;
      for (let i = 0; i < 40; i++) {
        heroEl.style.setProperty("--fs", `${fs}px`);
        top = mTop + fs * 0.26 - heroEl.offsetHeight;
        if (heroEl.offsetHeight <= 0 || top >= logoBottom + clampCover(fs * 0.1, 14, 40) || fs <= 40) break;
        fs = Math.max(40, fs * 0.97);
      }
      heroEl.style.top = `${Math.round(top)}px`;
    }
  }

  const gateEl = refs.gate.current;
  if (gateEl && preWake) {
    const gh = gateEl.offsetHeight || 240;
    const heroBottom = heroEl?.getBoundingClientRect().bottom || 120;
    const gp = computeGatePlacement(layout, gh, heroBottom);
    gateEl.dataset.side = gp.side;
    gateEl.style.width = `${gp.width}px`;
    gateEl.style.left = `${gp.left}px`;
    gateEl.style.top = `${gp.top}px`;
    if (gp.tailY !== undefined) gateEl.style.setProperty("--tail-y", `${gp.tailY}px`);
    if (gp.tailX !== undefined) gateEl.style.setProperty("--tail-x", `${gp.tailX}%`);
    heroEl?.classList.toggle("tight-k", gp.tightK);
    heroEl?.classList.toggle("tight-all", gp.tightAll);
  }
}
