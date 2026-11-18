# Owner Physical Webcam Live Verification Protocol (R18 Pre-Integration Gate)

**Important Notice:** No physical camera (`/dev/video*`) exists on the VM. All browser tests so far (`r18_ux4_browser_runtime.json`) used a simulated `.y4m` feed (`BROWSER_SIMULATED_VIDEO`) on CPU XNNPACK. Integration to `main` MUST NOT happen until Owner passes the physical-webcam checks below.

## Pre-Flight Setup (Laptop/Classroom Chrome or Edge)
1. Serve the sandbox build + isolated `/r18-harness` (or preview branch) over HTTPS/localhost on the target student laptop with DevTools **Network -> Disable cache** checked before Scenario 0.
2. Confirm physical lighting meter / visual room conditions match real student seats.

## Mandatory Acceptance Scenarios

### Scenario 0 — Cold First-Use Transfer Budget (`B-USER < 25 MB`)
- Open DevTools -> Network (`Disable cache`), step through `/` -> `/onboarding/{card,number,cam}` -> `/levels` -> `/canvas1` -> `/level1`..`/level3`.
- **PASS:** Total unique **Transferred** column (`encodedDataLength`) **< 25.0 MB** (sandbox measured `10.811 MB` with Caddy `zstd`), `hand_landmarker.task` & WASM load cleanly without console errors.

### Scenario 1 — Bad Low-Cost 480p Webcam & Dim Lighting (`5–15 lux` screen-lit face/desk)
- Hold natural resting hands near keyboard/chin (`NOG`), then perform 10 intentional draws (`Pinch` < 0.25 span), 5 erasures (open 5-finger hold >= 0.2s), and 5 Undos/Redos.
- **PASS:** Detection stays usable (`>= 10–15 fps`), dark scenes recover via Adaptive M3 CLAHE without locking out bright hands, **0** unrequested Hapus erasures when resting/reaching, and **0** ink dots while hovering thumb/index > 0.35 span (`PINCH_NEAR`).

### Scenario 2 — Strong Overhead Ceiling Light & Sharp Shadows
- Sit directly under bright overhead downlight casting hard shadow across palm and fingers.
- **PASS:** `FOUR` (4 fingers, thumb tucked) and throwing hand up/left (`TUP`/`TLT`) never trigger false Hapus; intentional 5-finger hold still activates Erase smoothly within ~200 ms.

### Scenario 3 — Window Backlight (`> 10:1` bright window/lamp behind student)
- Position hand against window/doorway backlight.
- **PASS:** `centerLuma` backlight trigger engages CLAHE fallback only when RAW misses; pointing left/right (`0°`/`180°`) and jumping (`55°–125°`) respond steadily without flickering back to neutral mid-hold.

### Scenario 4 — Skin-Tone Background & Busy Textured Clothing
- Hold face/hands in front of beige/wood/tan wall or skin-toned sleeve; place face close to camera alongside a bystander's hand on one side (`FaceAnchor` + fallback test).
- **PASS:** Lock remains anchored on player hand closest to student face; if bystander moves larger hand briefly or face detector drops 1–2s, primary-hand lock holds on player without snapping to bystander.

### Scenario 5 — Cross-Object Distractors (`N0/N1`: ruler/chopsticks/fan/notebook/poster hand)
- Place chopsticks/sticks/ruler/book with printed hand briefly inside camera FOV across **bright AND dim** light.
- **PASS:** Even if MediaPipe flashes a box/skeleton, Thinman does NOT walk/jump (`0` false Steer) and Canvas does NOT erase (`0` false Hapus).

### Scenario 6 — Thinman End-to-End Comfort & Ergonomics (`level1`..`level3`)
- Play full level twice using aspect-corrected 1-finger pointing (`P3_ux3` + `VirtualKeySteeringFSM` + `J2_edge` jump + Phase Barrier):
  - **Placing -> Playing transition (F10):** Keep finger pointing right while level switches -> Thinman MUST stay stopped until finger drops to neutral/non-pointing and re-arms!
  - **Opposite flip & diagonal:** Flip Left -> Right quickly; hold Jump (`90°`) continuously for 2 seconds -> Thinman jumps **once** per raise (`J2_edge`), never bouncing repeatedly on the ground; lowering below `40°` for >= 150 ms re-arms next jump reliably.
  - **Comfort & Endurance:** Play 3–5 minutes continuous, close game / navigate back -> camera indicator light turns OFF within 1 second (`tracksEndedCount === total`).
- **PASS:** Subjective feel comparable to arrow-key keyboard responsiveness (`<= 1–2` false triggers over 5 min), sustained smooth FPS on real laptop GPU/WebGL delegate without thermal stutter, webcam LED turns off cleanly on exit.
