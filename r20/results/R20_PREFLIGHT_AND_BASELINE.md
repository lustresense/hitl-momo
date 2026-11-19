# R20 Stage P0/A0 Preflight, Hardware Audit & Frozen `C0` Baseline Reproduction

- **Revision:** `R20-01 v0.2.0` (`2026-11-19 WIB`)
- **Executor:** Agy (single main agent session, **0 subagents spawned**, strict §19.1 compliance)
- **Research Branch Baseline:** `research-can@dbbdeeb64850d7b6167677e468c3dc96f905e3d7` (R19 code/model baseline `5a3eb290464fa74ae4b1ee709e241980bd1c79c9`)
- **Product Read-Only Reference:** `main@8969502df4e106d8428055c2ca6f80f4f59250ee` (`0.26.0-alpha`, verified untouched)

---

## 1. Real Hardware, GPU/VRAM, Storage & Runtime Preflight (`§8 P0`, `§15 A0`, `§19.1`)

| Resource | Measured Value (`pa-hitl-server`, `2026-11-19 WIB`) | Status |
|---|---|---|
| **GPU 0** | `NVIDIA RTX A5000`, `24,564 MiB` VRAM (`15 MiB` idle before training), Driver `595.99.02`, CUDA `13.2` | **VERIFIED (`nvidia-smi` + `torch.cuda`)** |
| **GPU 1** | `NVIDIA RTX A5000`, `24,564 MiB` VRAM (`15 MiB` idle before training), Driver `595.99.02`, CUDA `13.2` | **VERIFIED (`nvidia-smi` + `torch.cuda`)** |
| **CPU** | `Intel(R) Xeon(R) Silver 4314 CPU @ 2.40GHz` (`4` vCPUs) | **VERIFIED (`lscpu`)** |
| **RAM / Swap** | `11 GiB` RAM (`~8.3 GiB` available) + `4.0 GiB` Swap | **VERIFIED (`free -h`)** |
| **Disk `/` (`/dev/sda2`)** | Initial check at `06:42 WIB`: `820 MB` free (`99%` used) -> **P0 STOP triggered per §10 & §19.3**. After Owner expanded `/dev/sda2` to `126 GiB` at `10:00 WIB`: **`62 GiB` free (`49%` used)** | **RESOLVED & VERIFIED (`df -h /`)** |
| **Isolated R20 Sandbox** | `/srv/sketchbook/mediapipe-optimize/r20-sandbox/` (Python `3.12.3` `.venv` with `torch 2.15.0+cu132`, `torchvision 0.29.2+cu132`, `mediapipe 1.2.3`, `opencv-python-headless 5.1.0`; Node.js `v26.13.1`, Playwright Chromium `159.0.8154.6`) | **VERIFIED (outside public repo)** |

---

## 2. Source Codepath Audit of `main@8969502` (`§1` line 35, `§7.1`, `§14.1`, `§19.2`)

A full read-only audit of `main@8969502` (`frontend/implementation/src/`) confirmed:
1. **`src/camera/hand-landmarker.ts` (`createHandLandmarker`):**
   - Lines `96–106`: Uses `CPU` immediately only when `isSoftwareRenderer(readRenderer())` is true; otherwise **attempts `GPU` first** (`await build("GPU")`) with a fallback to `CPU` on creation failure or after `SLOW_GPU_STREAK = 20` consecutive frames `> 120 ms`.
   - Every hand tracking path in the product (`NuiLabPage.tsx`, `gameplay-hand-driver.ts`, `mediapipe-input.ts`, `thumb-tracker.ts`, `wave-tracker.ts`, `DreamLoader.tsx`, `GlobalCamera.tsx` via `landmarker-warmup.ts`) routes through this single `createHandLandmarker` factory.
2. **`src/camera/face-anchor.ts`:** Already constructs `FaceDetector` with `baseOptions: { modelAssetPath, delegate: "CPU" }`.
3. **`src/camera/inference-scheduler.ts`:** Runs `detectForVideo` synchronously on the main UI thread, sharing a `BUDGET_SHARE = 0.35` / `MAX_BUSY_SHARE = 0.50` main-thread budget between `HAND_LANE` and `FACE_LANE`.
4. **`src/camera/frame-source.ts`:** Supports `"auto" | "off" | "on" | "scaled"` with `ENHANCE_WIDTH = 320`, `DARK_LUMA = 0.28`, `BACKLIGHT_CENTER_MAX = 0.36`, `BACKLIGHT_LUMA_GAP = 0.18`.

---

## 3. Frozen `C0 (R19 G3/G4)` Baseline Reproduction (`§5`, `§11`, `§15 A1`)

Before training any R20 candidate, all hardcoded `/srv/.../r19-sandbox` paths were refactored into environment-parameterized R20 scripts (`r20/scripts/extract_r20_features.ts`) without modifying any published `r18/` or `r19/` files. Running `extract_r20_features.ts --out-prefix r20_feat` reproduced the R19 feature buffers **byte-for-byte** (`cmp` exit 0 against `r19_feat_{train,val,test}.f32`):

- **`TRAIN`:** `17,086` rows (`POINT_READY: 302`, `POINT_PRESS: 196`, `OTHER: 16,588`)
- **`VAL`:** `5,067` rows (`POINT_READY: 22`, `POINT_PRESS: 111`, `OTHER: 4,934`) — `C0` `Macro-F1 = 0.9515`, `Acc = 0.9972`, `OTHER->PRESS = 2` (`0.041%`)
- **`TEST`:** `4,720` rows (`POINT_READY: 21`, `POINT_PRESS: 35`, `OTHER: 4,664`) — `C0` `Macro-F1 = 0.9567`, `Acc = 0.9985`, `OTHER->PRESS = 2` (`0.043%`)
