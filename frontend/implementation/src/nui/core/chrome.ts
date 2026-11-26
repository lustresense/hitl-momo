import { CHROME_SELECTOR } from "./constants";

/** Bentuk minimal node DOM untuk pengecekan chrome tanpa bergantung pada tipe DOM global. */
export interface ChromeLike {
  closest?: (selector: string) => unknown;
  parentElement?: ChromeLike | null;
}

/**
 * Port hand.js:23-24 isChrome.
 * Mengembalikan true bila elemen berada di dalam chrome native (gerbang izin, ketik nama, legenda, bar dev, [data-nui-off]).
 */
export function isChrome(el: unknown, selector: string = CHROME_SELECTOR): boolean {
  if (!el || typeof el !== "object") return false;
  const node = el as ChromeLike;
  if (typeof node.closest === "function") return Boolean(node.closest(selector));
  if (node.parentElement && typeof node.parentElement.closest === "function") {
    return Boolean(node.parentElement.closest(selector));
  }
  return false;
}
