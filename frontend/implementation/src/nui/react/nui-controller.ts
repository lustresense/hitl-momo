import {
  DRAG_START_PX, NuiEngine, POINTER_OFFSCREEN, RING_SVG_RADIUS_PX, createDragRelative,
  type DragRelative, type InputSample, type Joystick, type Point, type SourceKind,
} from "../core";
import type { HandDetector } from "../sources/hand-detector";
import { HandSource } from "../sources/hand-source";
import { MouseSource } from "../sources/mouse-source";
import { SourceArbiter, isChromeElement } from "../sources/source-arbiter";
import { TestSource, bindSkbNuiHook } from "../sources/test-source";
import {
  bindFlick, bindJoystick, createTargetBadge, hitElementAt, matchesSelectorAt, readElementRect, syncTargetDom,
  type DomTargetHandle, type DomTargetOptions, type DomTargetRecord, type DragBindingOptions,
  type FlickBindingOptions, type JoystickBindingOptions, type NuiControllerOptions, type NuiDetectorState,
  type NuiFrameSnapshot, type NuiStatusSnapshot, type TargetCoarseState,
} from "./nui-bindings";

export type {
  DomTargetHandle, DomTargetOptions, DragBindingOptions, FlickBindingOptions,
  JoystickBindingOptions, NuiControllerOptions, NuiDetectorState, NuiFrameSnapshot, NuiStatusSnapshot, TargetCoarseState,
};

const HAND_DRAG_START_PX = 42;

/** Pengendali runtime tunggal NUI di luar state React (1 loop rAF, SourceArbiter, NuiEngine, DOM ref 60fps). */
export class NuiController {
  readonly engine: NuiEngine;
  readonly arbiter: SourceArbiter;
  readonly mouseSource: MouseSource;
  readonly testSource: TestSource;
  readonly isChrome = isChromeElement;

  private readonly clock: () => number;
  private readonly testHooks: boolean;
  private readonly autoSim: boolean;
  private readonly domTargets = new Set<DomTargetRecord>();
  private readonly frameListeners = new Set<(frame: NuiFrameSnapshot) => void>();
  private readonly sampleListeners = new Set<(sample: InputSample, chrome: boolean) => void>();
  private readonly statusListeners = new Set<() => void>();

  private handSource: HandSource | null = null;
  private handAttached = false;
  private unsubHandArbiter: (() => void) | null = null;
  private unsubArbiterSample: (() => void) | null = null;
  private unsubArbiterActive: (() => void) | null = null;
  private unbindHook: (() => void) | null = null;
  private running = false;
  private rafId: number | null = null;
  private lastTickT = 0;
  private lastSample: InputSample | null = null;
  private status: NuiStatusSnapshot;
  private readonly frame: NuiFrameSnapshot;

