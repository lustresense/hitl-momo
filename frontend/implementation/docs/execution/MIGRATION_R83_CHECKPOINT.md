# R8.3 migration checkpoint (partial, STATIC_ONLY)
Source: Owner's sketchbook-universe-sandbox-r8.3.zip, MAP.md revision 8.3 and shared/hand.js.
Base main: 1f24110028547221f029edf34d1527123d544969.
This commit ports the shared A/B/D confirmation target system to the existing hand cursor store, uses it in the existing React ring components, removes silent pointer confirmation there, and makes the drawing submit a pointed pinch-hold. It does not replace MediaPipe or the real prediction/backend flow.
Not yet migrated: rule C joystick/drag/ribbon/flick, drawing tools and cursor art, full cover/name flow (STT not present in baseline), CSS/art/icons, gameplay colliders/placement, recap/ending, other direct pointer handlers. Existing screen copy and legacy gestures outside these components remain. No claim of visual parity or global pointer lock.
No npm/typecheck/browser/physical webcam runtime available here. Tests added but not executed. Existing legacy tests expect old behavior; reconcile during full migration. No version bump: partial development checkpoint; no changes to shared backend/admin, deployment or main.

## Second checkpoint
Student drawing now uses a viewport-aligned pinch-only driver, five native React tools with the five exact SVG paths from R8.3, reversible wipe, and camera-only pointer gate. The stage routes the anchored pinch joystick to the existing arbiter and KAPLAY GameController; speed is computed but the current controller accepts only direction booleans, so variable speed and joystick overlay remain pending. Direction buttons and stage canvas mouse handlers are fallback-only. Tutorial and ending-specific control flows, complete pointer audit, C gesture placement/ribbon/sticker, and visual regression remain pending. Existing tutorial tool usage requirements have not been migrated. No build or tests executed.

### Checkpoint 3
- Routed shared GestureRing camera actions (including existing HITL choices) through R8.3 target selection; manual pointer/keyboard remains fallback.
- Removed legacy exploration rings from gameplay to avoid competing with joystick. Placement has relative pinch-drag (12px threshold) and 1500ms stationary confirm; current shared ring cancellation threshold is still 26px, which must be reconciled. Existing world collision, rotation, visual fall and layout are not yet R8.3 equivalent.
- Analog joystick speed now passes through GameController into existing integrated and legacy KAPLAY movement. No live validation.

## Checkpoint 4: direct sandbox visual port
HITL rows, thumbnail, single-stage override, 2 s label decisions, 1 s action decisions and badge CSS use sandbox guess.js/level.css/hand.css. Actual controller callbacks and provider confidence remain intact. Removed legacy canvas focus stage for student route; updated toolbar styles and outside-sheet cursor. Font declarations exist but exact font payload is not installed. Camera PIP hand, pen artwork, ring positioning, cover/name flow, tutorial, ribbon pull, ending, fall effects, collider and route parity remain incomplete. No merge to main ever, per Owner instruction. STATIC_ONLY.
