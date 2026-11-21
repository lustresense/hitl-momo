# Published vs Excluded Manifest — MoNUI-7 R23 Wave 0

**Mandate**: NUI_R23-02 v1.1.0 §6 T29 & v1.2.0 FX14  
**Revision**: R23 (MoNUI-7 Wave 0 Candidate)  
**Date**: 2026-11-21  

---

## 1. Published Artifacts (Included in `research-can`)

| Published Artifact | Path in `research-can` | Description |
| :--- | :--- | :--- |
| **Cumulative Patch** | `r23/candidates/monui7/r23_main-745bb6d_to_2721117.patch` | Full patch from `main@745bb6d` to `R23@2721117` (SHA-256 `9b4322...`) |
| **Incremental Patch** | `r23/candidates/monui7/r23_incremental_r22b_to_2721117.patch` | Incremental review patch from `R22B@c6ed50b` to `R23@2721117` (SHA-256 `eece52...`) |
| **Deploy Guide** | `r23/candidates/monui7/APPLY.md` | Verification and static build instructions for Ujang / DEV |
| **Checksum Manifest** | `r23/manifests/SHA256SUMS.txt` | Cryptographic checksums of candidate patch files and guides |
| **Exclusion Manifest** | `r23/manifests/published_vs_excluded_manifest.json` | JSON structured accounting of published vs excluded files |
| **Dataset Registry** | `r23/registry/dataset_registry_r23.json` | Dataset registry v1.2 conforming to contract K7 v1.2 |
| **License Audit** | `r23/registry/LICENSE_NOTES.md` | Comprehensive license audit and attribution notes |
| **Detection Scripts** | `r23/scripts/detector/`, `r23/scripts/data/` | Training, evaluation, and parity verification scripts |
| **FX09 Report & Metrics**| `r23/detector/FX09_v0_report.md`, `r23/results/FX09_v0_metrics.json` | Training convergence, luminance bin recall, and winner decision |
| **T19 / FX11 Report** | `r23/detector/T19_v1_report.md` | v1 training, evaluation, dark real test eval, and retention of fx_v0a |
| **FX12 Parity Results** | `r23/results/FX12_ts_parity.json` | PyTorch vs TypeScript parity evaluation (min IoU: 0.99981, 100% match) |
| **T28 Final Gates** | `r23/results/T28_final_gates.json`, `T28_lazy_loading.json` | Production build, Vitest suite (290 tests), and lazy loading gates |
| **UI Screenshots** | `r23/results/screenshots/*.png` | Headless UI states for Momo Guide and NUI Lab dashboard |

---

## 2. Excluded Artifacts (Preserved Externally, Excluded from Git)

| Excluded Artifact | Storage Location | Size | Reason for Exclusion |
| :--- | :--- | :---: | :--- |
| **ONNX Model Weights** | `$DATA_ROOT/release/monui7-hand-yolo26n-320.onnx`, `$BIG_ROOT/backup/runs/` | 9.3 MB | Excluded per mandate §6 T29 (OA-7 pending owner approval). Tracked via SHA-256 (`97f778ea77f4dbf160e91dff021a463ab464cdbf27a34d067d5f28708dbf1ddb`). |
| **PyTorch Checkpoints** | `$DATA_ROOT/runs/{fx_v0a,fx_v0b,fx_v1}/weights/best.pt`, `$BIG_ROOT/backup/runs/` | ~10 MB | Heavy binary weights stored in local and remote backup storage. |
| **Raw Training Datasets**| `$DATA_ROOT/yolo/`, `$DATA_ROOT/staging/`, `$DATA_ROOT/darkpool/`, `$BIG_ROOT/backup/data/` | ~12 GB | 127,366 images (199,222 bounding boxes) across HaGRID, HANDS v2, OpenImages, and Darkpool. Stored in `$DATA_ROOT` / `$BIG_ROOT`. |
| **Pre-built WASM Assets** | `public/ort/*.wasm` | 88 MB | WebAssembly runtime binaries generated deterministically via `scripts/copy-ort-wasm.mjs` during `npm run build`. |
| **Dependencies & Build** | `node_modules/`, `.next/`, `out/` | ~2 GB | Standard ephemeral build artifacts and node dependencies. |
| **Personal Data / Streams**| None stored | 0 B | Zero faces, zero raw user video files, zero camera streams stored per AGENTS.md §5. |
