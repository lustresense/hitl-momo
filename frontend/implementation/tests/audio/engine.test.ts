// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AudioEngine, type AudioEngineOptions } from "@/src/audio/engine/AudioEngine";
import type { EventRule, SceneConfig } from "@/src/audio/types";
import { FakeContext, fakeFetch, flush } from "./fakes";

const catalog = {
  "sfx.a": { url: "/a.ogg", group: "core", kind: "sfx" },
  "sfx.b": { url: "/b.ogg", group: "core", kind: "sfx" },
  "sfx.broken": { url: "/broken.ogg", kind: "sfx" },
  "sfx.missing": { url: "/missing.ogg", kind: "sfx" },
  "loop.scratch": { url: "/scratch.ogg", kind: "sfxloop" },
  "m.one": { url: "/m1.ogg", kind: "music" },
  "m.two": { url: "/m2.ogg", kind: "music" },
  "m.three": { url: "/m3.ogg", kind: "music" },
  "amb.x": { url: "/amb.ogg", kind: "amb" },
};
const durations = { "/a.ogg": 0.2, "/b.ogg": 0.3, "/broken.ogg": -1, "/scratch.ogg": 0.8, "/m1.ogg": 40, "/m2.ogg": 50, "/m3.ogg": 60, "/amb.ogg": 12 };

const events: Record<string, EventRule> = {
  tap: { assets: ["sfx.a", "sfx.b"], cooldownMs: 100 },
  "scene.long": { assets: ["sfx.b"], sceneBound: true },
  nope: { assets: ["sfx.missing"] },
  bad: { assets: ["sfx.broken"] },
  scratch: { assets: ["loop.scratch"] },
  duckme: { assets: ["sfx.a"], duckMusicDb: -12, duckMs: 500 },
  musicbus: { assets: ["sfx.a"], bus: "music" },
};
const scenes: Record<string, SceneConfig> = {
  s1: { track: "m.one", amb: "amb.x" },
  s1b: { track: "m.one" },
  s2: { track: "m.two" },
  s3: { track: "m.three" },
  quiet: { track: null },
};

function make(over: Partial<AudioEngineOptions> = {}) {
  const ctx = new FakeContext();
  let t = 1000;
  const fetched: string[] = [];
  const doc = { hidden: false, handlers: new Set<() => void>(), addEventListener(_t: string, l: () => void) { this.handlers.add(l); }, removeEventListener(_t: string, l: () => void) { this.handlers.delete(l); } };
  const store: Record<string, string> = {};
  const engine = new AudioEngine({
    events,
    scenes,
    catalog,
    createContext: () => ctx as unknown as AudioContext,
    fetchBuffer: fakeFetch(durations, fetched),
    storage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => void (store[k] = v) },
    now: () => t,
    random: () => 0.1,
    doc,
    win: null,
    idle: (fn) => fn(),
    ...over,
  });
  return {
    engine,
    ctx,
    fetched,
    doc,
    store,
    advance: (ms: number) => {
      t += ms;
      ctx.currentTime += ms / 1000;
    },
    hide: () => {
      doc.hidden = true;
      for (const h of doc.handlers) h();
    },
    show: () => {
      doc.hidden = false;
      for (const h of doc.handlers) h();
    },
  };
}

describe("AudioEngine lifecycle", () => {
  it("creates no AudioContext before the first unlock and drops sounds as locked", () => {
    const { engine, ctx } = make();
    expect(engine.state()).toBe("idle");
    expect(engine.emit("tap")).toBeNull();
    expect(engine.snapshot().dropped.locked).toBe(1);
    expect(ctx.sources).toHaveLength(0);
  });

  it("remembers the wanted scene while locked and starts it exactly once after unlock", async () => {
    const { engine, ctx } = make();
    engine.scene("s1");
    engine.scene("s1"); // idempotent
    expect(ctx.sources).toHaveLength(0);
    await engine.unlock();
    await flush(20);
    expect(engine.state()).toBe("running");
    const music = ctx.sources.filter((s) => s.loop && s.buffer?.duration === 40);
    expect(music).toHaveLength(1);
    expect(engine.snapshot().music.track).toBe("m.one");
    expect(engine.snapshot().ambience.track).toBe("amb.x");
  });

  it("stays locked when the browser refuses to resume", async () => {
    const { engine, ctx } = make();
    ctx.resumeBlocked = true;
    expect(await engine.unlock()).toBe(false);
    expect(engine.state()).toBe("locked");
    expect(engine.emit("tap")).toBeNull();
  });

  it("is unsupported (and silent) without an AudioContext", async () => {
    const { engine } = make({ createContext: () => null });
    expect(await engine.unlock()).toBe(false);
    expect(engine.state()).toBe("unsupported");
    expect(engine.emit("tap")).toBeNull();
  });
});

