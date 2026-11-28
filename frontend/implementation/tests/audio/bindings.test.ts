// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NuiBridge, type NuiSoundSink, type RingView } from "@/src/audio/bindings/nui-bridge";
import { sceneFor } from "@/src/audio/bindings/scene-map";
import { AUDIO_SCENES } from "@/src/audio/registry/scenes";

function makeSink() {
  const emitted: string[] = [];
  const loops: Array<{ stopped: number; updates: number[] }> = [];
  const sink: NuiSoundSink = {
    emit: (id) => void emitted.push(id),
    loop: () => {
      const rec = { stopped: 0, updates: [] as number[] };
      loops.push(rec);
      return { active: true, update: (p) => void (p.rate !== undefined && rec.updates.push(p.rate)), stop: () => void rec.stopped++ };
    },
  };
  return { sink, emitted, loops };
}
const view = (o: Partial<RingView> & { p?: number } = {}): RingView => ({
  holding: false,
  lit: false,
  fired: false,
  kind: "A",
  progress: () => o.p ?? 0,
  connected: () => true,
  ...o,
});

describe("NuiBridge", () => {
  let t = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    t = 0;
  });
  afterEach(() => vi.useRealTimers());
  const adv = (ms: number) => {
    t += ms;
    vi.advanceTimersByTime(ms);
  };
  const mk = () => {
    const s = makeSink();
    return { ...s, bridge: new NuiBridge(s.sink, { now: () => t }) };
  };

  it("plays hold loop then one neutral commit for a completed ring", () => {
    const { bridge, emitted, loops } = mk();
    const el = {};
    bridge.update(el, view({ holding: true }));
    adv(200);
    expect(loops).toHaveLength(1);
    adv(1000);
    bridge.update(el, view({ holding: false, fired: true }));
    expect(emitted).toEqual(["nui.commit"]);
    expect(loops[0]?.stopped).toBe(1);
  });

  it("stays silent for a jittery pinch that ends before the hold delay", () => {
    const { bridge, emitted, loops } = mk();
    const el = {};
    for (let i = 0; i < 10; i++) {
      bridge.update(el, view({ holding: true }));
      adv(60);
      bridge.update(el, view({ holding: false }));
      adv(60);
    }
    expect(loops).toHaveLength(0);
    expect(emitted).toEqual([]);
  });

  it("plays a soft release only after a sustained hold that did not commit", () => {
    const { bridge, emitted } = mk();
    const el = {};
    bridge.update(el, view({ holding: true }));
    adv(600);
    bridge.update(el, view({ holding: false }));
    expect(emitted).toEqual(["nui.release"]);
  });

  it("ticks once for a stable lit target of kind B, never for kind A, and not faster than the min gap", () => {
    const { bridge, emitted } = mk();
    const a = {};
    const b = {};
    bridge.update(a, view({ lit: true, kind: "A" }));
    adv(200);
    expect(emitted).toEqual([]);
    bridge.update(b, view({ lit: true, kind: "B" }));
    adv(120);
    expect(emitted).toEqual(["nui.lit"]);
    // jitter between two targets: lit flips every 100 ms
    for (let i = 0; i < 12; i++) {
      bridge.update(b, view({ lit: false, kind: "B" }));
      bridge.update(a, view({ lit: true, kind: "B" }));
      adv(100);
      bridge.update(a, view({ lit: false, kind: "B" }));
      bridge.update(b, view({ lit: true, kind: "B" }));
      adv(100);
    }
    expect(emitted.filter((e) => e === "nui.lit").length).toBeLessThanOrEqual(3);
  });

  it("raises the loop rate with progress and stops it when the element leaves the DOM", () => {
    const { bridge, loops } = mk();
    let p = 0;
    let connected = true;
    const el = {};
    const v = (): RingView => view({ holding: true, progress: () => p, connected: () => connected });
    bridge.update(el, v());
    adv(150);
    p = 0.9;
    adv(150);
    const ups = loops[0]?.updates ?? [];
    expect(ups[ups.length - 1]).toBeGreaterThan(1.4);
    connected = false;
    adv(150);
    expect(loops[0]?.stopped).toBe(1);
    expect(bridge.activeRings()).toBe(0);
  });

  it("announces tracking loss once after a real dropout and regain once, never for a blink", () => {
    const { bridge, emitted } = mk();
    bridge.setFrozen(true);
    adv(300);
    bridge.setFrozen(false);
    expect(emitted).toEqual([]);
    bridge.setFrozen(true);
    adv(800);
    bridge.setFrozen(false);
    expect(emitted).toEqual(["nui.track_lost", "nui.track_found"]);
  });
});

describe("sceneFor", () => {
  it("maps every route to an existing scene", () => {
    const kinds = ["load", "cover", "tutorial", "levels", "canvas", "level", "ending"] as const;
    for (const k of kinds) for (const intro of [false, true]) for (const stage of [null, 1, 2, 3, 9]) {
      expect(AUDIO_SCENES).toHaveProperty(sceneFor({ routeKind: k, introPlaying: intro, stage }));
    }
  });
  it("uses the story scene during the level intro and the level's own world track afterwards", () => {
    expect(sceneFor({ routeKind: "level", introPlaying: true, stage: 2 })).toBe("story");
    expect(sceneFor({ routeKind: "level", introPlaying: false, stage: 2 })).toBe("world2");
    expect(sceneFor({ routeKind: "level", introPlaying: false, stage: 3 })).toBe("world3");
    expect(sceneFor({ routeKind: "canvas", introPlaying: false, stage: 3 })).toBe("canvas");
  });
});
