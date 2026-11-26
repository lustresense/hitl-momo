import { CHROME_SELECTOR, SOURCE_ARBITER_WINDOW_MS } from "../core/constants";
import type { InputSample, SourceKind } from "../core/types";
import type { InputSource } from "./input-source";

/** PLAN §5.3.1: hanya satu sumber aktif — sumber terakhir yang punya input dalam 500 ms. */
export const ARBITER_EXCLUSIVITY_MS = SOURCE_ARBITER_WINDOW_MS;

/**
 * Elemen chrome (gerbang izin, ketik nama, legenda, bar dev, kontrol form native, `[data-nui-off]`)
 * selalu memakai klik native dan tidak pernah memicu cubit NUI.
 */
export const NATIVE_CHROME_SELECTOR = `${CHROME_SELECTOR},[data-nui-chrome],input,select,textarea,label,[contenteditable]`;

/** True bila target DOM adalah elemen chrome / kontrol native (bukan interaksi NUI). */
export function isChromeElement(target: EventTarget | null | undefined): boolean {
  if (!target || typeof Element === "undefined") return false;
  let el: Element | null = null;
  if (target instanceof Element) {
    el = target;
  } else if ("parentElement" in target) {
    const parent = (target as { parentElement?: unknown }).parentElement;
    if (parent instanceof Element) el = parent;
  }
  return el !== null && el.closest(NATIVE_CHROME_SELECTOR) !== null;
}

export interface SourceArbiterOptions {
  exclusivityMs?: number;
  onSourceError?: (kind: SourceKind, err: unknown) => void;
}

interface RegisteredEntry {
  source: InputSource;
  unsub: () => void;
}

/**
 * Penengah sumber input tunggal: memastikan tidak pernah mencampur sampel lintas sumber,
 * menjaga eksklusivitas 500 ms, dan gagal-tertutup (kamera mati / tangan hilang -> mouse/sentuh).
 */
export class SourceArbiter {
  private readonly exclusivityMs: number;
  private readonly onSourceError?: (kind: SourceKind, err: unknown) => void;
  private readonly entries = new Map<InputSource, RegisteredEntry>();
  private readonly sampleListeners = new Set<(sample: InputSample) => void>();
  private readonly activeListeners = new Set<(kind: SourceKind | null) => void>();

  private running = false;
  private activeSource: InputSource | null = null;
  private activeInFrame = false;
  private lastActiveT = Number.NEGATIVE_INFINITY;
  private currentKind: SourceKind | null = null;
  private lastEmitted: InputSample | null = null;

  constructor(options: SourceArbiterOptions = {}) {
    this.exclusivityMs = options.exclusivityMs ?? ARBITER_EXCLUSIVITY_MS;
    this.onSourceError = options.onSourceError;
  }

  addSource(source: InputSource): () => void {
    if (this.entries.has(source)) return () => this.removeSource(source);
    const unsub = source.subscribe((sample) => this.handleSample(source, sample));
    this.entries.set(source, { source, unsub });
    if (this.running) this.safeStart(source);
    return () => this.removeSource(source);
  }

  removeSource(source: InputSource): void {
    const entry = this.entries.get(source);
    if (!entry) return;
    entry.unsub();
    this.entries.delete(source);
    this.safeStop(source);
    if (this.activeSource === source) this.releaseActive();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const { source } of this.entries.values()) this.safeStart(source);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const { source } of this.entries.values()) this.safeStop(source);
    this.releaseActive();
  }

  /** Paksa lepas kepemilikan sumber tertentu (mis. kamera gagal / izin dicabut -> gagal-tertutup). */
  releaseKind(kind: SourceKind): void {
    if (this.currentKind === kind || this.activeSource?.kind === kind) {
      this.releaseActive();
    }
  }

  activeKind(): SourceKind | null {
    return this.currentKind;
  }

  subscribe(cb: (sample: InputSample) => void): () => void {
    this.sampleListeners.add(cb);
    return () => {
      this.sampleListeners.delete(cb);
    };
  }

  subscribeActive(cb: (kind: SourceKind | null) => void): () => void {
    this.activeListeners.add(cb);
    cb(this.currentKind);
    return () => {
      this.activeListeners.delete(cb);
    };
  }

  private handleSample(source: InputSource, sample: InputSample): void {
    const isSameOwner = this.activeSource === source;
    const elapsed = sample.t - this.lastActiveT;
    const expired = this.activeSource === null || !this.activeInFrame || elapsed >= this.exclusivityMs;

    if (!isSameOwner && !expired) return;

    if (!isSameOwner) {
      if (!sample.inFrame && !sample.pinch) return;
      this.emitSyntheticReleaseIfPinched(sample.t);
      this.activeSource = source;
      this.activeInFrame = sample.inFrame;
      this.lastActiveT = sample.t;
      this.setActiveKind(sample.source);
    } else if (sample.inFrame || sample.pinch) {
      this.activeInFrame = true;
      this.lastActiveT = sample.t;
      if (this.currentKind !== sample.source) this.setActiveKind(sample.source);
    } else {
      this.activeInFrame = false;
      this.activeSource = null;
      this.setActiveKind(null);
    }

    this.emit(sample);
  }

  private releaseActive(): void {
    const t = this.lastEmitted ? this.lastEmitted.t : 0;
    this.emitSyntheticReleaseIfPinched(t);
    this.activeSource = null;
    this.activeInFrame = false;
    this.lastActiveT = Number.NEGATIVE_INFINITY;
    this.setActiveKind(null);
  }

  private emitSyntheticReleaseIfPinched(t: number): void {
    const prev = this.lastEmitted;
    if (!prev || !prev.pinch) return;
    this.emit({
      t: Math.max(prev.t, t),
      x: prev.x,
      y: prev.y,
      inFrame: false,
      pinch: false,
      pinchStrength: 0,
      source: prev.source,
    });
  }

  private emit(sample: InputSample): void {
    this.lastEmitted = sample;
    for (const cb of [...this.sampleListeners]) cb(sample);
  }

  private setActiveKind(kind: SourceKind | null): void {
    if (this.currentKind === kind) return;
    this.currentKind = kind;
    for (const cb of [...this.activeListeners]) cb(kind);
  }

  private safeStart(source: InputSource): void {
    try {
      source.start();
    } catch (err: unknown) {
      this.onSourceError?.(source.kind, err);
    }
  }

  private safeStop(source: InputSource): void {
    try {
      source.stop();
    } catch (err: unknown) {
      this.onSourceError?.(source.kind, err);
    }
  }
}
