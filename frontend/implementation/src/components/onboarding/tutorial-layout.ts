/**
 * Layout of the tutorial brochure (R4). Pure: the component passes the viewport in.
 *
 * The open book sits in the upper part of the screen. The bottom 22% of the viewport stays free: the camera
 * (bottom left) and Momo (bottom right) live there, and the resting cards form a small row between them.
 */
export interface TutorialLayout {
  /** Guide page width (final, unscaled). */
  gw: number;
  /** Practice page width (final, unscaled), about 1.6 times the guide page. */
  pw: number;
  /** Page height (final, unscaled). */
  oh: number;
  /** Scale that makes the open book fit the free area and the width. */
  fit: number;
  /** Card scale while closed. */
  s0: number;
  /** Spacing of the fan at deal time. */
  gap: number;
  /** Scale of a resting card in the row at the bottom. */
  mini: number;
  miniGap: number;
  /** Offset of the resting row from the book centre (px). */
  miniY: number;
  /** Vertical centre of the book (px from the top of the screen). */
  cy: number;
  vh: number;
}

export const BOTTOM_RESERVE = 0.22;
const TOP_PAD = 0.04;

export function tutorialLayout(vw: number, vh: number): TutorialLayout {
  const gw = Math.round(clamp(vw * 0.3, 320, 480));
  const pw = Math.round(gw * 1.6);
  const oh = Math.round(clamp(vh * 0.76, 480, 720));
  const freeH = vh * (1 - BOTTOM_RESERVE - TOP_PAD);
  const fit = Math.min(1, (vw * 0.94) / (gw + pw), freeH / oh);
  const cy = vh * TOP_PAD + (oh * fit) / 2;
  const closedW = Math.min(214, Math.max(150, vw * 0.17));
  const rowCentre = vh * (1 - BOTTOM_RESERVE / 2);
  return {
    gw,
    pw,
    oh,
    fit,
    s0: closedW / gw,
    gap: closedW * 1.1,
    mini: 46 / gw,
    miniGap: 62,
    miniY: rowCentre - cy,
    cy,
    vh,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
