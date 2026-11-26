import {
  BADGE_SVG_RADIUS_PX, FIRED_FLASH_MS, createDragRelative, createFlick, createJoystick,
  type DragOptions, type DragRelative, type InputSample, type Joystick, type JoystickOptions,
  type Point, type Rect, type RuleKind, type SourceKind, type TargetHandle, type TargetMode,
} from "../core";
import type { TestSource } from "../sources/test-source";
import { ownerIconSvg } from "@/src/components/ui/owner-icons";

const BADGE_CIRC = 2 * Math.PI * BADGE_SVG_RADIUS_PX;
const SVG_NS = "http://www.w3.org/2000/svg";

export interface NuiFrameSnapshot {
  now: number; x: number; y: number; inFrame: boolean; down: boolean; key: boolean; moved: boolean;
  pinch: boolean; pinchStrength: number; nib: Point | null; source: SourceKind | null;
  canvasMode: boolean; frozen: boolean; ownerActive: boolean; rawHand: Point | null; simOn: boolean;
}

export type NuiDetectorState = "idle" | "starting" | "ready" | "error";

export interface NuiStatusSnapshot {
  activeSource: SourceKind | null; canvasMode: boolean; frozen: boolean; ownerActive: boolean;
  simOn: boolean; simToggleCount: number; handError: string | null; devTools: boolean;
  handAttached: boolean; detectorState: NuiDetectorState; handNeedsOpenPose: boolean;
}

export interface NuiControllerOptions {
  devTools?: boolean; testHooks?: boolean; initialCanvasMode?: boolean;
  autoSim?: boolean; testSource?: TestSource; clock?: () => number;
}

export interface TargetCoarseState {
  lit: boolean;
  holding: boolean;
  kind: RuleKind;
  done: boolean;
}

export interface DomTargetOptions {
  id?: string;
  label: string;
  holdMs?: number;
  mode?: TargetMode;
  onFire?: () => void;
  fillEl?: SVGCircleElement | null;
  badge?: boolean;
  group?: string;
  allowClickWhenNoHand?: boolean;
  onCoarseChange?: (next: TargetCoarseState) => void;
}

export interface DomTargetHandle {
  reset(): void;
  remove(): void;
}

export interface JoystickBindingOptions extends JoystickOptions {
  onAxis?: (axis: number) => void;
  ignore?: string;
  showOverlay?: boolean;
}

export interface FlickBindingOptions {
  ignore?: string;
  when?: () => boolean;
}

export interface DragBindingOptions extends DragOptions {
  ignore?: string;
  when?: () => boolean;
}

export interface DomTargetRecord {
  el: HTMLElement;
  handle: TargetHandle;
  fillEl: SVGCircleElement | null;
  circ: number;
  badgeEl: HTMLSpanElement | null;
  prevP: number;
  prevKind: RuleKind | null;
  prevLit: boolean;
  prevHolding: boolean;
  prevDone: boolean;
  prevFiredAt: number;
  firedTimer: ReturnType<typeof setTimeout> | null;
  allowClickWhenNoHand?: boolean;
  onCoarseChange?: (next: TargetCoarseState) => void;
}

export type SampleSubscribe = (cb: (sample: InputSample, chrome: boolean) => void) => () => void;

export function hitElementAt(x: number, y: number): Element | null {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return null;
  return document.elementFromPoint(x, y);
}

export function matchesSelectorAt(x: number, y: number, selector?: string): boolean {
  if (!selector) return false;
  const el = hitElementAt(x, y);
  return el !== null && el.closest(selector) !== null;
}

