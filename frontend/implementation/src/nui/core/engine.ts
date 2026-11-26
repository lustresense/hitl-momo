import { isChrome } from "./chrome";
import {
  MOVE_CANCEL_PX, POINTER_OFFSCREEN, R1_STICKY_HOVER_PAD_PX,
  RING_DRAIN_RATIO, RING_DT_CAP_MS, TARGET_MIN_AGE_MS,
} from "./constants";
import { nearestItem, pickHoverTarget, rectContains, rectVisible } from "./geometry";
import { holdMs } from "./hold-duration";
import type { InputSample, Point, PointerState, Rect, RuleKind, SourceKind, TargetHandle, TargetOptions, TargetState } from "./types";

const HAND_MOVE_CANCEL_PX = 56;

interface Target {
  id: string;
  opts: TargetOptions;
  ms: number;
  mode: "any" | "point";
  since: number;
  state: TargetState;
}
type Active = readonly [Target, Rect];

const BLANK = (): TargetState => ({ p: 0, lit: false, holding: false, kind: "A", done: false, firedAt: 0 });

/** Mesin aturan A/B/C/D, port hand.js tanpa DOM. Dijalankan oleh satu loop rAF. */
export class NuiEngine {
  private readonly targets = new Set<Target>();
  private readonly P: PointerState & { lock: Target | null } = {
    x: POINTER_OFFSCREEN, y: POINTER_OFFSCREEN, in: false, down: false, key: false, moved: false, lock: null,
  };
  private x0 = 0;
  private y0 = 0;
  private pinchPrev = false;
  private canvasMode = false;
  private lastLit: Target | null = null;
  private lastSource: SourceKind = "mouse";
  private nextTargetId = 1;
  private last: number;

  constructor(private readonly clock: () => number = () => performance.now()) {
    this.last = clock();
  }

  register(opts: TargetOptions): TargetHandle {
    const id = opts.id && opts.id.length > 0 ? opts.id : `nui-t-${this.nextTargetId++}`;
    const ms = opts.holdMs !== undefined && Number.isFinite(opts.holdMs) && opts.holdMs > 0 ? opts.holdMs : holdMs(opts.label);
    const t: Target = { id, opts, ms, mode: opts.mode === "point" ? "point" : "any", since: this.clock(), state: BLANK() };
    this.targets.add(t);
    return {
      id,
      state: t.state,
      remove: () => {
        this.targets.delete(t);
        if (this.P.lock === t) this.P.lock = null;
        if (this.lastLit === t) this.lastLit = null;
        t.state.lit = false;
        t.state.holding = false;
      },
      reset: () => {
        t.state.p = 0;
        t.state.done = false;
        t.state.firedAt = 0;
        t.since = this.clock();
      },
    };
  }

  setCanvasMode(on: boolean): void {
    this.canvasMode = on;
    if (on) this.lastLit = null;
  }

  getCanvasMode(): boolean {
    return this.canvasMode;
  }

  /** ID target yang sedang tersorot pada Mode A/B non-kanvas (null di kanvas atau saat tidak ada). */
  getLitTargetId(): string | null {
    if (this.canvasMode || !this.lastLit || this.lastLit.mode === "point" || this.lastLit.state.done) return null;
    return this.lastLit.id;
  }

  /** ID target Mode B yang tersorot di titik `(x, y)` (menghormati hover lengket 24 px, mati di kanvas). */
  hoverIdAt(x: number, y: number): string | null {
    if (this.canvasMode) return null;
    const pool = this.actives().filter(([t]) => t.mode !== "point");
    if (pool.length <= 1) return null;
    const picked = pickHoverTarget(pool, x, y, this.lastLit, R1_STICKY_HOVER_PAD_PX, this.hoverViewport());
    return picked ? picked.id : null;
  }

  isChrome(el: unknown): boolean {
    return isChrome(el);
  }

  pointer(): PointerState {
    const { x, y, in: inside, down, key, moved } = this.P;
    return { x, y, in: inside, down, key, moved };
  }

  /** Sampel sumber (mouse/hand). `chrome` = cubit mulai di elemen chrome (diabaikan). */
  feed(s: InputSample, chrome = false): void {
    const P = this.P;
    this.lastSource = s.source;
    P.x = s.x;
    P.y = s.y;
    P.in = s.inFrame;
    if (s.pinch && !this.pinchPrev) {
      if (!chrome) {
        const o = s.clickPoint ?? s;
        P.down = true;
        this.x0 = s.x;
        this.y0 = s.y;
        P.moved = false;
        P.lock = this.lockAt(
          o.x,
          o.y,
          s.source === "hand" ? s.preferredHoverId : undefined,
          s.source === "hand" ? s.nib : undefined,
        );
      }
    } else if (!s.pinch && this.pinchPrev) {
      this.release();
    }
    this.pinchPrev = s.pinch;
    const cancelPx = s.source === "hand" && !this.canvasMode ? HAND_MOVE_CANCEL_PX : MOVE_CANCEL_PX;
    if (P.down && !P.moved && Math.hypot(P.x - this.x0, P.y - this.y0) > cancelPx) P.moved = true;
  }

