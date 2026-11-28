# INT-3 coverage: world (placement and gameplay), KAPLAY, ending

Evidence class: STATIC_ONLY plus UNIT_ONLY (audio mocked or null). Nothing here was heard or run in a browser, a physical webcam or a real model. Line numbers are as of this working tree (branch `claude-monorepo`, uncommitted).

## Wired events

| event id | trigger (file:line, real action) | throttle / edge logic | decision notes |
|---|---|---|---|
| `world.fall` | `src/game/runtime/integrated-scene.ts:148` constructor, right before the `k.tween` fall starts | once per scene; the returned voice is stopped (60 ms) on destroy and on dev skip of the fall (`onFallComplete` handle) | sceneBound rule. Voice kept only to cut the sound when skipped. |
| `world.land` | `integrated-scene.ts:288` `enterPlace()` (falling -> placing; natural end of tween or dev skip) | guarded by the existing `phase !== "falling"` early return, so once per object | Emitted in the scene (single source) instead of FallFxOverlay, which only reacts one React render later. |
| `place.grab` | `src/features/world/Placement.tsx:171` `useDragRelative.onStart` (after the 12 px threshold) | once per drag; rule cooldown 150 ms | NUI hand or mouse drag: same sound. |
| `place.rotate` | `Placement.tsx:205` `handleRotate`, after the (optional) `game.rotate` accepted; also the 15 degree sub-steps that only turn the visual | rule cooldown 90 ms | Not emitted while dragging or when inactive (early returns). |
| `ui.denied` (rotate) | `Placement.tsx:202` `game.rotate` returned false | rule cooldown 400 ms, maxVoices 1 | |
| `ui.denied` (commit) | `Placement.tsx:251` `commitPlacementAt` returned false (ring "Taruh di sini") | same | |
| `ui.denied` (drag) | `Placement.tsx:148` in `tryMoveRuntime`: the full target was refused by `setPlacement` (the object then slides or stays) | `createRefusalEdge(600)` (`src/game/runtime/gameplay-audio.ts`): first refused move of a streak only, needs a free move in between and 600 ms since the last sound; new edge instance per drag | Dragging along a wall or floor gives one soft cue, not a rattle. Physics and placement rules untouched. |
| `place.set` | `integrated-scene.ts:389` `commitPlacementAt` after acceptance (state mutated, callbacks sent) | rule cooldown 400 ms | Covers the NUI ring commit and the dev-skip commit (skip tries many offsets; only the accepted one sounds). |
| `world.rise` | `src/features/world/WorldScreen.tsx:145` layout effect, transition into `postPlaceMode === "rising"` ("need more / draw another" camera rise) | transition only (effect returns early for other modes). Voice stopped (150 ms) in the cleanup, which on a natural end runs after the sound is over (rise is dur + 250 ms) and on dev skip cuts it | |
| `thinman.jump` | `integrated-scene.ts:437` right after `player.jump(JUMP_FORCE)` | once per real jump call; rule cooldown 120 ms | Jump assist (coyote, buffer) decides, we only observe. |
| `thinman.step` | `src/game/runtime/gameplay-audio.ts:91` `GameplayAudioObserver.step`, called from `integrated-scene.ts:422` each fixed step while live | fires when the bridge's keyframe changes to WALK_0 or WALK_4 (foot contact, two per cycle, about 1.8 per second at WALK_SPEED) while grounded; rule cooldown 110 ms and maxVoices 3 | Reads `characterBridge.getCurrentFrameId()`; no physics access. Silent during LAND/STAND/airborne. |
| `thinman.land` | `gameplay-audio.ts:80`, grounded edge false -> true | needs a real fall: peak downward speed since leaving the ground >= 150 px/s (ignores spawn settle and grounded flicker); `variant` 0 soft, 1 hard when >= 650 px/s (about a 130 px drop; an ordinary jump lands at about 520, so soft) | The bridge's own `landIntensity` stays private; same signal (vertical velocity) used instead. First sample after every reset is a baseline only. |
| `hazard.hit` | `integrated-scene.ts:253` via `outcomeSoundFor("hazard")` inside `reportOutcome` | inside the `settled` and `phase === "gameplay"` guard: once per attempt, after the scene has really reported fail | Contact alone never sounds; only the reported outcome. |
| `fall.abyss` | same, cause "abyss" (`update()`, `y > killY`) | same guard | |
| `goal.reach` | same, cause "goal" (`integratedGoalReached` true) | same guard | |
| `jingle.fail_soft` | `src/features/world/useWorldRuntime.ts:93` inside `onOutcome`, `result === "fail"` | the callback is already guarded by `cancelled`, `forcedRef` and the scene's `settled`: once per failed attempt; a retry that fails again sounds again (it is a new real failure) | Plays at the same instant as `hazard.hit` / `fall.abyss`. If that is muddy, delay the jingle about 250 ms (tuning, not logic). |
| `win.sparkle` + `jingle.level_complete` | `src/features/world/SuccessPanel.tsx:68-69`, in the `wonRef` once-guard effect, when the win panel is shown | once per panel; skipped when `demo` (dev "Lewati" forced win, `runtime.isForced()`) | See "Deliberately silent". |
| `ui.ring_in` | `src/features/world/FailPanel.tsx:80` `gsap.delayedCall(0.35)` inside the panel's entrance context | fires when the panel actually becomes visible (matches its 350 ms entrance delay); the gsap context cancels it if the panel unmounts first, so StrictMode's discarded first run is silent; reduced-motion branch (line 74) emits at once | The three choices are NUI targets: their ring sounds belong to the bridge. Retry adds nothing. |
| music patch (placing) | `WorldScreen.tsx:130` `audio.musicPatch({ gain: 0.8, lowpassHz: 6000, rampS: 1 })` | effect keyed on two booleans (phase placing, or gameplay with a post-place gate showing): runs on change only | Idempotent, no sound emitted. |
| music patch (live) | `WorldScreen.tsx:129` `{ gain: 1, lowpassHz: 20000, rampS: 1 }` when `phase === "gameplay"` and no post-place gate | same | The falling phase is not patched (the intro worker may own the music there). Leaving for the canvas is a scene change, which resets the patch. |
| `ending.chute_open` | `src/features/ending/ParachuteScene.tsx:149` `tl.call(..., 0.85)` (canopy tween starts at 0.85 s) | on the GSAP timeline: only when the playhead really passes; ctx revert kills it | |
| `ending.descend` | `ParachuteScene.tsx:150` `tl.call(..., 0.95)` (descent tween starts at 0.95 s) | same. Voices stopped (150 ms) in the effect cleanup | Cleanup also runs on dev skip of the phase, which cuts the descent sound. |
| `ending.touchdown` | `ParachuteScene.tsx:215` just before `onTouchdown()` (which dispatches `PAYUNG_TOUCHDOWN`) | after the existing `if (cancelled) return` checks; once | A dev skip (`PAYUNG_DONE`) never reaches it. |
| `thinman.step` (ending walker) | `src/features/ending/usePondWalkerLoop.ts:215` in the walker tick | `DistanceStepper(27)`: one step per 27 source units of real travel while `on` (about 2.3 steps/s manual walk, 5.5/s auto-walk to the talk spot); nothing while held, diving or standing | 27 = stride 142 px / 2.6 velocity scale / 2. Rule cooldown protects the fast auto-walk. |
| `thinman.poke` | `src/features/ending/EndingScreen.tsx:103` `handleThinmanPoke`, after the existing 900 ms lock check | the lock itself (`pokeTimerRef`) plus rule cooldown 900 ms | |
| `pond.jump` / `pond.splash` / `pond.sink` / `pond.glint` / `pond.exit` | `src/features/ending/pond-timeline.ts:197 / 201 / 214 / 219 / 236` inside `runPondDiveSequence`, at the start of each stage (jump arc, ink spawn, hero fade-sink, beam and glints, exit arc) | each stage once, behind the dive's own `cancelled` checks. `cancel()` stops the live voices (120 ms) unless the dive already ran to its natural end | Dev skip during the dive cancels the sequence and cuts its sounds. |
| `momo.wave` | `src/features/ending/PondScene.tsx:149` right before `rig.wave()` (after the front turn) | inside the `active` guard of the turning sub-phase; rule cooldown 500 ms | Thinman waves at the student; the sound is the Momo-side paper/air one (no voice). |
| `recap.land` | `src/features/ending/RecapChat.tsx:132` (card fly tween complete) and `:139` (no layout rect: card revealed without a fly) | guarded by `cancelled`; `rate: recapLandRate(i)` = `PENTATONIC_RATES[i % 5]`; rule cooldown 120 ms | Cards come every 430 ms, so the cooldown never swallows one. Dev skip cancels the flying sub-phase. |
| `jingle.ending_close` | `EndingScreen.tsx:132` in `handleRecapConfirmed` (real "Lanjut" ring on the recap, immediately before `REKAP_CONFIRMED`) | `closeJingleRef` makes it once per mount | See the note below. |

