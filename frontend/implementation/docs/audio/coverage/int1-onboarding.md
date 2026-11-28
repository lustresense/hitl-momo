# Audio coverage: INT-1 onboarding (DreamLoader, cover, tutorial, level select, Momo, bubble)

Evidence class: `STATIC_ONLY` + `UNIT_ONLY` (`tests/audio/int1-onboarding.test.tsx`, `@/src/audio` mocked). Nothing was heard or run in a browser. Line numbers are for the working tree of branch `claude-monorepo` when this was written.

Paths are relative to `frontend/implementation/`.

## Wired events

| event id | trigger (file:line + real action) | throttle / edge logic | decision notes |
|---|---|---|---|
| `bubble.show` | `src/features/shared/R83Bubble.tsx:170`, the `first` branch of the entrance effect (hidden -> visible) | `first = !wasVisibleRef.current`; text swaps take the `else` branch and stay silent; rule cooldown 450 ms covers the dev StrictMode re-run | Applies to every screen that uses R83Bubble. Tested (false->true once, text swaps silent, hide + show again = second). |
| `momo.flap` | `src/components/momo/momo-engine.ts:337` `flap()` | Discrete one-shot (4-beat timeline = one action); callers only trigger via `flapKey` change; rule cooldown 160 ms | Single point for every screen that flaps Momo (cover intro, wake, curl, name exit...), so cover call sites do not emit it again. |
| `momo.wave` | `momo-engine.ts:302` `wave()` | Discrete; `waveKey` change only; cooldown 500 ms | Covers "Senang + wave" in the cover wake timeline (`cover-phase-timelines.ts:151`) and GlobalCamera's wake wave. |
| `sys.ready` | `src/components/onboarding/DreamLoader.tsx:555` `onModelStatus` kind `ready` | Local `soundedReady` per effect run (warm-up may notify twice); cooldown 1500 ms | Only when the model status really says `ready`. Mouse fallback is not "ready": silent. |
| `sys.hiccup` | `DreamLoader.tsx:550` kind `failed` | `soundedFailed` edge, reset when a non-failed status arrives (so a retry that fails again sounds again) | Neutral, no blame. |
| `ui.tap` | `DreamLoader.tsx:668` valid nickname submit (after empty / double-submit guards) | Guards before it; cooldown 60 ms | This is likely the first audio-unlocking gesture; unlock is the global listener's job. Emitted at submit, not at server success (it is a tap, not a success sound). |
| `momo.whoosh` | `DreamLoader.tsx:628` intro tween `introV` (Momo rises into view), `onStart` | `onStart` fires once; a StrictMode first run is killed before it starts | Not tied to the percent progress or per-frame updates. |
| `dream.blast` | `DreamLoader.tsx:462` `triggerBlastAndMorph` after its phase guard | Guard `phase === blast/morph/done` returns first = once per load | Skip button / Escape / mouse fallback never call it: silent. |
| `dream.iris` | `DreamLoader.tsx:422` `startDreamMorph`, when the iris tween is created | `morphStartedRef` guard = once per load | Only emitted if the sky element exists (the iris really plays). |
| `ui.toggle_on` / `ui.toggle_off` | `src/features/cover/CameraConsentGate.tsx:80` consent checkbox `onChange` | Real user change only (checkbox is disabled after confirm); cooldown 80 ms | Checked -> on, unchecked -> off. |
| `ui.tap` | `CameraConsentGate.tsx:107` "Lanjut" (gate-go) and `:121` camera-fallback button | Gate-go is disabled unless the box is checked, so a click is a real confirm | Both are DOM chrome buttons (not rings). |
| `ui.tap` | `src/features/cover/name/NameStep.tsx:139` valid typed name submit (button or Enter) | Empty input returns before the emit | Extra beyond the brief, same reasoning as the DreamLoader nickname submit. Ring-based start/confirm stay with the NUI bridge. |
| `ui.denied` | `src/features/cover/useCoverCamera.ts:127` toggle pressed while `gateState < 2` (the `CAMERA_TOGGLE_LOCKED` dispatch) | Real click only; cooldown 400 ms | Soft refusal; the card shake and mumble are unchanged. |
| `momo.startle` | `src/features/cover/useCoverTimeline.ts:182` start of a camera request launch (card flies up) | Edge: `requestLaunchAtRef === null` -> set (same ref the code already uses); StrictMode second run sees non-null | The camera live/denied sounds belong to the shell director: not sounded here. |
| `momo.startle` | `useCoverTimeline.ts:198` wake phase with no earlier request launch (denied -> continue without camera, dev skip) | `wakeStartledRef`, reset when phase leaves `wake`; cooldown 800 ms | The wake timeline plays the same card launch + "Kaget" itself in that case. |
| `ui.morph` | `src/features/cover/cover-phase-timelines.ts:132` `morph` label of the wake timeline (card -> PIP) | GSAP timeline callback at the label; the offset `seek` (<= 2.5 s) cannot reach it (label is later) | |
| `ui.ring_in` | `useCoverTimeline.ts:227` `ayo` phase, when the confirm host is animated in | `ayoRingSoundedRef`, reset when phase leaves `ayo` (effect re-runs on `skipNameStep` change do not repeat) | Ring fire is NUI bridge. |
| `momo.hop` | `useCoverTimeline.ts:300` each greeting hop tween (`hopProxy`), `onStart` | One per real hop tween (lines 0, 1, 3); cooldown 140 ms | Tiny 16-28 px hops; they coincide with `momo.flap` on those lines. |
| `momo.whoosh` | `cover-phase-timelines.ts:218` Momo curve exit in `book-curl`, `onStart` of the exit tween | Once per timeline | Reduced path returns before the timeline: silent. |
| `page.curl` | `cover-phase-timelines.ts:236` the 1.97 s call that starts the curl tween | Once per timeline; reduced / dev skip (phase changes -> timeline reverted) never gets here | Ducking is in the rule. |
| `momo.whoosh` | `cover-phase-timelines.ts:260` Momo re-entry tween, `onStart` | Once per timeline | Second whoosh of the curl; `sceneBound`, cooldown 300 ms. |
| `card.deal` | `src/features/tutorial/useTutorialTimeline.ts:182` `deal()` | `dealt` guard (also covers skip-then-timer) | Deal after a dev skip of the greeting plays at normal speed, so it sounds. |
| `card.flip` | `src/features/tutorial/tutorial-animations.ts:112` open timeline t=0 | Timeline callback, follows the real tween | Used by deal-open and by next-card open. |
| `card.bifold` | `tutorial-animations.ts:112` open timeline at `bifoldAt` (0.88 s) | Same | |
| `card.close` | `tutorial-animations.ts:186` close timeline t=0 (fold shut) | Same | Also sounds for card 3 inside the exit timeline (same visual). |
| `card.stamp` | `tutorial-animations.ts:194` close timeline at `flipAt + 0.25` (green done stamp scale-in) | Same; `forceOpenCardDom` sets earlier stamps without animation = silent | |
| `card.exit` | `tutorial-animations.ts:209` exit timeline at `close.duration + pause*0.4` (cards fly off) | Same | |
| `thinman.jump` | `src/features/tutorial/CardWalk.tsx:120` `hop()` after its grounded / not-done guards | Guards = real take-off; cooldown 120 ms | Tap, flick and ArrowUp all go through `hop`. |
| `thinman.step` | `CardWalk.tsx:97` in `setPosition`, only while `physRef.on` (grounded) | `advanceFootsteps` (`walk-steps.ts`): one per `STEP_STRIDE_PX` = 28 px of real travel, at most one per move, scene width cached via ResizeObserver (no layout read per frame); rule cooldown 110 ms | Joystick, arrow keys and drag all count. Airborne travel is not counted. Unit tested. |
| `goal.reach` | `CardWalk.tsx:63` `finishWalk` after the `doneRef` guard | `doneRef` guard | The tut-win check pop has no extra sound. |
| `tool.tick` | `src/features/tutorial/CardCanvasTools.tsx:76` a tool newly in `usedTools` (the check badge pop) | `tickedToolsRef` set: once per tool per mount | |
| `tool.pencil` / `tool.eraser` / `tool.undo` / `tool.redo` / `tool.clear` | `CardCanvasTools.tsx:96` `onToolAction` passed to its own `CanvasController` (same map `CANVAS_TOOL_SOUND` as the game canvas) | Controller fires it only when the tool really changed (switch, or undo/redo/clear altered the paper) | Added on orchestrator request. |
| `draw.pencil` / `draw.eraser` (loops) | `CardCanvasTools.tsx:97` `onInk` -> `DrawSoundDriver` (same as `useCanvasBridge`) | Driver rules: valid stroke only, stopped on end / tool switch / dispose | No behaviour change; read-only observer. |
| `ribbon.drop` | `src/features/level-select/useRibbonAnimations.ts:77` shelf drop-in tween, `onStart` | Local `dropSounded`; dep changes / StrictMode revert the tween before it starts; resize does not re-run this effect | |
| `ribbon.notch` | `useRibbonShelf.ts:147` `applyPullMove`, `notchIncreased` on an unlocked ribbon | Controller computes the increase from the previous notch; `rate = notchRate(notch)` -> `PENTATONIC_RATES[min(notch-1,3)]` (`ribbon-audio.ts`); cooldown 60 ms | Locked ribbons have notch 0: no tick for a refused pull. Unit tested. |
| `ribbon.armed` | `useRibbonShelf.ts:148` `armedChanged && armed` | Edge from the controller | Un-arming (pulling back) is silent. |
| `ribbon.launch` | `useRibbonAnimations.ts:134` start of `launchRibbon` | Controller `launching` flag makes the launch single | Covers both a released armed pull (`applyPullRelease` launch) and the tap / Enter auto-pull path, which also ends in `launchRibbon`. |
| `ribbon.rebound` | `useRibbonShelf.ts:165` `applyPullRelease` for `rebound` / `rebound-locked` | `shouldSoundRebound`: unlocked only when the ribbon was visibly stretched (> `CLICK_SUPPRESS_PX`), locked only when `tugged`; unit tested | A plain tap (zero-pull "rebound" before its click) stays silent. |
| `ui.denied` | `useRibbonShelf.ts:131` `flashLocked` (tap / Enter / digit key on a locked ribbon, or a tugged locked release) | Cooldown 400 ms | A tugged locked release plays `ribbon.rebound` and `ui.denied` together, as requested. |
| `ribbon.unlock` | `useRibbonAnimations.ts:91` fresh-unlock reveal effect | `unlockSoundedRef === freshStage` guard: the effect re-runs on resize / StrictMode without repeating; `freshStage` non-null only when `consumeFreshUnlock()` (or the prop) really supplied a stage; emitted only after the refs exist and `revealed` | |

