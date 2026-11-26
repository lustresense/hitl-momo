import { STICKER_FLICK_UP_PX, STICKER_FLICK_WINDOW_MS } from "./constants";

export interface Flick {
  /** `ok` = false bila cubit mulai di chrome / area yang diabaikan. */
  down(ok?: boolean): void;
  move(y: number, t: number): void;
  up(): void;
}

/** Port flick() hand.js:186-193: sentil ke atas saat cubit, di mana saja. */
export function createFlick(cb: () => void): Flick {
  let armed = false;
  let hist: [number, number][] = [];
  return {
    down(ok = true) {
      if (!ok) return;
      armed = true;
      hist = [];
    },
    move(y, t) {
      if (!armed) return;
      hist.push([t, y]);
      while (hist.length > 0 && t - (hist[0] as [number, number])[0] > STICKER_FLICK_WINDOW_MS) hist.shift();
      const first = hist[0];
      if (hist.length > 1 && first && first[1] - y > STICKER_FLICK_UP_PX) {
        armed = false;
        cb();
      }
    },
    up() {
      armed = false;
    },
  };
}
