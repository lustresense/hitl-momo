import { POINTER_OFFSCREEN } from "../core/constants";
import type { InputSample, SourceKind } from "../core/types";
import type { InputSource } from "./input-source";
import { isChromeElement } from "./source-arbiter";

const PREF_STORAGE_KEY = "su.hand";

export interface MouseSourceOptions {
  /** Tombol H untuk mematikan/menyalakan simulasi tangan HANYA aktif saat devTools = true. */
  devTools?: boolean;
  /** Default true (meniru hand.js). */
  initialSimOn?: boolean;
  clock?: () => number;
  onSimChange?: (simOn: boolean, toggledByKey: boolean) => void;
  canEnableSim?: () => boolean;
}

function readSimPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PREF_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeSimPref(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREF_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode / blocked storage */
  }
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!target || typeof Element === "undefined") return false;
  return target instanceof Element && target.closest("input,textarea,select,[contenteditable]") !== null;
}

/**
 * Port 1:1 perilaku pointer sandbox `hand.js`:
 * gerak = tangan, tahan klik/sentuh = cubit-tahan, lepas = lepas cubit.
 * Elemen chrome diabaikan untuk cubit; tombol H hanya aktif saat `devTools: true`.
 */
export class MouseSource implements InputSource {
  readonly kind: SourceKind = "mouse";

  private readonly devTools: boolean;
  private readonly clock: () => number;
  private readonly onSimChange?: (simOn: boolean, toggledByKey: boolean) => void;
  private readonly canEnableSim?: () => boolean;
  private readonly listeners = new Set<(s: InputSample) => void>();

  private running = false;
  private simOn: boolean;
  private x = POINTER_OFFSCREEN;
  private y = POINTER_OFFSCREEN;
  private inFrame = false;
  private down = false;
  private lastSource: "mouse" | "touch" = "mouse";

  constructor(options: MouseSourceOptions = {}) {
    this.devTools = options.devTools ?? false;
    this.clock = options.clock ?? (() => performance.now());
    this.onSimChange = options.onSimChange;
    this.canEnableSim = options.canEnableSim;
    const initial = options.initialSimOn ?? true;
    this.simOn = initial && (this.devTools ? readSimPref() : true);
  }

  isSimOn(): boolean {
    return this.simOn;
  }

  setSimOn(next: boolean, toggledByKey = false): void {
    if (next && this.canEnableSim && !this.canEnableSim()) return;
    if (this.simOn === next) return;
    this.simOn = next;
    if (!next && this.down) {
      this.down = false;
      this.emit(false);
    }
    this.onSimChange?.(this.simOn, toggledByKey);
  }

  start(): void {
    if (this.running || typeof window === "undefined" || typeof document === "undefined") return;
    this.running = true;
    window.addEventListener("pointermove", this.handleMove, { passive: true, capture: true });
    window.addEventListener("pointerdown", this.handleDown, true);
    window.addEventListener("pointerup", this.handleUp, true);
    window.addEventListener("pointercancel", this.handleUp, true);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("mouseout", this.handleMouseOut);
    if (this.devTools) window.addEventListener("keydown", this.handleKeyDown);
  }

  stop(): void {
    if (!this.running || typeof window === "undefined" || typeof document === "undefined") return;
    this.running = false;
    window.removeEventListener("pointermove", this.handleMove, true);
    window.removeEventListener("pointerdown", this.handleDown, true);
    window.removeEventListener("pointerup", this.handleUp, true);
    window.removeEventListener("pointercancel", this.handleUp, true);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("mouseout", this.handleMouseOut);
    if (this.devTools) window.removeEventListener("keydown", this.handleKeyDown);
    if (this.down) {
      this.down = false;
      this.emit(false);
    }
  }

  subscribe(cb: (s: InputSample) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private sourceFor(e: PointerEvent): "mouse" | "touch" {
    return e.pointerType === "touch" ? "touch" : "mouse";
  }

  private readonly handleMove = (e: PointerEvent): void => {
    this.x = e.clientX;
    this.y = e.clientY;
    this.inFrame = true;
    this.lastSource = this.sourceFor(e);
    if (!this.simOn) return;
    this.emit(false);
  };

  private readonly handleDown = (e: PointerEvent): void => {
    this.x = e.clientX;
    this.y = e.clientY;
    this.inFrame = true;
    this.lastSource = this.sourceFor(e);
    if (!this.simOn) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isChromeElement(e.target)) return;
    this.down = true;
    this.emit(true);
  };

  private readonly handleUp = (): void => {
    if (!this.down) return;
    this.down = false;
    if (!this.simOn) return;
    this.emit(false);
  };

  private readonly handleBlur = (): void => {
    if (!this.down && !this.inFrame) return;
    this.down = false;
    this.inFrame = false;
    if (!this.simOn) return;
    this.emit(false);
  };

  private readonly handleMouseOut = (e: MouseEvent): void => {
    if (e.relatedTarget) return;
    this.inFrame = false;
    if (!this.simOn) return;
    this.emit(false);
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "h" && e.key !== "H") return;
    if (isEditableKeyTarget(e.target)) return;
    const next = !this.simOn;
    if (next && this.canEnableSim && !this.canEnableSim()) return;
    writeSimPref(next);
    this.setSimOn(next, true);
  };

  private emit(isPinchOn: boolean): void {
    const sample: InputSample = {
      t: this.clock(),
      x: this.x,
      y: this.y,
      inFrame: this.inFrame,
      pinch: this.down,
      pinchStrength: this.down ? 1 : 0,
      clickPoint: isPinchOn ? { x: this.x, y: this.y } : undefined,
      source: this.lastSource,
    };
    for (const cb of [...this.listeners]) cb(sample);
  }
}