Count: 38 distinct event ids (`bubble.show`, `momo.flap`, `momo.wave`, `sys.ready`, `sys.hiccup`, `ui.tap`, `momo.whoosh`, `dream.blast`, `dream.iris`, `ui.toggle_on`, `ui.toggle_off`, `ui.denied`, `momo.startle`, `ui.morph`, `ui.ring_in`, `momo.hop`, `page.curl`, `card.deal`, `card.flip`, `card.bifold`, `card.close`, `card.stamp`, `card.exit`, `thinman.jump`, `thinman.step`, `goal.reach`, `tool.tick`, `tool.pencil`, `tool.eraser`, `tool.undo`, `tool.redo`, `tool.clear`, `ribbon.drop`, `ribbon.notch`, `ribbon.armed`, `ribbon.launch`, `ribbon.rebound`, `ribbon.unlock`) plus the `draw.*` loops, about 45 call sites.

## Dev skip handling

- Tutorial "Lewati" fast-forwards a running timeline with `progress(1)`, which fires every timeline callback in one tick (verified in the unit test). `flushMotion` now wraps that call in `withSilentAudio`, so no card sound fires; the timelines built right after (close, open of the next card) play at normal speed and sound normally.
- Cover skip changes the phase, which reverts the running GSAP context before the later sounds; the skip bar also calls `audio.interrupt()`.
- DreamLoader skip / Escape call `onReady` directly and never touch the blast / iris code.