export function readElementRect(el: HTMLElement): Rect | null {
  if (!el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}

export function createTargetBadge(el: HTMLElement): HTMLSpanElement {
  const b = document.createElement("span");
  b.className = "nui-badge";
  b.setAttribute("aria-hidden", "true");
  b.innerHTML = `<svg viewBox="0 0 40 40"><circle class="t" cx="20" cy="20" r="${BADGE_SVG_RADIUS_PX}"/><circle class="f" cx="20" cy="20" r="${BADGE_SVG_RADIUS_PX}" stroke-dasharray="${BADGE_CIRC.toFixed(2)}" stroke-dashoffset="${BADGE_CIRC.toFixed(2)}" transform="rotate(-90 20 20)"/></svg><span class="i">${ownerIconSvg("gesture-pinch", 20)}</span>`;
  if (typeof window !== "undefined" && window.getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }
  el.appendChild(b);
  return b;
}

export function syncTargetDom(rec: DomTargetRecord): void {
  const st = rec.handle.state;
  const el = rec.el;
  if (st.kind !== rec.prevKind) el.dataset.nui = st.kind;
  if (st.lit !== rec.prevLit) el.classList.toggle("nui-lit", st.lit);
  if (st.holding !== rec.prevHolding) {
    el.classList.toggle("nui-holding", st.holding);
    if (el.classList.contains("thumb-confirm")) el.classList.toggle("is-holding", st.holding);
  }
  if (st.p !== rec.prevP) {
    rec.prevP = st.p;
    if (rec.fillEl) rec.fillEl.style.strokeDashoffset = (rec.circ * (1 - st.p)).toFixed(2);
    el.setAttribute("aria-valuenow", String(Math.round(st.p * 100)));
  }
  if (st.firedAt !== rec.prevFiredAt && st.firedAt > 0) {
    rec.prevFiredAt = st.firedAt;
    el.classList.add("nui-fired");
    if (el.classList.contains("thumb-confirm")) el.classList.add("is-confirmed");
    if (rec.firedTimer) clearTimeout(rec.firedTimer);
    rec.firedTimer = setTimeout(() => {
      el.classList.remove("nui-fired", "is-confirmed");
      rec.firedTimer = null;
    }, FIRED_FLASH_MS);
  }
  const changed =
    st.lit !== rec.prevLit || st.holding !== rec.prevHolding || st.kind !== rec.prevKind || st.done !== rec.prevDone;
  rec.prevKind = st.kind;
  rec.prevLit = st.lit;
  rec.prevHolding = st.holding;
  rec.prevDone = st.done;
  if (changed && rec.onCoarseChange) {
    rec.onCoarseChange({ lit: st.lit, holding: st.holding, kind: st.kind, done: st.done });
  }
}

export function bindJoystick(subscribeSample: SampleSubscribe, opts: JoystickBindingOptions = {}): Joystick {
  const joy = createJoystick({ onJump: opts.onJump, when: opts.when });
  let prevPinch = false;
  let svg: SVGSVGElement | null = null;
  let ca: SVGCircleElement | null = null;
  let ln: SVGLineElement | null = null;
  let kb: SVGCircleElement | null = null;

  const joyHost =
    opts.showOverlay !== false && typeof document !== "undefined"
      ? (document.querySelector('[data-ui="r83"]') ?? document.body)
      : null;
  if (joyHost) {
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "nui-joy");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<circle class="a" r="24"/><line class="l"/><circle class="k" r="10"/>';
    joyHost.appendChild(svg);
    ca = svg.children[0] as SVGCircleElement | null;
    ln = svg.children[1] as SVGLineElement | null;
    kb = svg.children[2] as SVGCircleElement | null;
  }

  const drawOverlay = (x: number, y: number): void => {
    if (!svg || !ca || !ln || !kb) return;
    const o = joy.origin();
    if (!o) { svg.classList.remove("on"); return; }
    svg.classList.add("on");
    ca.setAttribute("cx", String(o.x));
    ca.setAttribute("cy", String(o.y));
    ln.setAttribute("x1", String(o.x));
    ln.setAttribute("y1", String(o.y));
    ln.setAttribute("x2", String(x));
    ln.setAttribute("y2", String(y));
    kb.setAttribute("cx", String(x));
    kb.setAttribute("cy", String(y));
  };

  const unsub = subscribeSample((sample, chrome) => {
    if (sample.pinch && !prevPinch) {
      const pt = sample.clickPoint ?? sample;
      joy.down(pt.x, pt.y, sample.t, !chrome && !matchesSelectorAt(pt.x, pt.y, opts.ignore));
      drawOverlay(sample.x, sample.y);
    } else if (sample.pinch && prevPinch) {
      joy.move(sample.x, sample.y, sample.t);
      drawOverlay(sample.x, sample.y);
    } else if (!sample.pinch && prevPinch) {
      joy.up(sample.t);
      drawOverlay(sample.x, sample.y);
    }
    prevPinch = sample.pinch;
    opts.onAxis?.(joy.dir());
  });

  return {
    down: joy.down, move: joy.move, up: joy.up, dir: joy.dir, active: joy.active, origin: joy.origin,
    destroy: () => { unsub(); joy.destroy(); svg?.remove(); },
  };
}

export function bindFlick(subscribeSample: SampleSubscribe, cb: () => void, opts: FlickBindingOptions = {}): () => void {
  const fl = createFlick(cb);
  let prevPinch = false;
  return subscribeSample((sample, chrome) => {
    if (sample.pinch && !prevPinch) {
      const pt = sample.clickPoint ?? sample;
      fl.down(!chrome && !(opts.when && !opts.when()) && !matchesSelectorAt(pt.x, pt.y, opts.ignore));
    } else if (sample.pinch && prevPinch) {
      fl.move(sample.y, sample.t);
    } else if (!sample.pinch && prevPinch) {
      fl.up();
    }
    prevPinch = sample.pinch;
  });
}

export function bindDragRelative(
  subscribeSample: SampleSubscribe,
  opts: DragBindingOptions = {},
): DragRelative & { destroy(): void } {
  const drag = createDragRelative(opts);
  let prevPinch = false;
  const unsub = subscribeSample((sample, chrome) => {
    if (sample.pinch && !prevPinch) {
      const pt = sample.clickPoint ?? sample;
      drag.down(pt.x, pt.y, !chrome && !(opts.when && !opts.when()) && !matchesSelectorAt(pt.x, pt.y, opts.ignore));
    } else if (sample.pinch && prevPinch) {
      drag.move(sample.x, sample.y);
    } else if (!sample.pinch && prevPinch) {
      drag.up();
    }
    prevPinch = sample.pinch;
  });
  return {
    down: drag.down, move: drag.move, up: drag.up, dragging: drag.dragging,
    destroy: () => { unsub(); drag.up(); },
  };
}
