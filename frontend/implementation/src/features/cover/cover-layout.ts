import { MOMO_ART_HEIGHT } from "@/src/components/momo/momo-engine";

export interface CoverLayout {
  readonly w: number;
  readonly h: number;
  readonly mobile: boolean;
  readonly FL: boolean;
  readonly cardW: number;
  readonly smallH: number;
  readonly largeH: number;
  readonly smallY: number;
  readonly bigY: number;
  readonly cX: number;
  readonly cardBottom: number;
  readonly mW: number;
  readonly mH: number;
  readonly mX: number;
  readonly mY: number;
  readonly mCX: number;
  readonly mCY: number;
  readonly pipX: number;
  readonly pipY: number;
  readonly pipW: number;
  readonly pipH: number;
  readonly endCX: number;
  readonly endCY: number;
  readonly midCX: number;
  readonly midCY: number;
  readonly finalScale: number;
  readonly dialogLeft: number;
  readonly dialogTop: number;
}

export interface GatePlacement {
  readonly side: "right" | "above";
  readonly width: number;
  readonly left: number;
  readonly top: number;
  readonly tailX?: number;
  readonly tailY?: number;
  readonly tightK: boolean;
  readonly tightAll: boolean;
}

export interface CoverPose {
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly r: number;
}

export const MOMO_ART_WIDTH = 1389;

export function clampCover(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Port persis fungsi `layout()` dari `proto-html/r83/index.html:556-578`.
 * Pada viewport `>= 900px` (`FL = true`), susunan dibalik: kartu kamera + Momo + gate
 * di atas, kartu melebar sebagian ke atas (`smallY - 36`), lalu morph ke PIP kiri-bawah.
 */
export function computeCoverLayout(w: number, h: number): CoverLayout {
  const safeW = Math.max(320, w);
  const safeH = Math.max(480, h);
  const mobile = safeW < 700;
  const FL = safeW >= 900;
  const cardW = Math.min(290, Math.max(236, safeW - 48));
  const smallH = 123;
  const largeH = Math.round(cardW * 0.8 + 108);
  const cardBottom = Math.round(
    mobile
      ? Math.max(430, safeH - 74)
      : FL
        ? Math.max(318, safeH * 0.42)
        : clampCover(safeH * 0.785, 430, safeH - 70),
  );
  const smallY = cardBottom - smallH;
  const bigY = FL ? smallY - 36 : cardBottom - largeH;
  const gateMaxW = Math.min(360, Math.max(296, safeW - cardW - 54));
  const cX = Math.round(FL ? (safeW - (cardW + 14 + gateMaxW)) / 2 : (safeW - cardW) / 2);

  const mW = Math.round(mobile ? Math.min(164, safeW * 0.405) : 176);
  const mH = Math.round((mW * MOMO_ART_HEIGHT) / MOMO_ART_WIDTH);
  const mX = Math.round((FL ? cX + cardW / 2 : safeW / 2) - mW / 2);
  const mY = Math.round(smallY - mH * 0.515);
  const mCX = mX + mW / 2;
  const mCY = mY + mH / 2;

  const pipW = mobile ? 125 : 150;
  const pipH = mobile ? 100 : 120;
  const pipX = mobile ? 13 : 22;
  const pipY = Math.round(safeH - pipH - (mobile ? 20 : 26));

  const finalScale = mobile ? 1.11 : 1.34;
  const endCX = mobile ? safeW * 0.4 : safeW * 0.435;
  const endCY = mobile ? Math.max(98, safeH * 0.218) : Math.max(145, safeH * 0.278);
  const midCX = mobile ? safeW * 0.5 : safeW * 0.435;
  const midCY = mobile ? Math.max(150, safeH * 0.3) : Math.round(safeH * 0.47);
  const dialogLeft = mobile
    ? Math.round((safeW - Math.min(335, safeW - 26)) / 2)
    : Math.min(safeW - 352, Math.round(safeW * 0.56));
  const dialogTop = mobile
    ? Math.min(safeH - 250, Math.round(midCY + mH * finalScale * 0.44 + 16))
    : Math.round(midCY - 44);

  return {
    w: safeW,
    h: safeH,
    mobile,
    FL,
    cardW,
    smallH,
    largeH,
    smallY,
    bigY,
    cX,
    cardBottom,
    mW,
    mH,
    mX,
    mY,
    mCX,
    mCY,
    pipX,
    pipY,
    pipW,
    pipH,
    endCX,
    endCY,
    midCX,
    midCY,
    finalScale,
    dialogLeft,
    dialogTop,
  };
}

/** Port `placeGate()` (`proto-html/r83/index.html:863-884`). */
export function computeGatePlacement(
  layout: CoverLayout,
  gateHeight: number,
  heroBottom: number,
): GatePlacement {
  const gh = Math.max(120, gateHeight);
  const leftSide = layout.FL ? layout.cX + layout.cardW + 14 : Math.round(layout.w / 2 + layout.cardW / 2 + 14);
  const gwSide = Math.min(360, layout.w - leftSide - 12);
  const side = gwSide >= 296 && layout.w >= 900;
  const width = side ? gwSide : Math.min(360, layout.w - 28);
  const faceY = layout.mY + layout.mH * 0.28;

  if (side) {
    const top = Math.round(
      layout.FL
        ? clampCover((layout.mY + layout.cardBottom) / 2 - gh / 2, 12, layout.h - gh - 12)
        : Math.max(heroBottom + 10, Math.min(layout.cardBottom - gh, layout.h - gh - 64)),
    );
    return {
      side: "right",
      width,
      left: leftSide,
      top,
      tailY: Math.round(clampCover(faceY - top, 24, Math.max(25, gh - 30))),
      tightK: false,
      tightAll: false,
    };
  }

  const left = Math.round((layout.w - width) / 2);
  const rawTop = Math.round(layout.mY - 14 - gh);
  const tightK = rawTop < heroBottom + 8;
  const tightAll = tightK && rawTop < heroBottom - 20;
  return {
    side: "above",
    width,
    left,
    top: Math.max(8, rawTop),
    tailX: 50,
    tightK,
    tightAll,
  };
}

/** Pose Momo mendarat di atas `#name-card` (`index.html:943`). */
export function computeFocusPose(nameCardTop: number, layout: CoverLayout): CoverPose {
  const s = layout.mobile ? 0.85 : 1.05;
  const hh = layout.mH * s;
  const x = layout.mobile ? layout.w - (layout.mW * s) / 2 - 14 : layout.w / 2;
  const y = Math.max(hh * 0.5 + 14, nameCardTop - hh * 0.52 - 10);
  return { x, y, s, r: 0 };
}

/** Pose parkir Momo di kanan atas saat langkah kenalan nama (`index.html:954`). */
export function computeNameParkingPose(layout: CoverLayout): CoverPose {
  const x = layout.w * (layout.mobile ? 0.81 : 0.86);
  const y = layout.mobile ? Math.max(100, layout.h * 0.12) : Math.max(152, layout.h * 0.238);
  const s = layout.mobile ? 0.69 : 0.88;
  return { x, y, s, r: 0 };
}

/** Jumlah cincin spiral di tepi atas sampul (`index.html:1244`). */
export function computeSpiralCount(viewportWidth: number): number {
  return Math.max(8, Math.floor(Math.max(320, viewportWidth) / 52));
}
