// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputSample, SourceKind } from "@/src/nui/core/types";
import type { InputSource } from "@/src/nui/sources/input-source";
import { MouseSource } from "@/src/nui/sources/mouse-source";
import { ARBITER_EXCLUSIVITY_MS, SourceArbiter, isChromeElement } from "@/src/nui/sources/source-arbiter";
import { TestSource, bindSkbNuiHook } from "@/src/nui/sources/test-source";

class StubSource implements InputSource {
  private readonly listeners = new Set<(s: InputSample) => void>();
  started = false;
  stopped = false;
  throwOnStart = false;

  constructor(readonly kind: SourceKind) {}

  start(): void {
    if (this.throwOnStart) throw new Error("camera blocked");
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  subscribe(cb: (s: InputSample) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(sample: Omit<InputSample, "source"> & { source?: SourceKind }): void {
    const full: InputSample = { ...sample, source: sample.source ?? this.kind };
    for (const cb of [...this.listeners]) cb(full);
  }
}

function sample(t: number, x: number, y: number, opts: Partial<InputSample> = {}): Omit<InputSample, "source"> {
  return {
    t,
    x,
    y,
    inFrame: opts.inFrame ?? true,
    pinch: opts.pinch ?? false,
    pinchStrength: opts.pinchStrength ?? (opts.pinch ? 1 : 0),
    clickPoint: opts.clickPoint,
    nib: opts.nib,
  };
}

describe("SourceArbiter", () => {
  it("enforces 500ms exclusivity and never mixes samples across sources", () => {
    const arbiter = new SourceArbiter();
    const hand = new StubSource("hand");
    const mouse = new StubSource("mouse");
    const seen: InputSample[] = [];
    const activeLog: Array<SourceKind | null> = [];

    arbiter.addSource(hand);
    arbiter.addSource(mouse);
    arbiter.subscribe((s) => seen.push(s));
    arbiter.subscribeActive((k) => activeLog.push(k));
    arbiter.start();

    hand.emit(sample(1000, 100, 100));
    // Within 500ms: mouse samples must be ignored.
    mouse.emit(sample(1200, 500, 500));
    mouse.emit(sample(1499, 510, 510));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.source).toBe("hand");
    expect(arbiter.activeKind()).toBe("hand");

    // At exactly +500ms silence from hand: mouse takes over cleanly.
    mouse.emit(sample(1000 + ARBITER_EXCLUSIVITY_MS, 520, 520));
    expect(seen).toHaveLength(2);
    expect(seen[1]?.source).toBe("mouse");
    expect(arbiter.activeKind()).toBe("mouse");
    expect(activeLog).toEqual([null, "hand", "mouse"]);
  });

  it("fails closed from hand to mouse immediately when hand leaves frame or camera fails", () => {
    const errors: Array<{ kind: SourceKind; err: unknown }> = [];
    const arbiter = new SourceArbiter({ onSourceError: (kind, err) => errors.push({ kind, err }) });
    const hand = new StubSource("hand");
    const mouse = new StubSource("mouse");
    const seen: InputSample[] = [];

    arbiter.addSource(hand);
    arbiter.addSource(mouse);
    arbiter.subscribe((s) => seen.push(s));
    arbiter.start();

    // Hand active & pinching, then hand lost (> T_gap) emits inFrame=false, pinch=false.
    hand.emit(sample(100, 200, 200, { pinch: true }));
    hand.emit(sample(150, 200, 200, { inFrame: false, pinch: false }));
    expect(arbiter.activeKind()).toBeNull();

    // Mouse takes over 10ms later without waiting 500ms.
    mouse.emit(sample(160, 300, 300));
    expect(arbiter.activeKind()).toBe("mouse");
    expect(seen[seen.length - 1]?.source).toBe("mouse");

    // Source throwing on start fails closed without blocking other sources.
    const broken = new StubSource("hand");
    broken.throwOnStart = true;
    arbiter.addSource(broken);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe("hand");
    mouse.emit(sample(200, 320, 320));
    expect(seen[seen.length - 1]?.x).toBe(320);
  });

  it("emits synthetic pinch release when switching away from a silently stalled pinched source", () => {
    const arbiter = new SourceArbiter();
    const hand = new StubSource("hand");
    const mouse = new StubSource("mouse");
    const seen: InputSample[] = [];

    arbiter.addSource(hand);
    arbiter.addSource(mouse);
    arbiter.subscribe((s) => seen.push(s));
    arbiter.start();

    hand.emit(sample(100, 200, 200, { pinch: true }));
    // Hand hangs silently for >= 500ms; mouse arrives.
    mouse.emit(sample(700, 400, 400, { pinch: false }));

    expect(seen).toHaveLength(3);
    expect(seen[1]).toMatchObject({ source: "hand", pinch: false, inFrame: false });
    expect(seen[2]).toMatchObject({ source: "mouse", x: 400, y: 400, inFrame: true });
  });
});

describe("isChromeElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("recognizes chrome containers and native form controls, while excluding NUI targets", () => {
    document.body.innerHTML = `
      <div data-nui-off="true"><button id="b-off">Dev</button></div>
      <div id="gate"><button id="b-gate">Lanjut</button><label id="lbl"><input id="chk" type="checkbox" /></label></div>
      <select id="sel"><option>1</option></select>
      <button id="b-chrome" data-nui-chrome="true">Chrome</button>
      <div id="nui" class="nui-target"><span id="nui-inner">Ayo</span></div>
    `;
    expect(isChromeElement(document.getElementById("b-off"))).toBe(true);
    expect(isChromeElement(document.getElementById("b-gate"))).toBe(true);
    expect(isChromeElement(document.getElementById("lbl"))).toBe(true);
    expect(isChromeElement(document.getElementById("chk"))).toBe(true);
    expect(isChromeElement(document.getElementById("sel"))).toBe(true);
    expect(isChromeElement(document.getElementById("b-chrome"))).toBe(true);
    expect(isChromeElement(document.getElementById("nui"))).toBe(false);
    expect(isChromeElement(document.getElementById("nui-inner"))).toBe(false);
    expect(isChromeElement(null)).toBe(false);
  });
});

describe("MouseSource & TestSource", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("ignores H toggle when devTools=false and toggles sim when devTools=true", () => {
    const prodMouse = new MouseSource({ devTools: false });
    prodMouse.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    expect(prodMouse.isSimOn()).toBe(true);
    prodMouse.stop();

    const onSimChange = vi.fn();
    const devMouse = new MouseSource({ devTools: true, onSimChange });
    devMouse.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "H" }));
    expect(devMouse.isSimOn()).toBe(false);
    expect(onSimChange).toHaveBeenCalledWith(false, true);
    devMouse.stop();
  });

  it("binds window.__skbNui only when enabled", () => {
    const src = new TestSource(() => 123);
    src.start();
    const seen: InputSample[] = [];
    src.subscribe((s) => seen.push(s));

    const offDisabled = bindSkbNuiHook(src, false);
    expect((window as Window & { __skbNui?: unknown }).__skbNui).toBeUndefined();
    offDisabled();

    const offEnabled = bindSkbNuiHook(src, true);
    const hook = (window as Window & { __skbNui?: { push: (s: { x: number; y: number }) => void } }).__skbNui;
    expect(hook).toBeDefined();
    hook?.push({ x: 42, y: 84 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ x: 42, y: 84, t: 123, source: "test", inFrame: true });
    offEnabled();
    expect((window as Window & { __skbNui?: unknown }).__skbNui).toBeUndefined();
  });
});
