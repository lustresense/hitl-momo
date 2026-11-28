"use client";

import gsap from "gsap";
import { audio } from "@/src/audio";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { COVER_NAME_COPY } from "@/src/domain/copy/cover";
import {
  applySpotlightState,
  positionInsideBubble,
  setMomoCenterPose,
  type CoverTimelineRefs,
} from "./cover-dom-layout";
import { computeFocusPose, computeNameParkingPose, type CoverLayout } from "./cover-layout";
import type { CoverAction } from "./cover-machine";

const smooth01 = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const bz = (a: number, b: number, c: number, d: number, u: number): number => {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
};
const bzd = (a: number, b: number, c: number, d: number, u: number): number => {
  const v = 1 - u;
  return 3 * v * v * (b - a) + 6 * v * u * (c - b) + 3 * u * u * (d - c);
};

export interface CoverPhaseTimelineCallbacks {
  readonly reduced: boolean;
  readonly skipNameStep: boolean;
  readonly dispatch: (action: CoverAction) => void;
  readonly onMomoMood: (mood: MomoExpression, opts?: { flap?: boolean; wave?: boolean }) => void;
  readonly onBookBubble: (text: string) => void;
  readonly setPipMode: (pip: boolean) => void;
  readonly setMorphing: (morphing: boolean) => void;
  readonly setNameReady: (ready: boolean) => void;
  readonly setBookRevealed: (revealed: boolean) => void;
  readonly curlObj: { progress: number };
  readonly markCameFromCurl: (cameFromCurl: boolean) => void;
}

function addCameraLaunchToTimeline(
  tl: gsap.core.Timeline,
  refs: CoverTimelineRefs,
  layout: CoverLayout,
  momoPose: { x: number; y: number; s: number; r: number },
  syncMomo: () => void,
): void {
  const cam = refs.camera.current;
  if (cam) {
    tl.fromTo(
      cam,
      { left: layout.cX, top: layout.smallY, width: layout.cardW, height: layout.smallH },
      { left: layout.cX, top: layout.bigY, width: layout.cardW, height: layout.largeH, duration: 0.7, ease: "power3.out" },
      0,
    );
  }
  const launchProxy = { tau: 0 };
  tl.to(momoPose, { x: layout.mCX, y: layout.mCY + 10, s: 0.93, r: 0, duration: 0.0552, onUpdate: syncMomo }, 0)
    .to(launchProxy, {
      tau: 1,
      duration: 0.4248,
      ease: "none",
      onUpdate: () => {
        const tSec = launchProxy.tau * 0.4248;
        momoPose.x = layout.mCX - 36 * launchProxy.tau;
        momoPose.y = layout.mCY + 10 - (3900 * tSec - 0.5 * 6200 * tSec * tSec);
        momoPose.s = 1.15 - 0.08 * smooth01(launchProxy.tau / 0.6);
        momoPose.r = -24 * smooth01(launchProxy.tau / 0.45) + 38 * smooth01((launchProxy.tau - 0.45) / 0.55);
        syncMomo();
        if (refs.momo.current && cam) {
          const mb = refs.momo.current.getBoundingClientRect().bottom;
          const ct = cam.getBoundingClientRect().top;
          if (mb > 0 && ct > 0 && mb <= ct - 4) refs.momo.current.style.zIndex = "8";
        }
      },
    }, 0.0552)
    .call(() => { if (refs.momo.current) refs.momo.current.style.zIndex = "8"; }, undefined, 0.35);
}

/** Peluncuran instan kartu kamera ke atas + pantulan Momo begitu toggle diklik (`camera-on` + `requesting`). */
export function runCameraRequestLaunch(
  refs: CoverTimelineRefs,
  layout: CoverLayout,
  onMomoMood: (mood: MomoExpression, opts?: { flap?: boolean; wave?: boolean }) => void,
): void {
  onMomoMood("Kaget", { flap: true });
  const momoPose = { x: layout.mCX, y: layout.mCY, s: 1, r: 3 };
  const syncMomo = () => setMomoCenterPose(refs.momo.current, momoPose.x, momoPose.y, momoPose.s, momoPose.r, layout);
  addCameraLaunchToTimeline(gsap.timeline(), refs, layout, momoPose, syncMomo);
}

