import type { EmitParams, LoopHandle, LoopParams } from "../types";

/** What the bridge may play: only the central NUI feedback sounds. */
export interface NuiSoundSink {
  emit(id: "nui.lit" | "nui.commit" | "nui.release" | "nui.track_lost" | "nui.track_found", params?: EmitParams): unknown;
  loop(id: "nui.hold", params?: LoopParams): LoopHandle;
}

export interface RingView {
  readonly holding: boolean;
  readonly lit: boolean;
  readonly fired: boolean;
  /** NUI rule kind: A direct pinch, B nearest of several targets, D point/canvas cursor ring */
  readonly kind: string | null;
  /** hold progress 0..1 (read lazily while holding) */
  readonly progress: () => number;
  readonly connected: () => boolean;
}

interface RingState {
  holding: boolean;
  lit: boolean;
  fired: boolean;
  holdStart: number;
  loop: LoopHandle | null;
  loopTimer: ReturnType<typeof setTimeout> | null;
  progTimer: ReturnType<typeof setInterval> | null;
  litTimer: ReturnType<typeof setTimeout> | null;
  view: RingView;
}

export interface NuiBridgeOptions {
  readonly now?: () => number;
  /** a hold must last this long before its sound starts (a jittery pinch that never settles stays silent) */
  readonly holdDelayMs?: number;
  /** a target must stay lit this long before the lit tick plays */
  readonly litDwellMs?: number;
  /** minimum gap between two lit ticks across all targets */
  readonly litMinGapMs?: number;
  /** a hold shorter than this that ends without commit is silent */
  readonly releaseMinHoldMs?: number;
  /** hand tracking must stay lost this long before the (single, soft) cue plays */
  readonly lostDelayMs?: number;
}

/**
 * Turns the ring state the NUI already exposes on the DOM (nui-lit / nui-holding / nui-fired) into sound, with debouncing so that
 * jitter, failed pinches and tracking dropouts never spam. Pure logic (no DOM): unit-tested with fake timers.
 *
 * Owner interaction levels (D-20261126-06): level 1 (pinch-hold anywhere) has no lit state, so it sounds hold + commit only;
 * levels 2/3 add one soft tick when the nearest target changes (kind B). Every ring commits with the same neutral sound.
 */
export class NuiBridge {
  private readonly rings = new Map<object, RingState>();
  private lastLitAt = -Infinity;
  private readonly litTimes: number[] = [];
  private frozenSince: number | null = null;
  private lostTimer: ReturnType<typeof setTimeout> | null = null;
  private lostPlayed = false;
  private readonly now: () => number;
  private readonly holdDelay: number;
  private readonly litDwell: number;
  private readonly litGap: number;
  private readonly releaseMin: number;
  private readonly lostDelay: number;

  constructor(private readonly sink: NuiSoundSink, o: NuiBridgeOptions = {}) {
    this.now = o.now ?? (() => Date.now());
    this.holdDelay = o.holdDelayMs ?? 140;
    this.litDwell = o.litDwellMs ?? 90;
    this.litGap = o.litMinGapMs ?? 450;
    this.releaseMin = o.releaseMinHoldMs ?? 350;
    this.lostDelay = o.lostDelayMs ?? 700;
  }

  activeRings(): number {
    return this.rings.size;
  }

  update(key: object, view: RingView): void {
    let st = this.rings.get(key);
    if (!st) {
      st = { holding: false, lit: false, fired: false, holdStart: 0, loop: null, loopTimer: null, progTimer: null, litTimer: null, view };
      this.rings.set(key, st);
    }
    st.view = view;
    const justFired = view.fired && !st.fired;

    // lit edge (kind B only: nearest of several targets)
    if (view.lit && !st.lit && view.kind === "B" && !view.holding) this.scheduleLit(st);
    if (!view.lit && st.litTimer) {
      clearTimeout(st.litTimer);
      st.litTimer = null;
    }

    // hold edges
    if (view.holding && !st.holding) {
      st.holdStart = this.now();
      st.loopTimer = setTimeout(() => this.startLoop(key, st as RingState), this.holdDelay);
    } else if (!view.holding && st.holding) {
      const held = this.now() - st.holdStart;
      this.stopHold(st);
      if (!justFired && !view.fired && held >= this.releaseMin) this.sink.emit("nui.release");
    }

    if (justFired) {
      this.stopHold(st);
      this.sink.emit("nui.commit");
    }
    st.holding = view.holding;
    st.lit = view.lit;
    st.fired = view.fired;
    if (!view.holding && !view.lit && !view.fired) this.drop(key);
  }