### KAPLAY audio neutralised (not an event)

- `src/game/runtime/engine.ts` `silenceKaplayAudio(k)`, called from `src/game/kaplay-runtime.ts:37` right after `kaplay()` returns. `k.audioCtx` exists in the installed types (`kaplay@3001.0.0`, `types.d.ts:2480`).
- Deviation from the brief, on purpose: the close is deferred 1500 ms (`KAPLAY_AUDIO_CLOSE_DELAY_MS`). KAPLAY starts `decodeAudioData` for its built-in burp in its constructor; closing synchronously would reject it and print `console.error("Failed to load burp")`, which Playwright flows that watch the console would count. The delayed close is idempotent (`state === "closed"` check), wrapped in try/catch, swallows a rejected `close()`, and is never repeated by `releaseEngine` / destroy.
- Also `backgroundAudio: true` in the `kaplay()` options. Without it KAPLAY's hide/show handlers (`initEvents.ts`) call `audio.ctx.suspend()/resume()` on the closed context, which rejects as an unhandled promise (a Playwright `pageerror`). With it those handlers do not touch audio. `k.play`, `loadSound`, `volume`, `burp` are never called anywhere in the app (grep-verified for `src/game` and `src/features`).
- Legacy (non-integrated) scene goes through the same `createKaplayGame`, so it is covered too; it has no sounds of its own.