/** Animasi bangun Momo + morph kartu kamera ke PIP kiri-bawah (`fase wake`). */
export function runWakePhaseTimeline(
  refs: CoverTimelineRefs,
  layout: CoverLayout,
  cb: CoverPhaseTimelineCallbacks,
  startOffsetSec = 0,
): void {
  cb.setPipMode(false);
  cb.setMorphing(false);
  cb.onMomoMood("Kaget", startOffsetSec > 0 ? undefined : { flap: true });
  const momoPose = { x: layout.mCX, y: layout.mCY, s: 1, r: 3 };
  const syncMomo = () => setMomoCenterPose(refs.momo.current, momoPose.x, momoPose.y, momoPose.s, momoPose.r, layout);
  const cam = refs.camera.current;
  if (cb.reduced) {
    if (cam) gsap.set(cam, { left: layout.pipX, top: layout.pipY, width: layout.pipW, height: layout.pipH });
    if (refs.momo.current) refs.momo.current.style.zIndex = "8";
    setMomoCenterPose(refs.momo.current, layout.midCX, layout.midCY, layout.finalScale, 0, layout);
    cb.setPipMode(true);
    cb.onMomoMood("Senang", { wave: true });
    cb.dispatch({ type: "WAKE_DONE" });
    return;
  }
  const tl = gsap.timeline({ onComplete: () => cb.dispatch({ type: "WAKE_DONE" }) });
  addCameraLaunchToTimeline(tl, refs, layout, momoPose, syncMomo);
  tl.to({}, { duration: 3.0 }, 0.7)
    .addLabel("return", 3.7)
    .call(() => cb.onMomoMood("Grumbel"), undefined, "return")
    .to(momoPose, {
      keyframes: [
        { x: layout.mCX + layout.w * 0.075, y: -layout.mH * 0.82, s: 1.06, r: 28, duration: 0.125, ease: "sine.inOut" },
        { x: layout.endCX + layout.w * 0.07, y: layout.h * 0.06, s: layout.finalScale * 1.03, r: 24, duration: 0.187, ease: "sine.inOut" },
        { x: layout.endCX + 34, y: layout.endCY + 55, s: layout.finalScale * 0.95, r: -18, duration: 0.312, ease: "sine.inOut" },
        { x: layout.endCX - 12, y: layout.endCY - 22, s: layout.finalScale * 1.025, r: 8, duration: 0.239, ease: "sine.inOut" },
        { x: layout.endCX, y: layout.endCY, s: layout.finalScale, r: 0, duration: 0.177, ease: "sine.out" },
      ],
      onUpdate: syncMomo,
    }, "return")
    .call(() => cb.onMomoMood("Datar")).to({}, { duration: 0.65 })
    .call(() => cb.onMomoMood("Menguap")).to({}, { duration: 1.56 })
    .call(() => cb.onMomoMood("MelekDikit")).to({}, { duration: 0.24 })
    .addLabel("morph")
    .call(() => { cb.setMorphing(true); audio.emit("ui.morph"); }, undefined, "morph"); // camera card -> PIP morph starts
  if (cam) {
    tl.fromTo(
      cam,
      { padding: 14, borderRadius: 18, borderColor: "#111111", backgroundColor: "#ef7a37", boxShadow: "7px 7px 0px #111111" },
      {
        left: layout.pipX, top: layout.pipY, width: layout.pipW, height: layout.pipH,
        padding: 0, borderRadius: 14, borderColor: "#d0622a", backgroundColor: "#1e2126", boxShadow: "4px 4px 0px #111111",
        duration: 1.55, ease: "power3.out",
        onComplete: () => {
          cb.setMorphing(false);
          cb.setPipMode(true);
          gsap.set(cam, { clearProps: "padding,borderRadius,borderColor,backgroundColor,boxShadow" });
        },
      },
      "morph",
    );
  }
  tl.addLabel("glide", cam ? "morph+=0.7" : "morph")
    .call(() => cb.onMomoMood("SenyumMulai"), undefined, "glide")
    .call(() => cb.onMomoMood("Senang", { wave: true }), undefined, "glide+=0.7")
    .to(momoPose, {
      keyframes: [
        { x: layout.midCX + 8, y: layout.midCY + 20, s: layout.finalScale * 0.98, r: -4, duration: 0.68 },
        { x: layout.midCX - 3, y: layout.midCY - 7, s: layout.finalScale * 1.01, r: 2, duration: 0.34 },
        { x: layout.midCX, y: layout.midCY, s: layout.finalScale, r: 0, duration: 0.23 },
      ],
      onUpdate: syncMomo,
    }, "glide")
    .to({}, { duration: 0.3 });
  if (startOffsetSec > 0) {
    tl.seek(Math.min(startOffsetSec, 2.5), false);
  }
}

