import type { EventRule } from "../types";

/**
 * Typed event registry: every sound the game can make, with its playback rule.
 * Rules (not call sites) own cooldowns, voice caps, variants and ducking, so game code just says `audio.emit("ui.tap")`.
 * Loudness is encoded in the assets (peak_db / RMS); `gain` here is only a trim.
 *
 * Design constraints (docs/audio/SFX_SPEC.md):
 * - Momo has no voice. `momo.*` are wings/paper only; the yawn is deliberately silent.
 * - HITL: `hitl.reveal` and `hitl.decide` are identical for every confidence and every decision (no reward or punishment colour).
 * - Nothing is bound to hover or per-frame data; fast repeats are protected by cooldowns.
 */
export const AUDIO_EVENTS = {
  // ---- interface (bus ui)
  "ui.tap": { assets: ["ui.tap_a", "ui.tap_b"], bus: "ui", cooldownMs: 60, pitchJitterCents: 25, priority: 4 },
  "ui.toggle_on": { assets: ["ui.toggle_on"], bus: "ui", cooldownMs: 80, priority: 4 },
  "ui.toggle_off": { assets: ["ui.toggle_off"], bus: "ui", cooldownMs: 80, priority: 4 },
  "ui.denied": { assets: ["ui.denied"], bus: "ui", cooldownMs: 400, maxVoices: 1, priority: 5, note: "refused action; soft, non-blaming" },
  "ui.notice": { assets: ["ui.notice"], bus: "ui", cooldownMs: 600, priority: 4 },
  "ui.ring_in": { assets: ["ui.ring_in"], bus: "ui", cooldownMs: 250, maxVoices: 2, priority: 4, note: "a ring or panel appears" },
  "ui.morph": { assets: ["ui.morph"], bus: "ui", cooldownMs: 300, priority: 3, sceneBound: true },
  "ui.skip": { assets: ["ui.skip"], bus: "ui", cooldownMs: 150, priority: 3, note: "developer skip bar only" },
  "sys.hiccup": { assets: ["sys.hiccup"], bus: "ui", cooldownMs: 1500, priority: 6, note: "provider/model/camera problem; neutral" },
  "sys.ready": { assets: ["sys.ready"], bus: "ui", cooldownMs: 1500, priority: 6, note: "only after a REAL success (camera live, models ready)" },
  "bubble.show": { assets: ["bubble.show_a", "bubble.show_b"], bus: "ui", cooldownMs: 450, pitchJitterCents: 30, priority: 3, note: "Momo bubble becomes visible; one pop, never per line of text" },

  // ---- NUI feedback (bus ui). Ring feedback follows the Owner's three interaction levels (D-20261126-06)
  "nui.lit": { assets: ["nui.lit"], bus: "ui", cooldownMs: 260, priority: 2, note: "level 2/3: a different target became the lit one (edge, throttled)" },
  "nui.hold": { assets: ["nui.hold"], bus: "ui", priority: 3, note: "LOOP while a ring fills (levels 1-3); rate follows progress" },
  "nui.commit": { assets: ["nui.commit"], bus: "ui", cooldownMs: 150, priority: 8, note: "identical for every ring" },
  "nui.release": { assets: ["nui.release"], bus: "ui", cooldownMs: 500, priority: 2, note: "sustained hold released without commit" },
  "nui.track_lost": { assets: ["nui.track_lost"], bus: "ui", cooldownMs: 6000, priority: 3 },
  "nui.track_found": { assets: ["nui.track_found"], bus: "ui", cooldownMs: 6000, priority: 3 },

  // ---- Momo (non-vocal)
  "momo.flap": { assets: ["momo.flap_a", "momo.flap_b", "momo.flap_c"], cooldownMs: 160, pitchJitterCents: 40, priority: 3, maxVoices: 2 },
  "momo.whoosh": { assets: ["momo.whoosh_a", "momo.whoosh_b"], cooldownMs: 300, priority: 3, sceneBound: true },
  "momo.land": { assets: ["momo.land"], cooldownMs: 200, priority: 3 },
  "momo.hop": { assets: ["momo.hop"], cooldownMs: 140, pitchJitterCents: 60, priority: 3 },
  "momo.wave": { assets: ["momo.wave"], cooldownMs: 500, priority: 3 },
  "momo.startle": { assets: ["momo.startle"], cooldownMs: 800, priority: 4 },

  // ---- dream loader, cover, book
  "dream.blast": { assets: ["dream.blast"], priority: 6, sceneBound: true },
  "dream.iris": { assets: ["dream.iris"], priority: 6, sceneBound: true },
  "page.curl": { assets: ["page.curl"], priority: 6, sceneBound: true, duckMusicDb: -4, duckMs: 1700 },
  "page.flick": { assets: ["page.flick"], cooldownMs: 200, priority: 4, pitchJitterCents: 50 },

  // ---- tutorial cards
  "card.deal": { assets: ["card.deal"], priority: 5, sceneBound: true },
  "card.flip": { assets: ["card.flip"], cooldownMs: 300, priority: 5 },
  "card.bifold": { assets: ["card.bifold"], cooldownMs: 300, priority: 5 },
  "card.close": { assets: ["card.close"], cooldownMs: 300, priority: 5 },
  "card.stamp": { assets: ["card.stamp"], cooldownMs: 400, priority: 6, duckMusicDb: -3, duckMs: 400 },
  "card.exit": { assets: ["card.exit"], priority: 4, sceneBound: true },
  "tool.tick": { assets: ["tool.tick"], bus: "ui", cooldownMs: 150, priority: 4 },

  // ---- levels (ribbons)
  "ribbon.drop": { assets: ["ribbon.drop"], priority: 4, sceneBound: true },
  "ribbon.notch": { assets: ["ribbon.notch"], cooldownMs: 60, priority: 5, note: "per takik (38 px); play with rate 1, 1.122, 1.26, 1.498 for notch 1-4" },
  "ribbon.armed": { assets: ["ribbon.armed"], cooldownMs: 300, priority: 6 },
  "ribbon.launch": { assets: ["ribbon.launch"], priority: 6, sceneBound: true },
  "ribbon.rebound": { assets: ["ribbon.rebound"], cooldownMs: 300, priority: 5 },
  "ribbon.unlock": { assets: ["ribbon.unlock"], cooldownMs: 1000, priority: 6, note: "only for a real fresh unlock" },

  // ---- story intro
  "intro.spotlight": { assets: ["intro.spotlight"], cooldownMs: 600, priority: 3, sceneBound: true },
  "world.rise": { assets: ["world.rise"], priority: 5, sceneBound: true },
  "jingle.level_intro": { assets: ["jingle.level_intro"], bus: "music", priority: 6, sceneBound: true },

  // ---- canvas, tools, drawing
  "tool.pencil": { assets: ["tool.pencil"], cooldownMs: 120, priority: 4 },
  "tool.eraser": { assets: ["tool.eraser"], cooldownMs: 120, priority: 4 },
  "tool.undo": { assets: ["tool.undo"], cooldownMs: 120, priority: 4 },
  "tool.redo": { assets: ["tool.redo"], cooldownMs: 120, priority: 4 },
  "tool.clear": { assets: ["tool.clear"], cooldownMs: 300, priority: 5 },
  "draw.pencil": { assets: ["draw.pencil"], priority: 3, note: "LOOP, only while a valid stroke is being drawn" },
  "draw.eraser": { assets: ["draw.eraser"], priority: 3, note: "LOOP, only while a valid erase is happening" },
  "mission.open": { assets: ["mission.open"], bus: "ui", cooldownMs: 400, priority: 4 },

  // ---- prediction and HITL (neutral)
  "hitl.submit": { assets: ["hitl.submit"], cooldownMs: 600, priority: 6 },
  "hitl.reveal": { assets: ["hitl.reveal"], cooldownMs: 600, priority: 6, note: "same sound for every confidence" },
  "hitl.decide": { assets: ["hitl.decide"], cooldownMs: 500, priority: 8, note: "identical for accept / correct / override" },
  "hitl.more": { assets: ["page.flick"], cooldownMs: 300, priority: 4 },
  "hitl.redraw": { assets: ["tool.undo"], cooldownMs: 300, priority: 4 },

  // ---- sticker
  "sticker.pop": { assets: ["sticker.pop"], cooldownMs: 500, priority: 6 },
  "sticker.throw": { assets: ["sticker.throw"], priority: 6, sceneBound: true },
  "sticker.shrink": { assets: ["sticker.shrink"], priority: 5 },

  // ---- world / placement / gameplay
  "world.fall": { assets: ["world.fall"], priority: 6, sceneBound: true },
  "world.land": { assets: ["world.land"], priority: 7 },
  "place.grab": { assets: ["place.grab"], cooldownMs: 150, priority: 4 },
  "place.rotate": { assets: ["place.rotate"], cooldownMs: 90, pitchJitterCents: 40, priority: 4 },
  "place.set": { assets: ["place.set"], cooldownMs: 400, priority: 7 },
  "thinman.step": { assets: ["thinman.step_a", "thinman.step_b", "thinman.step_c", "thinman.step_d"], cooldownMs: 110, maxVoices: 3, pitchJitterCents: 60, priority: 2, gain: 0.8 },
  "thinman.jump": { assets: ["thinman.jump"], cooldownMs: 120, priority: 5 },
  "thinman.land": { assets: ["thinman.land_soft", "thinman.land_hard"], cooldownMs: 120, priority: 5, note: "variant 0 = soft, 1 = hard (by impact)" },
  "hazard.hit": { assets: ["hazard.hit"], cooldownMs: 800, priority: 8 },
  "fall.abyss": { assets: ["fall.abyss"], cooldownMs: 1500, priority: 8, sceneBound: true },
  "goal.reach": { assets: ["goal.reach"], cooldownMs: 1500, priority: 8 },
  "win.sparkle": { assets: ["win.sparkle"], cooldownMs: 2000, priority: 6, sceneBound: true },
  "jingle.level_complete": { assets: ["jingle.level_complete"], bus: "music", priority: 9, sceneBound: true, duckMusicDb: -14, duckMs: 3600, note: "after the level is really won" },
  "jingle.fail_soft": { assets: ["jingle.fail_soft"], bus: "music", priority: 9, sceneBound: true, duckMusicDb: -10, duckMs: 2200, note: "gentle; never a buzzer" },

  // ---- ending
  "ending.chute_open": { assets: ["ending.chute_open"], priority: 6 },
  "ending.descend": { assets: ["ending.descend"], priority: 4, sceneBound: true },
  "ending.touchdown": { assets: ["ending.touchdown"], priority: 6 },
  "pond.jump": { assets: ["pond.jump"], priority: 5 },
  "pond.splash": { assets: ["pond.splash"], priority: 6 },
  "pond.sink": { assets: ["pond.sink"], priority: 5 },
  "pond.glint": { assets: ["pond.glint"], priority: 5 },
  "pond.exit": { assets: ["pond.exit"], priority: 5 },
  "recap.land": { assets: ["recap.land"], cooldownMs: 120, priority: 5, note: "play with rate stepping up the pentatonic per card" },
  "thinman.poke": { assets: ["thinman.poke"], cooldownMs: 900, priority: 4 },
  "jingle.ending_close": { assets: ["jingle.ending_close"], bus: "music", priority: 9, sceneBound: true, duckMusicDb: -16, duckMs: 5500 },
} as const satisfies Record<string, EventRule>;

export type AudioEventId = keyof typeof AUDIO_EVENTS;

/** Rate multipliers that step a C-based sound up the C major pentatonic (C D E G A). */
export const PENTATONIC_RATES = [1, 1.122, 1.26, 1.498, 1.682, 2] as const;