  constructor(options: NuiControllerOptions = {}) {
    this.clock = options.clock ?? (() => performance.now());
    const devTools = options.devTools ?? false;
    this.testHooks = options.testHooks ?? false;
    this.autoSim = options.autoSim ?? true;
    this.engine = new NuiEngine(this.clock);
    this.arbiter = new SourceArbiter({ onSourceError: (kind, err) => { if (kind === "hand") this.failClosedHand(err); } });
    this.mouseSource = new MouseSource({
      devTools,
      initialSimOn: this.autoSim,
      clock: this.clock,
      canEnableSim: () => !this.handAttached,
      onSimChange: (simOn, byKey) => {
        this.syncDocumentClasses(simOn, this.status.canvasMode);
        this.updateStatus({ simOn, simToggleCount: byKey ? this.status.simToggleCount + 1 : this.status.simToggleCount });
      },
    });
    this.testSource = options.testSource ?? new TestSource(this.clock);
    this.arbiter.addSource(this.mouseSource);
    this.arbiter.addSource(this.testSource);

    const canvasMode = options.initialCanvasMode ?? false;
    this.engine.setCanvasMode(canvasMode);
    this.status = {
      activeSource: null, canvasMode, frozen: false, ownerActive: false, handNeedsOpenPose: false,
      simOn: this.mouseSource.isSimOn(), simToggleCount: 0, handError: null, devTools, handAttached: false, detectorState: "idle",
    };
    this.frame = {
      now: this.clock(), x: POINTER_OFFSCREEN, y: POINTER_OFFSCREEN, inFrame: false,
      down: false, key: false, moved: false, pinch: false, pinchStrength: 0, nib: null,
      source: null, canvasMode, frozen: false, ownerActive: false, rawHand: null, simOn: this.status.simOn,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTickT = this.clock();
    this.unsubArbiterSample = this.arbiter.subscribe((s) => this.handleSample(s));
    this.unsubArbiterActive = this.arbiter.subscribeActive((kind) => {
      this.updateStatus(kind !== "hand" ? { activeSource: kind, frozen: false, ownerActive: false, handNeedsOpenPose: false } : { activeSource: kind });
    });
    this.arbiter.start();
    this.unbindHook = bindSkbNuiHook(this.testSource, this.testHooks);
    this.syncDocumentClasses(this.status.simOn, this.status.canvasMode);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onKeyDown); window.addEventListener("keyup", this.onKeyUp);
      window.addEventListener("blur", this.onBlur); window.addEventListener("click", this.onClickCapture, true);
      if (typeof window.requestAnimationFrame === "function") this.rafId = window.requestAnimationFrame(this.onRaf);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId !== null && typeof window !== "undefined") { window.cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onKeyDown); window.removeEventListener("keyup", this.onKeyUp);
      window.removeEventListener("blur", this.onBlur); window.removeEventListener("click", this.onClickCapture, true);
    }
    this.unbindHook?.(); this.unbindHook = null;
    this.unsubArbiterSample?.(); this.unsubArbiterSample = null;
    this.unsubArbiterActive?.(); this.unsubArbiterActive = null;
    this.arbiter.stop();
    this.syncDocumentClasses(false, false, false);
    for (const rec of this.domTargets) if (rec.firedTimer) { clearTimeout(rec.firedTimer); rec.firedTimer = null; }
  }

  setCanvasMode(on: boolean): void {
    const next = Boolean(on);
    this.engine.setCanvasMode(next);
    this.syncDocumentClasses(this.status.simOn, next);
    this.updateStatus({ canvasMode: next });
  }

  setDetectorState(detectorState: NuiDetectorState): void { this.updateStatus({ detectorState }); }

  setHandDetector(detector: HandDetector | null): void {
    const hadHand = this.handSource !== null;
    this.unsubHandArbiter?.(); this.unsubHandArbiter = null; this.handSource = null;
    if (!detector) {
      this.handAttached = false;
      this.updateStatus({ handAttached: false, frozen: false, ownerActive: false, handNeedsOpenPose: false, handError: null, detectorState: "idle" });
      if (hadHand) this.resetPointer("hand");
      this.mouseSource.setSimOn(this.autoSim);
      this.syncDocumentClasses(this.mouseSource.isSimOn(), this.status.canvasMode);
      return;
    }
    this.handAttached = true;
    this.updateStatus({ handAttached: true, frozen: false, ownerActive: false, handNeedsOpenPose: false, handError: null });
    this.mouseSource.setSimOn(false); this.arbiter.releaseKind("mouse"); this.resetPointer("mouse");
    this.syncDocumentClasses(false, this.status.canvasMode);
    const hs = new HandSource({ detector, getHoverId: (x, y) => this.engine.hoverIdAt(x, y), onError: (err) => this.failClosedHand(err) });
    this.handSource = hs; this.unsubHandArbiter = this.arbiter.addSource(hs);
  }

  private failClosedHand(err: unknown): void {
    this.unsubHandArbiter?.(); this.unsubHandArbiter = null; this.handSource = null;
    this.handAttached = false;
    this.updateStatus({ handAttached: false, handError: err instanceof Error ? err.message : String(err), frozen: false, ownerActive: false, handNeedsOpenPose: false, detectorState: "idle" });
    this.arbiter.releaseKind("hand"); this.resetPointer("hand"); this.mouseSource.setSimOn(this.autoSim);
    this.syncDocumentClasses(this.mouseSource.isSimOn(), this.status.canvasMode);
  }

  private resetPointer(source: SourceKind): void {
    this.lastSample = null;
    this.engine.feed({ t: this.clock(), x: POINTER_OFFSCREEN, y: POINTER_OFFSCREEN, inFrame: false, pinch: false, pinchStrength: 0, source });
  }

  getHandSource(): HandSource | null { return this.handSource; }
  getStatus = (): NuiStatusSnapshot => this.status;
  getFrame = (): NuiFrameSnapshot => this.frame;
  subscribeStatus = (cb: () => void): (() => void) => { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); };
  subscribeFrame = (cb: (frame: NuiFrameSnapshot) => void): (() => void) => { this.frameListeners.add(cb); return () => this.frameListeners.delete(cb); };
  subscribeSample = (cb: (sample: InputSample, chrome: boolean) => void): (() => void) => { this.sampleListeners.add(cb); return () => this.sampleListeners.delete(cb); };

  register(el: HTMLElement, opts: DomTargetOptions): DomTargetHandle {
    let fillEl = opts.fillEl ?? el.querySelector<SVGCircleElement>(".thumb-confirm__fill, #ring-fill, .nui-badge .f");
    let badgeEl: HTMLSpanElement | null = null;
    if (!fillEl && opts.badge !== false) { badgeEl = createTargetBadge(el); fillEl = badgeEl.querySelector<SVGCircleElement>(".f"); }
    el.classList.add("nui-target");
    const radius = fillEl ? Number(fillEl.getAttribute("r")) || RING_SVG_RADIUS_PX : RING_SVG_RADIUS_PX;
    const handle = this.engine.register({ id: opts.id, getRect: () => readElementRect(el), holdMs: opts.holdMs, label: opts.label, mode: opts.mode, onFire: opts.onFire });
    const rec: DomTargetRecord = {
      el, handle, fillEl, circ: 2 * Math.PI * radius, badgeEl,
      prevP: -1, prevKind: null, prevLit: false, prevHolding: false, prevDone: false,
      prevFiredAt: 0, firedTimer: null, allowClickWhenNoHand: opts.allowClickWhenNoHand, onCoarseChange: opts.onCoarseChange,
    };
    this.domTargets.add(rec);
    syncTargetDom(rec);
    return {
      reset: () => { handle.reset(); el.classList.remove("nui-fired", "is-confirmed"); rec.prevP = -1; syncTargetDom(rec); },
      remove: () => {
        this.domTargets.delete(rec); handle.remove();
        if (rec.firedTimer) clearTimeout(rec.firedTimer);
        el.classList.remove("nui-target", "nui-lit", "nui-holding", "is-holding", "nui-fired", "is-confirmed");
        delete el.dataset.nui;
        badgeEl?.remove();
      },
    };
  }

  joystick(opts: JoystickBindingOptions = {}): Joystick { return bindJoystick(this.subscribeSample, opts); }
  flick(cb: () => void, opts: FlickBindingOptions = {}): () => void { return bindFlick(this.subscribeSample, cb, opts); }
  dragRelative(opts: DragBindingOptions = {}): DragRelative & { destroy(): void } {
    const drag = createDragRelative(opts);
    let prevPinch = false;
    const unsub = this.subscribeSample((s, chrome) => {
      if (s.pinch && !prevPinch) {
        const ok = !chrome && !(opts.when && !opts.when()) && !matchesSelectorAt(s.x, s.y, opts.ignore);
        drag.down(s.x, s.y, ok, s.source === "hand" ? Math.max(opts.threshold ?? DRAG_START_PX, HAND_DRAG_START_PX) : undefined);
      } else if (s.pinch && prevPinch) drag.move(s.x, s.y);
      else if (!s.pinch && prevPinch) drag.up();
      prevPinch = s.pinch;
    });
    return { down: drag.down, move: drag.move, up: drag.up, dragging: drag.dragging, destroy: () => { unsub(); drag.up(); } };
  }

  stepNow(nowOverride?: number): void {
    const now = Math.max(this.lastTickT, nowOverride ?? this.clock());
    this.lastTickT = now;
    let rawHand: Point | null = null;
    if (this.handSource && this.handAttached) {
      const hs = this.handSource.getStatus();
      if (hs.needsOpenPose !== this.status.handNeedsOpenPose) this.updateStatus({ handNeedsOpenPose: hs.needsOpenPose });
      if (this.status.activeSource === "hand") {
        rawHand = hs.raw;
        const chased = hs.ownerActive && !hs.frozen ? this.handSource.advanceDisplay(now) : null;
        if (chased) this.engine.feed({ t: now, x: chased.x, y: chased.y, inFrame: true, pinch: hs.pinch, pinchStrength: hs.pinchStrength, source: "hand" });
      }
    }
    if (!this.status.frozen) this.engine.tick(now);
    for (const rec of this.domTargets) syncTargetDom(rec);

    const p = this.engine.pointer();
    Object.assign(this.frame, {
      now, x: p.x, y: p.y, inFrame: p.in, down: p.down, key: p.key, moved: p.moved,
      pinch: this.lastSample?.pinch ?? false, pinchStrength: this.lastSample?.pinchStrength ?? 0,
      nib: this.lastSample?.nib ?? null, source: this.status.activeSource, canvasMode: this.status.canvasMode,
      frozen: this.status.frozen, ownerActive: this.status.ownerActive, rawHand, simOn: this.status.simOn,
    });
    for (const cb of [...this.frameListeners]) cb(this.frame);
  }

  private readonly onRaf = (): void => {
    if (!this.running) return;
    this.stepNow();
    this.rafId = window.requestAnimationFrame(this.onRaf);
  };

  private handleSample(sample: InputSample): void {
    this.lastSample = sample;
    if (sample.source === "hand" && this.handSource) {
      const hs = this.handSource.getStatus();
      this.updateStatus({ frozen: hs.frozen, ownerActive: hs.ownerActive, handNeedsOpenPose: hs.needsOpenPose, handError: hs.error });
    }
    const pt = sample.clickPoint ?? sample;
    const chrome = sample.pinch ? isChromeElement(hitElementAt(pt.x, pt.y)) : false;
    this.engine.feed(sample, chrome);
    for (const cb of [...this.sampleListeners]) cb(sample, chrome);
  }

  private updateStatus(patch: Partial<NuiStatusSnapshot>): void {
    const cur = this.status;
    if (!(Object.keys(patch) as (keyof NuiStatusSnapshot)[]).some((k) => patch[k] !== undefined && cur[k] !== patch[k])) return;
    this.status = { ...cur, ...patch };
    for (const cb of [...this.statusListeners]) cb();
  }

  private syncDocumentClasses(simOn: boolean, canvasMode: boolean, handLive = this.handAttached): void {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("hand-sim", simOn);
    document.documentElement.classList.toggle("hand-live", handLive);
    document.documentElement.classList.toggle("nui-canvas", canvasMode);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target;
    if (t instanceof Element && t.closest("input,textarea,select,[contenteditable]")) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    if (t instanceof Element && t.closest("button,a") && !t.closest(".nui-target")) return;
    if (this.engine.keyDown()) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") this.engine.keyUp();
  };

  private readonly onBlur = (): void => {
    this.engine.blur();
    if (!this.lastSample?.pinch) return;
    const released: InputSample = { ...this.lastSample, t: this.clock(), inFrame: false, pinch: false, pinchStrength: 0 };
    this.lastSample = released;
    for (const cb of [...this.sampleListeners]) cb(released, false);
  };

  private readonly onClickCapture = (e: MouseEvent): void => {
    if ((!this.status.simOn && !this.status.handAttached) || isChromeElement(e.target) || !(e.target instanceof Node)) return;
    for (const rec of this.domTargets) {
      if (rec.el.contains(e.target) && !(rec.allowClickWhenNoHand && !this.handAttached) && !rec.el.matches("input,select,textarea")) { e.preventDefault(); e.stopPropagation(); return; }
    }
  };
}
