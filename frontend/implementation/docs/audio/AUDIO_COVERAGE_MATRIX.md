# Audio coverage matrix (M-047)

Evidence classes: **UNIT_ONLY** (mocked audio), **BROWSER_E2E** (headless Chromium, null sink: proves what was scheduled, not how it sounds), **STATIC_ONLY** (read from code), **NOT_TESTED** (webcam, headphones, school devices, listening). Detailed per-event tables with file:line, throttling and "deliberately silent" lists:
[`coverage/int1-onboarding.md`](coverage/int1-onboarding.md), [`coverage/int2-canvas.md`](coverage/int2-canvas.md), [`coverage/int3-world-ending.md`](coverage/int3-world-ending.md). Sound design: [`SFX_SPEC.md`](SFX_SPEC.md), [`MUSIC_DESIGN.md`](MUSIC_DESIGN.md), [`sfx_notes/`](sfx_notes/). Registry source of truth: `src/audio/registry/events.ts`, `scenes.ts`.

| Screen / scene | Music + ambience | Event sounds (ids) | Deliberately silent | Evidence |
|---|---|---|---|---|
| Dream loader (`dream`) | `bgm.dream` + `amb.dream_wind` | `sys.ready` (models ready), `sys.hiccup` (model failed), `ui.tap` (nickname), `dream.blast`, `dream.iris`, `momo.whoosh` | progress percent, Momo sleep/"zzz" | UNIT_ONLY + BROWSER_E2E (scene, unlock) |
| Cover (`cover`) | `bgm.cover` + `amb.paper_room` | `ui.toggle_on/off`, `ui.tap`, `ui.denied` (locked camera toggle), `momo.startle`, `ui.morph`, `momo.wave`, `momo.flap`, `ui.ring_in`, `page.curl`, camera live `sys.ready` / denied `sys.hiccup` (shell) | **yawn and all Momo mood changes (no voice)**, greeting text | UNIT_ONLY + BROWSER_E2E (scene) |
| Tutorial (`tutorial`) | `bgm.tutorial` + `amb.paper_room` | `card.deal/flip/bifold/close/stamp/exit`, `thinman.jump/step`, `goal.reach`, `tool.*`, `tool.tick`, `draw.*` loops | ambient hop/ouch loops of the safe/danger card | UNIT_ONLY + BROWSER_E2E (scene) |
| Level select (`levels`) | `bgm.levels` | `ribbon.drop`, `ribbon.notch` (pentatonic by notch), `ribbon.armed`, `ribbon.launch`, `ribbon.rebound`, `ribbon.unlock` (real fresh unlock only), `ui.denied` (locked ribbon) | hover / lit-ribbon changes | UNIT_ONLY + BROWSER_E2E (scene) |
| Story intro (`story`) | `bgm.story` + `amb.world_air` | `jingle.level_intro`, `momo.whoosh`, `intro.spotlight`, `world.rise` | dev-skip fast-forward | UNIT_ONLY + BROWSER_E2E (jingle once) |
| Canvas, prediction, HITL, sticker (`canvas`) | `bgm.focus` (kept, never restarted) | `tool.pencil/eraser/undo/redo/clear`, `draw.pencil` / `draw.eraser` loops (valid strokes only), `mission.open`, `ui.ring_in`, `ui.denied` (empty drawing), `hitl.submit`, `hitl.reveal`, `hitl.decide` (**identical** for accept/correct/override), `hitl.more`, `hitl.redraw`, `sys.hiccup`, `sticker.pop/throw/shrink` | confidence-dependent sounds, mission close, bare pen-down | UNIT_ONLY + BROWSER_E2E (submit/reveal/decide once, loop start/stop) |
| World placement and gameplay (`world1..3`) | `bgm.l1/l2/l3` + `amb.world_air`; patch calmer while placing | `world.fall`, `world.land`, `place.grab/rotate/set`, `ui.denied` (refused rotate/commit/drag), `world.rise`, `thinman.jump/step/land`, `hazard.hit`, `fall.abyss`, `goal.reach`, `jingle.fail_soft`, `win.sparkle`, `jingle.level_complete`, `ui.ring_in` | contact before the outcome, forced (dev skip) wins, per-frame physics | UNIT_ONLY + BROWSER_E2E (fall/land once) + STATIC_ONLY (outcomes) |
| Ending (`ending`) | `bgm.ending` + `amb.world_air` | `ending.chute_open/descend/touchdown`, `thinman.step/poke`, `pond.jump/splash/sink/glint/exit`, `momo.wave`, `recap.land` (pentatonic by card), `jingle.ending_close` | dev-skip results | UNIT_ONLY (BROWSER_E2E not run to the ending) |
| Rings everywhere (NUI) | n/a | `nui.hold` loop (after a 140 ms hold), `nui.commit` (same for every ring), `nui.lit` (kind B only, throttled), `nui.release`, `nui.track_lost/found` (once per real dropout) | hover, jitter, failed pinch, per-frame data | UNIT_ONLY (bridge) + BROWSER_E2E (commits counted) |
| Chrome | n/a | `ui.skip` (dev skip bar), audio control `ui.tap` / `ui.toggle_on`, `ui.notice` (route notice) | | UNIT_ONLY |

## Known gaps (honest list)
- Webcam-driven interaction with sound was **NOT_TESTED**: hand pinches are synthetic in tests; the bridge is driven by the same DOM classes the NUI sets, so mouse/keyboard E2E exercises the code path, real hand tracking is unproven.
- Ending screen end-to-end with audio in a browser: not run (E2E stops at world level 1).
- Level 2 and 3 world music/gameplay audio in a browser: not run.
- Thresholds that need ears: `HARD_LAND_SPEED` 650, `MIN_LAND_SPEED` 150, `END_STEP_DISTANCE` 27, pen-speed range 1200 px/s, hold-loop rate 0.85-1.6.