/** Animasi memudar spotlight + buka lipatan buku (`fase book-curl`). */
export function runBookCurlPhaseTimeline(
  refs: CoverTimelineRefs,
  layout: CoverLayout,
  cb: CoverPhaseTimelineCallbacks,
): void {
  cb.setPipMode(true);
  const momoPose = { x: layout.midCX, y: layout.midCY, s: layout.finalScale, r: 0 };
  const syncMomo = () => setMomoCenterPose(refs.momo.current, momoPose.x, momoPose.y, momoPose.s, momoPose.r, layout);
  const cardTop = refs.nameCard.current?.getBoundingClientRect().top || layout.h * 0.45;
  const targetPose = cb.skipNameStep ? computeNameParkingPose(layout) : computeFocusPose(cardTop, layout);
  const inDuration = cb.skipNameStep ? 1.15 : 1.7;
  const inPosition = cb.skipNameStep ? "<+0.55" : "<+0.9";
  if (cb.reduced) {
    applySpotlightState(refs, 0, 0, 0);
    [refs.confirm.current, refs.hero.current, refs.shadow.current].forEach((el) => { if (el) gsap.set(el, { opacity: 0 }); });
    cb.setBookRevealed(true);
    if (refs.momo.current) refs.momo.current.style.zIndex = "38";
    refs.bookCurl.current?.resize();
    refs.bookCurl.current?.applyProgress(1);
    setMomoCenterPose(refs.momo.current, targetPose.x, targetPose.y, targetPose.s, 0, layout);
    cb.markCameFromCurl(true);
    cb.dispatch({ type: "BOOK_CURL_DONE" });
    return;
  }
  cb.setBookRevealed(false);
  if (refs.momo.current) refs.momo.current.style.zIndex = "8";
  syncMomo();
  applySpotlightState(refs, 0.92, 1, 1);
  if (refs.confirm.current) gsap.set(refs.confirm.current, { opacity: 1, y: 0, scale: 1 });
  const tl = gsap.timeline({ onComplete: () => { cb.markCameFromCurl(true); cb.dispatch({ type: "BOOK_CURL_DONE" }); } });
  if (refs.bubble.current) tl.to(refs.bubble.current, { opacity: 0, y: 6, duration: 0.22 }, 0);
  if (refs.confirm.current) tl.to(refs.confirm.current, { opacity: 0, duration: 0.26 }, 0);
  if (refs.hero.current) tl.to(refs.hero.current, { opacity: 0, duration: 0.32 }, 0.22);
  if (refs.shadow.current) tl.to(refs.shadow.current, { opacity: 0, duration: 0.32 }, 0.22);
  if (refs.shade.current) tl.to(refs.shade.current, { opacity: 0, duration: 0.6 }, 0.22);
  if (refs.spot.current) tl.to(refs.spot.current, { opacity: 0, duration: 0.6 }, 0.22);
  const outC1 = { x: layout.midCX + (layout.w - layout.midCX) * 0.38, y: layout.midCY - Math.min(110, layout.h * 0.12) };
  const outC2 = { x: layout.w * 0.99, y: layout.h * 0.6 };
  const outP3 = { x: layout.w * 1.1, y: layout.h * 1.08 };
  const outProxy = { tau: 0 };
  const inP0 = { x: layout.w * 1.1, y: layout.h * 1.08 };
  const inC1 = { x: layout.w * 0.98, y: layout.h * 0.7 };
  const inC2 = { x: targetPose.x + (layout.w - targetPose.x) * 0.45, y: targetPose.y + Math.min(220, layout.h * 0.25) };
  const inProxy = { tau: 0 };

  tl.call(() => cb.onMomoMood("Senang"), undefined, 0)
    .to(outProxy, {
      tau: 1,
      duration: 1.75,
      ease: "none",
      onStart: () => audio.emit("momo.whoosh"), // Momo curves off the page (once: the tween starts once)
      onUpdate: () => {
        const tau = outProxy.tau;
        const u = Math.pow(tau, 1.6);
        const x = bz(layout.midCX, outC1.x, outC2.x, outP3.x, u);
        const y = bz(layout.midCY, outC1.y, outC2.y, outP3.y, u);
        const hd = (Math.atan2(bzd(layout.midCX, outC1.x, outC2.x, outP3.x, u), -bzd(layout.midCY, outC1.y, outC2.y, outP3.y, u)) * 180) / Math.PI;
        const bump = Math.sin(Math.PI * Math.min(1, tau / 0.2));
        const blend = smooth01((tau - 0.12) / 0.58);
        momoPose.x = x - 26 * bump;
        momoPose.y = y - 16 * bump;
        momoPose.s = layout.finalScale * (1 + 0.05 * bump) * (1 - 0.93 * smooth01((u - 0.6) / 0.4));
        momoPose.r = -12 * bump * (1 - blend) + hd * blend;
        syncMomo();
      },
    }, 0.22)
    .call(() => cb.onMomoMood("Semangat", { flap: true }), undefined, 0.22 + 1.75 * 0.35)
    .call(() => {
      audio.emit("page.curl"); // the cover starts to curl open (the reduced/skip path returns earlier and never gets here)
      cb.curlObj.progress = 0;
      refs.bookCurl.current?.resize();
      refs.bookCurl.current?.applyProgress(0);
      if (refs.momo.current) refs.momo.current.style.zIndex = "38";
      cb.setBookRevealed(true);
    }, undefined, 1.97)
    .to(cb.curlObj, { progress: 1, duration: 1.7, ease: "power1.inOut", onUpdate: () => refs.bookCurl.current?.applyProgress(cb.curlObj.progress) }, 1.97)
    .to(inProxy, {
      tau: 1,
      duration: inDuration,
      ease: "none",
      onUpdate: () => {
        const tau = inProxy.tau;
        const u = 1 - Math.pow(1 - tau, 2.4);
        const x = bz(inP0.x, inC1.x, inC2.x, targetPose.x, u);
        const y = bz(inP0.y, inC1.y, inC2.y, targetPose.y, u);
        const hd = (Math.atan2(bzd(inP0.x, inC1.x, inC2.x, targetPose.x, u), -bzd(inP0.y, inC1.y, inC2.y, targetPose.y, u)) * 180) / Math.PI;
        momoPose.x = x;
        momoPose.y = y;
        momoPose.s = targetPose.s * (0.1 + 0.9 * smooth01(u / 0.42));
        momoPose.r = hd * (1 - smooth01((tau - 0.42) / 0.58));
        syncMomo();
      },
      onStart: () => audio.emit("momo.whoosh"), // Momo re-enters from the lower right onto the inside page
    }, inPosition)
    .call(() => cb.onMomoMood("Senang", { flap: true }), undefined, "<+0.17");
}

