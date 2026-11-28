# Audio coverage INT-2: world intro + canvas + HITL + sticker

Evidence class: `STATIC_ONLY` + `UNIT_ONLY` (audio API mocked; nothing was heard, no browser, no webcam). Files: `src/features/world/useIntroTimeline.ts`, `src/features/canvas/**`. `WorldIntroOverlay.tsx` and `src/app/state-machine.ts` were not changed (the hook and `CanvasScreen` already see everything needed).

## Hooked events

| event id | trigger (file:line, real action) | throttle / edge logic | decision notes |
|---|---|---|---|
| `jingle.level_intro` | `useIntroTimeline.ts:220`, after the 780 ms book-open pause of the intro run | once per stage (`jinglePlayedRef`); emitted after the `cancelled` check, so the StrictMode first (cancelled) run never gets there | not emitted if dev skip is pressed before the pause ends (no story plays) |
| `momo.whoosh` (fly-in) | `useIntroTimeline.ts:231`, Momo starts the fly-in path to the first spotlight | once per run; guarded by `cancelled` / `risingRef`; rule cooldown 300 ms | wing/air only, Momo has no voice |
| `intro.spotlight` | `useIntroTimeline.ts:247`, spotlight tween to a new focus (beat index > 0 AND focus changed) | one per real tween; `ahead -> ahead` beats have no tween so no sound | beat 0 only seeds the spot (no tween): silent |
| `world.rise` + `momo.whoosh` | `useIntroTimeline.ts:141-142`, `startRise(1)` (ring "Aku mengerti" fired, camera rise 2.1 s) | `risingRef` guard already makes `startRise` single-shot; only when `speed === 1` | dev skip (`startRise(7)`) stays silent; the NUI ring sound itself is the bridge's |
| `tool.pencil` / `tool.eraser` | `canvas-controller.ts:114` via `onToolAction`, wired in `useCanvasBridge.ts:87` | only when `activeTool` really changed (`selectTool` early-returns for same tool) | one path for toolbar button, NUI ring and `surface.setErasing` |
| `tool.undo` / `tool.redo` / `tool.clear` | `canvas-controller.ts:123`, only inside `if (changed)` | nothing to undo/redo/clear = silent; keys Z / X go through the same `selectTool`, so no double path | the tutorial card's own controller does not pass `onToolAction` (silent there, tutorial area is not mine) |
| `mission.open` | `MissionBulb.tsx:72`, prop `open` false -> true | edge via `prevOpenRef`; closing silent; mounting already-open silent | covers button click, NUI ring and any other opener |
| `ui.ring_in` | `GuessRing.tsx:92`, `visible` false -> true ("Tebak Gambarku" ring pops after 1000 ms idle) | edge via `wasVisibleRef`; hides on a new stroke and re-pops later = one per appearance | |
| `ui.denied` | `CanvasScreen.tsx:218`, right after `onSubmit()` when `controller.phase` is still `drawing` and `controller.feedback === "empty-drawing"` | `FlowController.submitDrawing` sets the feedback synchronously before its first `await`; rule cooldown 400 ms covers the click + NUI double path | relies on that synchronous refusal (a unit test pins it) |
| `draw.pencil` (loop) | `draw-sound.ts` `DrawSoundDriver`, started from `canvas-controller.ts:159-170` observer, wired `useCanvasBridge.ts:83-88` | starts only after >= 3 effective points AND >= 10 px travel; `update({gain,rate,rampMs:70})` at most every 50 ms (<= 20/s) from smoothed pen speed: gain 0.25..1, rate 0.9..1.2 (full at 1200 px/s); `stop(120)` on stroke end, tool switch, tracking loss (`inFrame` false), ink disabled (mission panel / phase change), surface clear, demo sample, dispose/unmount; safety stop 250 ms after the last sample, and the stroke must re-qualify (3 points, 10 px) to sound again | never on a bare pen-down; never when the pen-down was outside the paper or on chrome (controller never begins); never while ink is disabled (the controller drops the sample) |
| `draw.eraser` (loop) | same driver, eraser branch | counts only samples where `store.eraseAt` really removed something (`effective`); erasing nothing is silent and gives no keep-alive | a valid erase, not just a moving eraser |
| `hitl.submit` | `CanvasScreen.tsx:138`, phase prop edge `drawing -> predicting` | `prevPhaseRef`; no emit on mount; re-render / second notify = same phase = nothing | also fires for the dev skip submit (short) |
| `hitl.reveal` | `CanvasScreen.tsx:139`, edge `predicting -> evaluating`, no `stamp` | same for every confidence and tone | a screen mounted straight in `evaluating` (or the sticker's derived `evaluating`) never reveals |
| `sys.hiccup` | `CanvasScreen.tsx:140`, edge `predicting -> prediction-error` | edge only; retry (`error -> predicting`) is not a new submit | neutral, no blame |
| `hitl.decide` | `CanvasScreen.tsx:56` (`decideWithSound`), after `decideAccept` / `decideCorrect(rank)` / `decideOverride(label)` returned without throwing | identical id, no params, for all three and for keys 1/2/3 (same handlers); phase guard refuses a second call, so one per decision | refused / invalid override: silent. Dev skip auto-accept calls the controller directly: silent |
| `hitl.more` | `CanvasScreen.tsx:271`, sub-mode really changes (`top3 <-> other`) | `next !== guessSubMode` | brief asked for "Bukan ini, pilih lainnya"; I also play it for "Kembali" (same page-flick, mirror action). Easy to drop if unwanted |
| `hitl.redraw` | `CanvasScreen.tsx:212`, `handleRedraw` after `requestRedraw` / `redrawFromError` succeeded | button, NUI ring and Esc share the handler; `GuessPanel.commit` + phase guard stop doubles | refused redraw: silent |
| `ui.tap` | `CanvasScreen.tsx:279`, retry prediction | only when `controller.phase === "prediction-error"`; retry flips the phase synchronously so a second call is silent | |
| `sticker.pop` | `StickerStage.tsx:140`, entrance of the sticker | once per stage instance (`poppedRef`, StrictMode-safe); wobble loop silent | the stage is keyed per attempt |
| `sticker.throw` | `StickerStage.tsx:112`, `triggerThrow` (flick, ring or fallback button) | `committedRef` makes it once | the consequence sound; the ring commit sound is the bridge's. Dev skip calls `stamp.onThrow` directly: silent |
| `sticker.shrink` | `StickerStage.tsx:119`, `triggerRedraw` (ring, button or key G) | `committedRef`: once | |

## Observer added (no behaviour change)

`CanvasControllerOptions` got two optional read-only callbacks (`canvas-render.ts:48-50`): `onToolAction(tool)` and `onInk(event)`. They are called from `selectTool`, `feedSample`, `finishActiveInteraction`, `clearSurface` and `dispose` after the existing logic ran; no return value is read, and the NUI sample path is unchanged. Only `useCanvasBridge` passes them, so the tutorial card 3 controller stays silent from this area. All drawing logic (thresholds, timing) lives in the new pure module `draw-sound.ts` with an injectable sink and clock.

## Deliberately silent

- Momo speech bubble: bubble sound belongs to the shared bubble component (`bubble.show`), not wired here. Momo yawn / idle / mood changes: silent (no voice).
- Sticker wobble loop, GuessPanel skeleton pulse, any GSAP decorative tween.
- Mission panel closing, canvas pencil -> pencil, undo/redo/clear with nothing to change, key Z/X at the ends of history.
- Sub-mode reset by phase change (effect, not an action), GuessPanel rows appearing, hover/lit rows (NUI bridge handles `nui.lit`).
- Ring fire / hold sounds (`nui.*`), the "Aku mengerti" ring, the toolbar ring: the NUI bridge's.
- Dev skip: world rise at 7x (no `world.rise` / `whoosh`), sticker throw, auto-accept: silent (the shell plays `ui.skip`).
- Override with an invalid label (controller throws `DecisionError`): silent, no decision happened.
- Prediction start inside `predicting` (provider latency): no sound besides `hitl.submit`.

## Gaps / EVENT REQUESTS

- None required: every need mapped onto an existing id.
- Possible future: a distinct soft id for "Kembali" (currently `hitl.more`), and a `draw.*` start only when a stroke is committed to ink (current rule: valid stroke is 3 points + 10 px).
- The intro jingle waits 780 ms (scene-enter delay + book-open pause) after mount. If the director wants it exactly at overlay mount, move the emit above the first `await sleep` (still guarded by `jinglePlayedRef`).
- `characterDisplayName` changing mid-intro re-runs the effect (existing behaviour): the jingle is guarded by stage, the fly-in whoosh / spotlight would replay once (rule cooldowns apply).
- Not verified: real hearing, real-webcam pen speed range (1200 px/s saturation is an estimate), browser E2E, StrictMode in `next dev` (unit test uses `<StrictMode>` in jsdom only).

## Tests (UNIT_ONLY)

- `tests/features/canvas/draw-sound.test.ts`: speed mapping, thresholds, throttle, safety stop, eraser effectiveness, dispose, and controller observer events / tool actions.
- `tests/features/canvas/canvas-audio.test.tsx`: phase edges, decide x3 + keys + double press, more / redraw / retry, mission edge, sticker pop / shrink / throw, ring pop, empty denial, tool changes + Z/X, drawing loop start/stop, mission panel gating.
- `tests/features/world/world-intro-audio.test.tsx`: jingle once, whoosh, spotlight count, StrictMode, real rise vs dev skip.