describe("music director", () => {
  async function running() {
    const h = make();
    await h.engine.unlock();
    return h;
  }

  it("never leaves two copies of the same track playing after rapid scene changes", async () => {
    const h = await running();
    h.engine.scene("s1");
    h.engine.scene("s2");
    h.engine.scene("s1");
    h.engine.scene("s3");
    h.engine.scene("s2");
    await flush(40);
    expect(h.engine.snapshot().music.track).toBe("m.two");
    const live = h.ctx.active().filter((s) => s.loop && s.stoppedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]?.buffer?.duration).toBe(50);
  });

  it("keeps a track running when another scene asks for the same one", async () => {
    const h = await running();
    h.engine.scene("s1");
    await flush(40);
    const before = h.ctx.sources.length;
    h.engine.scene("s1b");
    await flush(40);
    const music = h.ctx.sources.slice(0).filter((s) => s.loop && s.buffer?.duration === 40);
    expect(music).toHaveLength(1);
    expect(h.ctx.sources.length).toBe(before); // nothing new started
  });

  it("resumes a recently left track near where it was instead of restarting at bar one", async () => {
    const h = await running();
    h.engine.scene("s1");
    await flush(40);
    h.advance(12_000);
    h.engine.scene("s2");
    await flush(40);
    h.advance(3_000);
    h.engine.scene("s1");
    await flush(40);
    const second = h.ctx.sources.filter((s) => s.loop && s.buffer?.duration === 40)[1];
    expect(second?.startOffset).toBeGreaterThan(10);
  });

  it("keeps at most two music buffers decoded", async () => {
    const h = await running();
    for (const s of ["s1", "s2", "s3"]) {
      h.engine.scene(s);
      await flush(40);
    }
    const ids = h.engine.snapshot().loadedBuffers.map((b) => b.id).filter((id) => id.startsWith("m."));
    expect(ids.length).toBeLessThanOrEqual(2);
  });

  it("ignores an unknown scene id without cutting the music", async () => {
    const h = await running();
    h.engine.scene("s1");
    await flush(40);
    h.engine.scene("typo");
    await flush(40);
    expect(h.engine.snapshot().music.track).toBe("m.one");
    expect(h.engine.snapshot().dropped["unknown-event"]).toBeGreaterThan(0);
  });

  it("fades to silence for a null track", async () => {
    const h = await running();
    h.engine.scene("s1");
    await flush(40);
    h.engine.scene("quiet");
    await flush(40);
    expect(h.engine.snapshot().music.track).toBeNull();
  });
});