  remove(key: object): void {
    const st = this.rings.get(key);
    if (!st) return;
    this.stopHold(st);
    if (st.litTimer) clearTimeout(st.litTimer);
    this.rings.delete(key);
  }

  private drop(key: object): void {
    const st = this.rings.get(key);
    if (st && !st.loop && !st.loopTimer && !st.litTimer) this.rings.delete(key);
  }

  private scheduleLit(st: RingState): void {
    if (st.litTimer) clearTimeout(st.litTimer);
    st.litTimer = setTimeout(() => {
      st.litTimer = null;
      const t = this.now();
      // burst limiter: at most two ticks per two seconds, so a hand hovering between targets cannot chatter
      while (this.litTimes.length && t - (this.litTimes[0] ?? t) > 2000) this.litTimes.shift();
      if (st.view.lit && !st.view.holding && t - this.lastLitAt >= this.litGap && this.litTimes.length < 2) {
        this.lastLitAt = t;
        this.litTimes.push(t);
        this.sink.emit("nui.lit");
      }
    }, this.litDwell);
  }

  private startLoop(key: object, st: RingState): void {
    st.loopTimer = null;
    if (!st.view.holding || !st.view.connected()) {
      this.remove(key);
      return;
    }
    st.loop = this.sink.loop("nui.hold", { gain: 0.7, rate: 0.85, fadeInMs: 120 });
    st.progTimer = setInterval(() => {
      if (!st.view.connected() || !st.view.holding) {
        this.remove(key);
        return;
      }
      const p = Math.min(1, Math.max(0, st.view.progress()));
      st.loop?.update({ rate: 0.85 + 0.75 * p, rampMs: 120 });
    }, 100);
  }

  private stopHold(st: RingState): void {
    if (st.loopTimer) clearTimeout(st.loopTimer);
    if (st.progTimer) clearInterval(st.progTimer);
    st.loopTimer = null;
    st.progTimer = null;
    st.loop?.stop(110);
    st.loop = null;
  }

  /** Hand tracking dropped (cursor frozen) / regained. One soft cue each, only after a real dropout, never repeated within the rule's cooldown. */
  setFrozen(frozen: boolean): void {
    if (frozen) {
      if (this.frozenSince !== null) return;
      this.frozenSince = this.now();
      this.lostTimer = setTimeout(() => {
        this.lostTimer = null;
        if (this.frozenSince !== null) {
          this.lostPlayed = true;
          this.sink.emit("nui.track_lost");
        }
      }, this.lostDelay);
    } else {
      this.frozenSince = null;
      if (this.lostTimer) clearTimeout(this.lostTimer);
      this.lostTimer = null;
      if (this.lostPlayed) {
        this.lostPlayed = false;
        this.sink.emit("nui.track_found");
      }
    }
  }

  dispose(): void {
    for (const k of [...this.rings.keys()]) this.remove(k);
    if (this.lostTimer) clearTimeout(this.lostTimer);
  }
}

/** DOM glue: watch class changes of NUI targets (they carry `data-nui`) and feed the bridge. Edge-driven, no per-frame work. */
export function observeNuiRings(root: HTMLElement, bridge: NuiBridge): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;
  const mo = new MutationObserver((records) => {
    const seen = new Set<HTMLElement>();
    for (const r of records) {
      const el = r.target;
      if (!(el instanceof HTMLElement) || seen.has(el) || !el.dataset.nui) continue;
      seen.add(el);
      const c = el.classList;
      bridge.update(el, {
        holding: c.contains("nui-holding"),
        lit: c.contains("nui-lit"),
        fired: c.contains("nui-fired"),
        kind: el.dataset.nui ?? null,
        progress: () => Number(el.getAttribute("aria-valuenow") ?? 0) / 100,
        connected: () => el.isConnected,
      });
    }
  });
  mo.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
  return () => mo.disconnect();
}
