/**
 * Shared helpers for the tutorial component tests: a 2D canvas stub (jsdom has none) and the pointer and rect
 * shims jsdom needs. Kept out of the *.test.* glob on purpose.
 */
import { act } from "@testing-library/react";
import { vi } from "vitest";

/** A permissive 2D context: the drawing surface draws into it; the tests look at state, not pixels. */
export function stubCanvas2d(): void {
  const ctx = new Proxy(
    { canvas: { width: 100, height: 50 }, getImageData: () => ({ data: new Uint8ClampedArray(4) }) } as Record<string | symbol, unknown>,
    {
      get: (target, key) => (key in target ? target[key] : () => undefined),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
}

/** A rect of 100 x 50 at the origin, so clientX maps straight to a percentage of the scene. */
export function mockRect(el: HTMLElement): void {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) });
}

/** jsdom has no PointerEvent: a pointer event carrying the clientX React reads. */
export function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientX: number): void {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX }));
  });
}

/** A keyboard event on the window, inside act so the state it changes is rendered before the next expectation. */
export function key(name: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: name }));
  });
}