  /** Enter/Spasi turun. Mengembalikan true bila event dipakai (preventDefault). */
  keyDown(): boolean {
    const P = this.P;
    if (!P.key) {
      const act = this.actives().filter(([t]) => t.mode !== "point" || this.canvasMode);
      const lit = this.lastLit;
      P.lock = lit && act.some(([t]) => t === lit) ? lit : act.length === 1 ? (act[0] as Active)[0] : P.lock;
    }
    if (P.lock) P.key = true;
    return P.lock !== null;
  }

  keyUp(): void {
    this.P.key = false;
    if (!this.P.down) this.P.lock = null;
  }

  /** Jendela kehilangan fokus. */
  blur(): void {
    this.release();
    this.P.key = false;
    this.P.lock = null;
    this.pinchPrev = false;
  }

  tick(tnow: number): void {
    const P = this.P;
    const dt = Math.max(0, Math.min(RING_DT_CAP_MS, tnow - this.last));
    if (tnow > this.last) this.last = tnow;
    const act = this.actives();
    const pool = act.filter(([t]) => t.mode !== "point");
    let lit: Target | null = null;
    if (P.lock && act.some(([t]) => t === P.lock)) lit = P.lock;
    else if (!this.canvasMode && pool.length === 1) lit = (pool[0] as Active)[0];
    else if (!this.canvasMode && pool.length > 1 && P.in) {
      lit = pickHoverTarget(pool, P.x, P.y, this.lastLit, R1_STICKY_HOVER_PAD_PX, this.hoverViewport());
    }
    this.lastLit = lit;
    const kind: RuleKind = pool.length > 1 ? "B" : "A";
    for (const [t] of act) {
      const st = t.state;
      st.kind = t.mode === "point" || this.canvasMode ? "D" : kind;
      st.lit = t === lit && st.kind !== "D";
      st.holding = t === P.lock && (P.down || P.key) && !P.moved;
      st.p = st.holding ? Math.min(1, st.p + dt / t.ms) : Math.max(0, st.p - (dt / t.ms) * RING_DRAIN_RATIO);
      if (st.p >= 1 - 1e-9 && !st.done) {
        st.p = 1;
        this.fire(t, tnow);
      }
    }
    for (const t of this.targets) {
      if (!act.some(([a]) => a === t)) {
        t.state.lit = false;
        t.state.holding = false;
      }
    }
  }

  private hoverViewport(): { readonly w: number; readonly h: number } | undefined {
    if (this.lastSource !== "hand" || typeof window === "undefined") return undefined;
    return { w: window.innerWidth, h: window.innerHeight };
  }

  private fire(t: Target, tnow: number): void {
    t.state.done = true;
    t.state.firedAt = tnow;
    this.P.lock = null;
    t.state.holding = false;
    t.state.lit = false;
    const cb = t.opts.onFire;
    if (cb) void Promise.resolve().then(cb);
  }

  private release(): void {
    this.P.down = false;
    this.P.moved = false;
    this.P.lock = this.P.key ? this.P.lock : null;
  }

  private actives(): Active[] {
    const out: Active[] = [];
    for (const t of this.targets) {
      if (t.state.done) continue;
      const r = t.opts.getRect();
      if (rectVisible(r)) out.push([t, r]);
    }
    return out;
  }

  /** hand.js:64-73 + R1 §5.3.4 mostHovered(400 ms) untuk Mode B. */
  private lockAt(x: number, y: number, preferredHoverId?: string, altPt?: Point): Target | null {
    const t0 = this.clock();
    const act = this.actives();
    const hitPoint = (px: number, py: number) =>
      act.find(([t, r]) => t.mode === "point" && (t.opts.contains ? t.opts.contains(px, py) : rectContains(r, px, py)));
    /* Ring bulat di luar kertas digambar di pusat telapak tangan (x, y / clickPoint); kunci target di titik itu dulu, nib hanya cadangan. */
    const hit = hitPoint(x, y) ?? (altPt ? hitPoint(altPt.x, altPt.y) : undefined);
    if (hit) return hit[0].since < t0 - TARGET_MIN_AGE_MS ? hit[0] : null;
    if (this.canvasMode) return null;
    const pool = act.filter(([t]) => t.mode !== "point" && t.since < t0 - TARGET_MIN_AGE_MS);
    if (pool.length === 1) return (pool[0] as Active)[0];
    if (pool.length > 1) {
      if (preferredHoverId) {
        const preferred = pool.find(([t]) => t.id === preferredHoverId);
        if (preferred) return preferred[0];
      }
      return nearestItem(pool, x, y);
    }
    return null;
  }
}
