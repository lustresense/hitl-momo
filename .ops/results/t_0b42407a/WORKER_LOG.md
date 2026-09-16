# WORKER_LOG.md — Task t_0b42407a

**Task ID:** `t_0b42407a`  
**Card:** `[BUGFIX] DrawingScreen: camera selection broken & pointer input not responding`  
**Worker:** AGY (Antigravity, Claude Sonnet 4.6 Thinking)  
**Start:** 2026-08-27T11:20 WIB  

---

## Step 1 — Bootstrap & Repository Read

- Read `/srv/sketchbook/Sketchbook-Universe-v2/AGENTS.md` — confirmed WORKER role.
- Read `WORKING_CONTEXT.md` — confirmed current implementation state (Next.js 14, React 18, MediaPipe).
- Listed project structure; located implementation at `/srv/sketchbook/Sketchbook-Universe-v2/implementation`.

## Step 2 — Read Relevant Source Files

Files inspected:
1. `src/components/drawing/DrawingScreen.tsx`
2. `src/input/index.ts`
3. `src/input/hand-gesture.ts`
4. `src/input/mediapipe-input.ts`
5. `src/input/pointer-input.ts`
6. `src/input/types.ts`
7. `src/input/smoothing.ts`
8. `app/globals.css`
9. `tests/input/hand-gesture.test.ts`
10. `tests/components/components.test.tsx`
11. `.ops/results/t_ca135a7f/WORKER_CHANGELOG.md` (gesture UX task, 15h prior)

No git history available (not a git repository).

## Step 3 — Root Cause Analysis

### Bug 1: Camera selection missing

Inspecting `DrawingScreen.tsx`: **No `<select>` element exists** for camera device selection. `mediapipe-input.ts::start()` hardcodes `facingMode: "user"` with no `deviceId` support.

**Root cause:** Feature gap — camera device enumeration and selector UI were never implemented. The gesture UX upgrade (t_ca135a7f) did not add it.

### Bug 2: Pointer input not responding (genuine regression)

**Critical bug in `src/input/index.ts`** — `DrawingSurface.setMode("hand")`:

```ts
// BEFORE (broken):
this.detachPointer?.();  // calls the function but NEVER nulls this.detachPointer!
```

The `attachPointer()` guard blocks re-attachment:
```ts
private attachPointer(): void {
  if (this.detachPointer) return;  // FALSELY fires because ref is stale!
  ...
}
```

**Consequence:** After any `setMode("hand")` call:
- If hand fails → `stopHand()` tries to re-attach pointer via `attachPointer()` → guard fires → pointer NOT attached.
- If hand succeeds, then user switches back to pointer → `stopHand()` → `attachPointer()` → guard fires → pointer NOT re-attached.

## Step 4 — Fixes Implemented

### Fix A: `src/input/index.ts`

- Changed `this.detachPointer?.()` to explicitly null the ref:
  ```ts
  if (this.detachPointer) {
    this.detachPointer();
    this.detachPointer = undefined;
  }
  ```
- Changed field type from `null` to `undefined` throughout.
- Added `export async function enumerateVideoDevices()`.
- Added `deviceId?: string` parameter to `setMode()`.
- Forwarded `deviceId` to `HandDrawingDriver`.
- Removed redundant `this.attachPointer()` in catch block (stopHand already calls it).

### Fix B: `src/input/mediapipe-input.ts`

- Added `deviceId?: string` to `HandDriverOptions`.
- Updated `start()` to use `{ deviceId: { exact: ... } }` when provided, else `facingMode: "user"`.

### Fix C: `src/components/drawing/DrawingScreen.tsx`

- Added `videoDevices: MediaDeviceInfo[]` and `selectedDeviceId: string` state.
- Added `enumerateVideoDevices()` import.
- Updated `onStatusChange` to re-enumerate devices after permission granted.
- Converted `switchMode` to `useCallback` with optional `deviceId`.
- Added `handleDeviceChange` callback.
- Added camera selector `<select id="camera-select">` rendered when `mode === "hand" && videoDevices.length > 0`.

## Step 5 — Verification

| Check | Result |
|---|---|
| `npm run typecheck` | Exit 0 — 0 errors (1 error fixed during iteration) |
| `npm run test` | Exit 0 — 76/76 tests PASS (10 test files) |
| `npm run build` | Exit 0 — compiled successfully, 5/5 pages |

---

**End:** 2026-08-27T11:29 WIB
