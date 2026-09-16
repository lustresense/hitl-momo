# REPORT.md — Task t_0b42407a

**Task ID:** `t_0b42407a`  
**Card:** `[BUGFIX] DrawingScreen: camera selection broken & pointer input not responding`  
**Worker:** AGY (Antigravity, Claude Sonnet 4.6 Thinking)  
**Date:** 2026-08-27T11:20–11:30 WIB  

---

## Objective

Fix two critical regressions in `DrawingScreen`:
1. Camera device selection missing/broken — user cannot pick a camera.
2. Pointer/touch input does not draw — clicks/drags produce no stroke.

Preserve all gesture UX features from `t_ca135a7f`.

---

## Result

**Both issues resolved.** All verification checks pass.

---

## Root Causes Identified

### Issue 1: Camera selection (Feature gap, not regression)

`DrawingScreen.tsx` never had a camera selector. `mediapipe-input.ts` hardcoded `facingMode: "user"` with no `deviceId` support. The gesture UX upgrade (`t_ca135a7f`) also did not implement this feature.

### Issue 2: Pointer input broken (Genuine regression / latent bug)

**File:** `src/input/index.ts`, `DrawingSurface.setMode("hand")`

```ts
// BROKEN — calls detach function but NEVER nulls the reference:
this.detachPointer?.();

// The guard in attachPointer() then always fires:
private attachPointer(): void {
  if (this.detachPointer) return;  // BLOCKED — stale ref
  ...
}
```

After `setMode("hand")` is called even once, `this.detachPointer` retains the stale reference, causing `attachPointer()` to be a permanent no-op. This broke:
- Fallback to pointer when hand fails
- Switching back to pointer after successful hand mode

---

## Changed Files

| File | Change |
|------|--------|
| `src/input/index.ts` | **BUGFIX:** null `detachPointer` after calling it. Added `enumerateVideoDevices()` export. Added `deviceId?` to `setMode()`. Changed field/dispose to use `undefined`. |
| `src/input/mediapipe-input.ts` | Added `deviceId?: string` to `HandDriverOptions`. Use `{ deviceId: { exact } }` in `getUserMedia` when provided. |
| `src/components/drawing/DrawingScreen.tsx` | Added camera device state, `enumerateVideoDevices` import, `handleDeviceChange` callback, camera `<select>` UI (visible when hand mode + devices available). |

---

## Validation

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npm run typecheck` | ✅ Exit 0, 0 errors |
| Unit tests | `npm run test` | ✅ 76/76 PASS (10 test files) |
| Build | `npm run build` | ✅ Exit 0, compiled successfully |
| Gesture features | Code review + existing 17 gesture tests | ✅ Untouched, all pass |

---

## Unresolved Issues / Blockers

1. **Manual QA with physical camera required:** Cannot verify camera switching end-to-end without a real webcam. The selector logic is verified by code review only.
2. **Camera label availability:** Browser security policy returns empty `d.label` strings before first `getUserMedia` permission. Handled with `Kamera N` fallback, but the selector won't show meaningful names until after permission is granted (labels appear after first camera start, which auto-populates on mode switch).
3. **No automated test for camera selector UI:** Writing a JSDOM test for `getUserMedia`/`enumerateDevices` would require additional mock infrastructure. Deferred — the selector is low-complexity conditional rendering.

---

## Evidence Paths

| Artifact | Path |
|----------|------|
| Worker log | `.ops/results/t_0b42407a/WORKER_LOG.md` |
| Worker changelog | `.ops/results/t_0b42407a/WORKER_CHANGELOG.md` |
| This report | `.ops/results/t_0b42407a/REPORT.md` |
| Fixed index.ts | `src/input/index.ts` |
| Fixed mediapipe-input.ts | `src/input/mediapipe-input.ts` |
| Fixed DrawingScreen.tsx | `src/components/drawing/DrawingScreen.tsx` |