## Deliberately silent

- Momo yawn, sleep, "zzz", mood changes, `point()`, idle float: no voice (rule 1). `MomoStage.tsx` is unchanged (flap / wave already go through the engine).
- Camera status (requesting / live / denied): the shell director sounds it. Cover only sounds the visuals (startle, morph).
- Ring fire, hold, lit: NUI bridge. `AyoRing`, `NameConfirm` rings, `TutorialThumbRing` (including the thumb-unlock pop) add nothing.
- Hover / lit ribbon, arrow-key focus of a ribbon, ribbon drag moves other than notch / armed edges.
- `CardSafeDanger` hop / ouch loops, wobble loops, hand-sweep hint, Momo idle.
- Percent progress of DreamLoader, per-frame flight updates, Momo flights between anchors (`moveTo`) in tutorial / level select.
- Dream loader skip button, Escape, mouse fallback.
- Cover `#bubble`, gate mumble and book-inside bubble are not `R83Bubble`: no `bubble.show` (see gaps).

## Gaps / EVENT REQUESTS

- No new event ids needed.
- Optional, not wired (not in the brief): `bubble.show` for the cover's own `#bubble` (intro phase fade-in) and the book inside bubble; `momo.whoosh` for Momo's flight back in the wake timeline (`cover-phase-timelines.ts` "return" label); `ui.tap` for `name-typelink`; notch / armed feedback during the tap-triggered auto-pull of a ribbon (only `ribbon.launch` sounds after the 0.42 s auto-pull). Say if you want any of these.
- `momo.hop` hops are 16-28 px and coincide with a flap on most intro lines; if it sounds cluttered, drop the `onStart` in `useCoverTimeline.ts` (one line).
- Not verified: real playback, timing against the animation, dev StrictMode double effects in a browser, unlock timing of the very first tap (the first emitted sound may be dropped if unlock is still pending).
