# T28 — Verifikasi Akhir & Production Build Report

**Task:** T28 / FX14  
**Date:** 2026-11-21  
**Status:** `PASS`  

---

## 1. Summary of Execution Gates

All required test gates were executed in `$WORK/frontend/implementation` with clean exits:

1. **Gate 1: TypeScript & ESLint**
   - Command: `npx tsc --noEmit && npm run lint`
   - Result: `PASS` (0 type errors, 0 ESLint errors).

2. **Gate 2: NUI Lab Vitest Test Suite**
   - Command: `npx vitest run tests/nui-lab/ tests/owner-build-manifest.test.ts`
   - Result: `PASS` across all 28 test files (290 passed tests, 0 failures). Includes unit tests for `monui7-yolo.ts` NMS, coordinate letterbox/unletterbox, raw YOLO anchor parsing, and SHA-256 verification.

3. **Gate 3: Gameplay Baseline Regression**
   - Command: `npx vitest run tests/input/eraser-controls.test.ts tests/input/two-hand-surface.test.ts tests/input/hand-stroke-surface.test.ts`
   - Result: `PASS` (exactly 39 passed, 9 failed out of 48, identical to `main@745bb6d` baseline).

4. **Gate 4: Production Static Build**
   - Command:
     ```bash
     NEXT_PUBLIC_TEST_HOOKS=0 \
     NEXT_PUBLIC_GIT_COMMIT="$(git -C $RC rev-parse HEAD)" \
     NEXT_PUBLIC_GIT_BRANCH="research-can/r23-monui7" \
     NEXT_PUBLIC_APP_VERSION="0.29.1-alpha+r23-monui7" \
     npm run build
     ```
   - Result: `PASS` (exit 0). 24/24 static HTML pages generated in `out/`.
   - Version verification: `grep -o "0.29.1-alpha+r23-monui7" out/nui-lab.html | head -n 1` returned `0.29.1-alpha+r23-monui7`.

5. **Gate 5: Headless Lazy Loading Verification**
   - Command: `node /srv/sketchbook/mediapipe-optimize/research-can/r23/scripts/verify_lazy_loading.mjs`
   - Result: `PASS`. Initial navigation to `/nui-lab/canvas` makes 0 requests to `/ort/` or `.onnx` models. Assets are loaded strictly on demand upon rescue trigger. Evidence logged in `r23/results/T28_lazy_loading.json`.
