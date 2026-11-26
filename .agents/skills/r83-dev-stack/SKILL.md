---
name: r83-dev-stack
description: >-
  Run, build, debug, and verify Sketchbook Universe (hitl-momo) across Flag=0 legacy,
  Flag=1 r8.3 UI, MoNUI worker coldstart, and the Windows local live stack (:3000 + :5800)
  without altering production Caddy configs. Use when starting local servers, running
  R83 parity/E2E checks, or diagnosing Keras/ONNX/Caddy environment issues.
---

# Sketchbook Universe (`r8.3`) Local Dev & Verification Runbook

## 1. Caddy vs. Local Windows Dev Topology
- `deploy/Caddyfile` and `deploy/Caddyfile.dev` serve Next.js static export (`out/`, `output: "export"`) + FastAPI (`/api/*`, `/predict`, `/health`) + admin (`/admin*`) on one origin for Docker and Cloudflare Tunnel (zero CORS needed in prod).
- **Do NOT edit `deploy/` for local Windows testing.** Locally without Caddy, serve static `frontend/implementation/out` on `:3000` and Uvicorn DIAS backend on `:5800` with `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`.

## 2. DIAS Backend on Windows (Keras 3.12+ Compatibility)
- Saved MobileNetV2 weights may reference legacy layer/initializer kwargs (`GlorotUniform`: `input_axes`/`output_axes`; `BatchNormalization`: `renorm*`; `Dense`: `quantization_config`).
- When launching Uvicorn directly on Windows outside Docker, wrap those `from_config` classmethods before importing `backend.app.main:app`, and pass `TF_ENABLE_ONEDNN_OPTS=0` + `AI_DIFFICULTY_ENABLED=0` unless testing AI difficulty.

## 3. MoNUI & Exclusive Input Guardrails
- `monui-worker-warmup.ts` pre-downloads WASM + `hand_landmarker.task` and runs blank-frame `OffscreenCanvas` warmup (`r20-hand.worker.ts`) before `READY`.
- Gate `yoloEnabled` with `process.env.NEXT_PUBLIC_MONUI_YOLO === "1"` unless `public/models/monui7-hand-yolo26n-320.onnx` exists (prevents 404 console errors).
- Keep camera-vs-mouse exclusivity strict (`nui.getStatus().handAttached`): any interactive component with raw React pointer/click handlers (`GuessRing`, `CardWalk`, `useRibbonShelf`, etc.) must block mouse interaction while `handAttached === true`.

## 4. Two-Flag Build & Verification Sequence
Verify inside `frontend/implementation`:
1. `npm run typecheck` and `npx eslint --max-warnings 0` on touched `src/` files (`<= 300` lines; shells `<= 200`).
2. **Flag=0 gate** (`NEXT_PUBLIC_UI_R83="" NEXT_PUBLIC_TEST_HOOKS=0 NEXT_PUBLIC_DEV_TOOLS=0 NEXT_PUBLIC_PREDICTION_MODE=mock`): `npm run build`, then `node e2e/route-canvas.mjs` and `node e2e/guide-flow.mjs`.
3. **Flag=1 gate** (`NEXT_PUBLIC_UI_R83=1 NEXT_PUBLIC_TEST_HOOKS=1 NEXT_PUBLIC_DEV_TOOLS=1 NEXT_PUBLIC_PREDICTION_MODE=mock`): `npm run build`, then `node e2e/r83/r83-flow.mjs` (verifying `"Level"`, zero `"Bab"`, single `#cam-pip`).
4. **Live Partner Build (`:3000` + `:5800`)**: rebuild `out/` with `NEXT_PUBLIC_UI_R83=1 NEXT_PUBLIC_TEST_HOOKS=0 NEXT_PUBLIC_DEV_TOOLS=0 NEXT_PUBLIC_PREDICTION_MODE=partner NEXT_PUBLIC_PREDICTION_ENDPOINT=http://127.0.0.1:5800/predict NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5800`, and verify live `/predict` HTTP 200.
5. Keep `git status` clean afterward (e.g., restore Vitest-modified `synthetic-k8-v2-2-export.json` if dirtied).