describe("sound effects", () => {
  async function running() {
    const h = make();
    await h.engine.unlock();
    await flush(10);
    return h;
  }

  it("plays a loaded sound, alternates variants and honours the cooldown", async () => {
    const h = await running();
    h.engine.warm(["group:core"]);
    await flush(20);
    expect(h.engine.emit("tap")).not.toBeNull();
    expect(h.engine.emit("tap")).toBeNull(); // inside 100 ms cooldown
    expect(h.engine.snapshot().dropped.cooldown).toBe(1);
    h.advance(150);
    h.engine.emit("tap");
    const durs = h.ctx.sources.filter((s) => !s.loop).map((s) => s.buffer?.duration);
    expect(new Set(durs).size).toBe(2); // two different variants, not the same twice in a row
  });

  it("plays a sound that had to be fetched first only if it is still fresh", async () => {
    const h = await running();
    h.engine.emit("tap"); // not decoded yet
    await flush(20);
    expect(h.ctx.sources.filter((s) => !s.loop)).toHaveLength(1);
  });

  it("survives a missing and a corrupt asset: no throw, counted, retried a bounded number of times", async () => {
    const h = await running();
    for (let i = 0; i < 6; i++) {
      h.engine.emit("nope");
      h.engine.emit("bad");
      await flush(10);
      h.advance(5000);
    }
    const snap = h.engine.snapshot();
    expect(snap.failedLoads.map((f) => f.id).sort()).toEqual(["sfx.broken", "sfx.missing"]);
    expect(snap.failedLoads.every((f) => f.attempts <= 3)).toBe(true);
    expect(h.ctx.sources.filter((s) => !s.loop)).toHaveLength(0);
  });

  it("does not play anything while muted or when the bus slider is zero", async () => {
    const h = await running();
    h.engine.warm(["group:core"]);
    await flush(20);
    h.engine.setPrefs({ muted: true });
    expect(h.engine.emit("tap")).toBeNull();
    h.engine.setPrefs({ muted: false, sfx: 0 });
    h.advance(200);
    expect(h.engine.emit("tap")).toBeNull();
    expect(h.engine.snapshot().dropped.muted).toBe(2);
    h.engine.setPrefs({ sfx: 0.9 });
    h.advance(200);
    expect(h.engine.emit("tap")).not.toBeNull();
  });

  it("fades scene-bound sounds out when the scene changes and leaves others alone", async () => {
    const h = await running();
    h.engine.warm(["group:core"]);
    await flush(20);
    h.engine.emit("scene.long");
    h.advance(200);
    h.engine.emit("tap");
    h.engine.scene("s1");
    const [long, short] = h.ctx.sources.filter((s) => !s.loop);
    expect(long?.stoppedAt).not.toBeNull();
    expect(short?.stoppedAt ?? null).toBeNull();
  });

  it("ducks the music when a rule asks for it", async () => {
    const h = await running();
    h.engine.warm(["group:core"]);
    await flush(20);
    h.engine.scene("s1");
    await flush(40);
    h.engine.emit("duckme");
    const duck = h.ctx.gains.find((g) => g.gain.calls.some((c) => c.op === "target" && (c.v ?? 1) < 0.5 && (c.v ?? 1) > 0.2));
    expect(duck).toBeDefined();
  });

  it("tracks a continuous loop and stops it with the scene", async () => {
    const h = await running();
    const loop = h.engine.loop("scratch");
    await flush(20);
    expect(loop.active).toBe(true);
    expect(h.engine.snapshot().activeLoops).toBe(1);
    h.engine.scene("s2");
    expect(loop.active).toBe(false);
  });

  it("reports unknown events once and never throws", async () => {
    const h = await running();
    expect(() => h.engine.emit("does.not.exist")).not.toThrow();
    expect(h.engine.snapshot().dropped["unknown-event"]).toBe(1);
  });
});

describe("tab visibility and preferences", () => {
  it("pauses on hide, drops sounds while hidden and resumes on show", async () => {
    const h = make();
    await h.engine.unlock();
    h.engine.scene("s1");
    await flush(40);
    h.engine.warm(["group:core"]);
    await flush(20);
    h.hide();
    expect(h.engine.state()).toBe("suspended");
    expect(h.engine.emit("tap")).toBeNull();
    expect(h.engine.snapshot().dropped.hidden).toBe(1);
    h.show();
    await flush(10);
    expect(h.engine.state()).toBe("running");
    h.advance(200);
    expect(h.engine.emit("tap")).not.toBeNull();
  });

  it("persists preferences and survives broken storage", () => {
    const h = make();
    h.engine.setPrefs({ master: 0.4, muted: true });
    const again = make({ storage: { getItem: () => h.store["sketchbook.audio.prefs.v1"] ?? null, setItem: () => undefined } });
    expect(again.engine.getPrefs().master).toBeCloseTo(0.4);
    expect(again.engine.getPrefs().muted).toBe(true);
    const broken = make({ storage: { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } } });
    expect(() => broken.engine.setPrefs({ music: 0.2 })).not.toThrow();
    expect(broken.engine.getPrefs().music).toBeCloseTo(0.2);
  });

  it("notifies subscribers on preference changes", () => {
    const h = make();
    let n = 0;
    const off = h.engine.subscribe(() => n++);
    h.engine.setPrefs({ sfx: 0.5 });
    off();
    h.engine.setPrefs({ sfx: 0.6 });
    expect(n).toBe(1);
  });

  it("only exposes the recording tap in developer builds", async () => {
    const prod = make();
    await prod.engine.unlock();
    expect(prod.engine.recordingTap()).toBeNull();
    const dev = make({ devTools: true });
    await dev.engine.unlock();
    expect(dev.engine.recordingTap()).not.toBeNull();
  });
});
