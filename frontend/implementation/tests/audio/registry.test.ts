// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AUDIO_ASSETS } from "@/src/audio/registry/assets.generated";
import { AUDIO_EVENTS } from "@/src/audio/registry/events";
import { AUDIO_SCENES } from "@/src/audio/registry/scenes";

const assets = AUDIO_ASSETS as Record<string, { kind: string; group: string; bus: string; duration: number; bytes: number }>;
const events = AUDIO_EVENTS as Record<string, { assets: readonly string[]; bus?: string }>;
const scenes = AUDIO_SCENES as Record<string, { track: string | null; amb?: string | null; warm?: readonly string[] }>;

describe("audio registries", () => {
  it("every event references assets that exist in the generated catalog", () => {
    const missing: string[] = [];
    for (const [id, r] of Object.entries(events)) for (const a of r.assets) if (!assets[a]) missing.push(`${id} -> ${a}`);
    expect(missing).toEqual([]);
  });

  it("every scene track is a music loop and every ambience an amb loop; warm entries exist", () => {
    const bad: string[] = [];
    for (const [id, s] of Object.entries(scenes)) {
      if (s.track && assets[s.track]?.kind !== "music") bad.push(`${id} track ${s.track}`);
      if (s.amb && assets[s.amb]?.kind !== "amb") bad.push(`${id} amb ${s.amb}`);
      for (const w of s.warm ?? []) {
        if (w.startsWith("group:")) {
          if (!Object.values(assets).some((a) => a.group === w.slice(6))) bad.push(`${id} warm ${w} (empty group)`);
        } else if (!assets[w]) bad.push(`${id} warm ${w}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no asset is orphaned: every sound is reachable from an event or a scene", () => {
    const used = new Set<string>();
    for (const r of Object.values(events)) for (const a of r.assets) used.add(a);
    for (const s of Object.values(scenes)) {
      if (s.track) used.add(s.track);
      if (s.amb) used.add(s.amb);
    }
    expect(Object.keys(assets).filter((a) => !used.has(a))).toEqual([]);
  });

  it("looping events point at loop assets and one-shot events never at loops", () => {
    const wrong: string[] = [];
    const loopEvents = new Set(["draw.pencil", "draw.eraser", "nui.hold"]);
    for (const [id, r] of Object.entries(events)) {
      for (const a of r.assets) {
        const isLoop = assets[a]?.kind === "sfxloop";
        if (isLoop !== loopEvents.has(id)) wrong.push(`${id} -> ${a}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("nothing is voice-like by name (Momo has no voice)", () => {
    const re = /(voice|speech|speak|talk|tts|stt|giggle|laugh|yawn|snore|gibberish|vocal|hum_)/i;
    expect([...Object.keys(assets), ...Object.keys(events)].filter((k) => re.test(k))).toEqual([]);
  });

  it("HITL decision and reveal sounds are single shared assets (neutral by construction)", () => {
    expect(events["hitl.decide"]?.assets).toEqual(["hitl.decide"]);
    expect(events["hitl.reveal"]?.assets).toEqual(["hitl.reveal"]);
  });

  it("asset budget: SFX stay small and no one-shot is long", () => {
    const sfx = Object.values(assets).filter((a) => a.kind === "sfx");
    expect(sfx.reduce((n, a) => n + a.bytes, 0)).toBeLessThan(400 * 1024);
    expect(sfx.every((a) => a.duration < 4)).toBe(true);
  });
});