## Deliberately silent

- Dev skip results: forced win (`forceSuccess`) gets no `win.sparkle` / `jingle.level_complete` (a demo result is not the student's, and the jingle ducks music for 3.6 s). Forced skips of fall, rise, dive, descent and recap also cut or never start their long sounds (see the rows above). Short sounds (`place.set`, `world.land`) still play when a skip causes the matching visual.
- Dev skip into the final ending phase (`RESET` to `akhir`) does not play `jingle.ending_close`; only the real recap confirmation does.
- Momo: no voice sounds anywhere in these files. The only Momo-side sound is `momo.wave`.
- `FailPanel` choices (retry, place, draw), `PostPlaceGate` rings, `SuccessPanel` "Lanjut" ring, `UnderstandRing`, `BackToCoverRing`: NUI targets, sounded by the NUI audio bridge. Retry adds nothing. No `nui.*` id is emitted here.
- No hover, no pointer-move, no per-frame sounds. The goal pulse, Thinman idle blink/sway, `Placement` box scale, shadow and dust FX are decorative: silent.
- Not wired: `Placement` `selectCreation` (re-pick), `FallFxOverlay` (its landing is sounded by the scene's `world.land`), `GameplayHud` buttons (exit, reposition, redraw: plain buttons, no new id), Momo bubble appearances in the world screen (`R83Bubble` owns `bubble.show`).
- The walk-frame observer never runs while `settled`, while placing, or while falling.

## Notes on judgement calls

- `jingle.ending_close`: the brief says "finishing lines done / confirm path ... ONCE when the final phase begins". Taken as: the moment the final phase begins by the real recap confirmation (the jingle is sceneBound, so playing it on the "Kembali ke sampul" confirm would be cut by the scene change; and its 5.5 s duck then runs under the finishing lines). If the orchestrator prefers it at "lines done", move the one `audio.emit` to the `AKHIR_NEXT_LINE` -> `waiting-back` edge.
- `place.rotate` also fires for 15 degree wheel/keyboard sub-steps: they visibly turn the box, and the 90 ms rule cooldown limits it.
- A first refused drag move is `ui.denied`. If playtests find it too frequent at wall contact, raise `DRAG_DENIED_MIN_GAP_MS` in `Placement.tsx` (currently 600).

## Tests (UNIT_ONLY)

- `tests/game/gameplay-audio.test.ts` (13): landing soft/hard/ignored/reset, footstep edges, `DistanceStepper`, `createRefusalEdge`, outcome mapping, `silenceKaplayAudio` (idempotent, deferred, never throws).
- `tests/features/world/world-audio.test.tsx` (4): win once and silent demo, `ui.ring_in` after the entrance delay, rotate vs denied, grab and a single denied per refused streak.
- `tests/features/ending/ending-audio.test.tsx` (5): pentatonic rates per card, closing jingle once on confirm and not on a restart, no parachute sound before the timeline.

## Gaps / EVENT REQUESTS

- No new event ids needed.
- Not covered by any test: `integrated-scene.ts` emits (`world.fall`, `world.land`, `place.set`, `thinman.jump`, outcome sounds) and the ParachuteScene / pond-timeline timeline calls under real GSAP timing. They are static-verified only; the orchestrator's browser E2E should check `window.__audioDiag` event logs for: one `world.fall` then one `world.land` per object, one `place.set` per commit, `thinman.jump` per jump, exactly one of `hazard.hit` / `fall.abyss` / `goal.reach` per attempt.
- Thresholds that need ears (not logic): `HARD_LAND_SPEED` (650), `MIN_LAND_SPEED` (150), `END_STEP_DISTANCE` (27), whether `jingle.fail_soft` should trail `hazard.hit` by about 250 ms.
- `src/components/game/GameStage.tsx` (legacy, non-r8.3 stage UI) is outside this area and has no audio.