/** Animasi kedatangan Momo ke halaman dalam buku dan parkir ke pojok kanan atas (`fase name`). */
export function runNamePhaseTimeline(
  refs: CoverTimelineRefs,
  layout: CoverLayout,
  cameFromCurl: boolean,
  cb: CoverPhaseTimelineCallbacks,
): void {
  cb.setPipMode(true);
  refs.bookCurl.current?.resize();
  refs.bookCurl.current?.applyProgress(1);
  const park = computeNameParkingPose(layout);
  if (!cameFromCurl) {
    cb.setNameReady(true);
    if (refs.momo.current) refs.momo.current.style.zIndex = "38";
    setMomoCenterPose(refs.momo.current, park.x, park.y, park.s, 0, layout);
    positionInsideBubble(refs.bookInsideBubble.current, refs.momo.current, layout.w, layout.h, 0);
    return;
  }
  cb.setNameReady(false);
  cb.onBookBubble(COVER_NAME_COPY.bubbleInitial);
  cb.onMomoMood("Senang");
  const cardTop = refs.nameCard.current?.getBoundingClientRect().top || layout.h * 0.45;
  const F = computeFocusPose(cardTop, layout);
  const momoPose = { x: F.x, y: F.y, s: F.s, r: 0 };
  const sync = () => {
    setMomoCenterPose(refs.momo.current, momoPose.x, momoPose.y, momoPose.s, momoPose.r, layout);
    positionInsideBubble(refs.bookInsideBubble.current, refs.momo.current, layout.w, layout.h, 0);
  };
  const tl = gsap.timeline({ onComplete: () => { cb.markCameFromCurl(false); cb.setNameReady(true); cb.onMomoMood("Senang"); } });
  tl.to({}, { duration: cb.reduced ? 0.1 : 2.2 })
    .call(() => { cb.onBookBubble(COVER_NAME_COPY.bubbleInstruction); cb.onMomoMood("Penasaran"); })
    .to(momoPose, {
      keyframes: [
        { x: (F.x + park.x) / 2, y: Math.min(F.y, park.y) - 30, s: (F.s + park.s) / 2, r: 8, duration: cb.reduced ? 0 : 0.62 },
        { x: park.x, y: park.y, s: park.s, r: 0, duration: cb.reduced ? 0 : 0.63 },
      ],
      onUpdate: sync,
    });
}
