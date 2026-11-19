/**
 * Real browser UI frame & LongTask telemetry for the NUI Lab benchmark.
 *
 * Uses only genuine browser APIs (requestAnimationFrame timestamps, PerformanceObserver "longtask", and Chromium's
 * optional performance.memory.usedJSHeapSize). Never fabricates CPU utilization or unsupported memory metrics.
 */
import { quantile } from "./stats";

export interface PerfWindowSnapshot {
  uiFps: number;
  rafIntervalP95Ms: number | null;
  rafIntervalMaxMs: number | null;
  longTasksInWindow: number;
  longTaskMaxMs: number | null;
  jsHeapUsedMb: number | null;
}

interface ChromiumMemoryPerformance extends Performance {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
  };
}

export function readJsHeapUsedMb(): number | null {
  if (typeof performance === "undefined") return null;
  const mem = (performance as ChromiumMemoryPerformance).memory;
  if (!mem || typeof mem.usedJSHeapSize !== "number" || !Number.isFinite(mem.usedJSHeapSize)) return null;
  return Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100;
}

export class UiPerfMonitor {
  private running = false;
  private rafId: number | null = null;
  private lastRafMs: number | null = null;
  private rafIntervals: Array<{ t: number; dt: number }> = [];
  private longTasks: Array<{ t: number; dur: number }> = [];
  private observer: PerformanceObserver | null = null;
  private readonly windowMs: number;

  constructor(windowMs = 2000) {
    this.windowMs = windowMs;
  }

  start(): void {
    if (this.running || typeof requestAnimationFrame !== "function") return;
    this.running = true;
    this.lastRafMs = null;
    this.rafIntervals = [];
    this.longTasks = [];

    if (typeof PerformanceObserver === "function") {
      try {
        const supported = PerformanceObserver.supportedEntryTypes;
        if (!supported || supported.includes("longtask")) {
          this.observer = new PerformanceObserver((list) => {
            const now = performance.now();
            for (const entry of list.getEntries()) {
              if (Number.isFinite(entry.duration) && entry.duration >= 50) {
                this.longTasks.push({ t: now, dur: entry.duration });
              }
            }
          });
          this.observer.observe({ type: "longtask", buffered: false });
        }
      } catch {
        this.observer = null;
      }
    }

    const tick = (ts: number) => {
      if (!this.running) return;
      if (this.lastRafMs !== null) {
        const dt = ts - this.lastRafMs;
        if (dt > 0 && dt < 10_000) {
          this.rafIntervals.push({ t: ts, dt });
        }
      }
      this.lastRafMs = ts;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastRafMs = null;
    try {
      this.observer?.disconnect();
    } catch {
      /* ignore */
    }
    this.observer = null;
  }

  snapshot(nowMs = typeof performance !== "undefined" ? performance.now() : 0): PerfWindowSnapshot {
    const cutoff = nowMs - this.windowMs;
    this.rafIntervals = this.rafIntervals.filter((x) => x.t >= cutoff);
    this.longTasks = this.longTasks.filter((x) => x.t >= cutoff);

    const dts = this.rafIntervals.map((x) => x.dt).sort((a, b) => a - b);
    let uiFps = 0;
    if (dts.length > 0) {
      const meanDt = dts.reduce((a, b) => a + b, 0) / dts.length;
      uiFps = meanDt > 0 ? Math.round((1000 / meanDt) * 10) / 10 : 0;
    }

    const r3 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
    const ltMax = this.longTasks.length > 0 ? Math.max(...this.longTasks.map((x) => x.dur)) : null;

    return {
      uiFps,
      rafIntervalP95Ms: r3(quantile(dts, 0.95)),
      rafIntervalMaxMs: dts.length > 0 ? r3(dts[dts.length - 1]!) : null,
      longTasksInWindow: this.longTasks.length,
      longTaskMaxMs: r3(ltMax),
      jsHeapUsedMb: readJsHeapUsedMb(),
    };
  }
}
