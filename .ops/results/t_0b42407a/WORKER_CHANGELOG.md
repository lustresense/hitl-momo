# WORKER_CHANGELOG.md — Task t_0b42407a

**Task ID:** `t_0b42407a`  
**Card:** `[BUGFIX] DrawingScreen: camera selection broken & pointer input not responding`  
**Worker:** AGY (Antigravity)  
**Date:** 2026-08-27  

---

## Files Modified

### `src/input/index.ts`

**Action:** Modified  
**Summary of changes:**

1. **`enumerateVideoDevices()` (new export):** Async function that calls `navigator.mediaDevices.enumerateDevices()` and filters for `videoinput` kind. Returns `[]` safely if API unavailable. Used by `DrawingScreen` to populate the camera selector after permission is granted.

2. **Field type change:** `private detachPointer: (() => void) | null` → `private detachPointer: (() => void) | undefined`. Aligns with the null-check guard in `attachPointer()` and avoids null/undefined confusion.

3. **`setMode("hand")` bugfix (critical):** The original code did `this.detachPointer?.()` which called the detach function but left `this.detachPointer` pointing to the stale reference. The `attachPointer()` guard `if (this.detachPointer) return` then falsely blocked every subsequent pointer re-attachment attempt. Fixed:
   ```ts
   // BEFORE (broken):
   this.detachPointer?.();
   
   // AFTER (fixed):
   if (this.detachPointer) {
     this.detachPointer();
     this.detachPointer = undefined;
   }
   ```

4. **`setMode` signature:** Added optional `deviceId?: string` parameter, forwarded to `HandDrawingDriver` constructor options.

5. **Catch block simplified:** Removed the redundant `this.attachPointer()` call in the catch block. The `stopHand()` call that precedes it already calls `attachPointer()` — and now correctly works (because `detachPointer` was nulled in step 3).

6. **`dispose()`:** Changed `this.detachPointer = null` → `this.detachPointer = undefined` (type consistency).

**Behavioral change:** Pointer input is now correctly re-attached in all code paths after hand mode is used or fails:
- Hand fails → fallback to pointer ✓
- Hand succeeds → user switches back to pointer ✓
- Constructor with initial pointer mode ✓ (unchanged behavior)

---

### `src/input/mediapipe-input.ts`

**Action:** Modified  
**Summary of changes:**

1. **`HandDriverOptions.deviceId?: string` (new field):** Optional camera device ID. When provided, `getUserMedia` uses `{ deviceId: { exact: deviceId } }` constraint; otherwise falls back to `{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }`.

**Behavioral change:** Camera device selection is now possible without changing any other pipeline logic.

---

### `src/components/drawing/DrawingScreen.tsx`

**Action:** Modified  
**Summary of changes:**

1. **New imports:** `useCallback` from React; `enumerateVideoDevices` from `@/src/input`.

2. **New state:** `videoDevices: MediaDeviceInfo[]` (empty until permission granted), `selectedDeviceId: string`.

3. **`onStatusChange` updated:** Calls `enumerateVideoDevices()` when status is `"ready"` or `"initializing"`. At these points the browser has granted camera permission, so device labels are populated. Updates `videoDevices` state if any devices found.

4. **`switchMode` refactored:** Converted from async function to `useCallback` with `deviceId?: string` parameter. After switching to hand mode, also re-enumerates devices to ensure selector is populated.

5. **`handleDeviceChange` callback (new):** Sets `selectedDeviceId` state and calls `switchMode("hand", newDeviceId)` to restart the hand driver with the chosen camera.

6. **Camera selector UI (new):** Conditional `<div className="subpanel">` rendered when `mode === "hand" && videoDevices.length > 0`:
   - `<label htmlFor="camera-select">` — accessible label
   - `<select id="camera-select" aria-label="Pilih perangkat kamera">`:
     - Default option: `— Kamera default —` (value `""`)
     - One `<option>` per device: uses `d.label` (or fallback `Kamera N` if label unavailable)
   - `onChange` → `handleDeviceChange`

---

## Files Created

| File | Action | Rationale |
|------|--------|-----------|
| `.ops/results/t_0b42407a/WORKER_LOG.md` | Created | Chronological evidence log |
| `.ops/results/t_0b42407a/WORKER_CHANGELOG.md` | Created | This file |
| `.ops/results/t_0b42407a/REPORT.md` | Created | Final handoff report |

---

## Behavioral Invariants Preserved

1. **Pointer fallback preserved:** Any camera/permission failure still gracefully degrades to pointer mode.
2. **Gesture UX preserved:** All gesture features (cursor preview, hysteresis, V-sign undo, 1€ Filter) are untouched in `hand-gesture.ts`, `smoothing.ts`, and the render path.
3. **Test hook integrity:** `feedHandLandmarksForTest` and `pushTestCursor` are unchanged.
4. **E2E compatibility:** No breaking API changes; `DrawingSurface` public interface is backward compatible.

## Limitations

- Camera selector labels are empty until after the first `getUserMedia` permission grant. This is a browser security restriction (MediaDevices API). The UI handles this with a numbered fallback label `Kamera N`.
- No automated test covers the camera selector UI (requires JSDOM camera mocks). Behavior is covered by code review.
- Manual QA with physical camera required to confirm end-to-end camera switching.
