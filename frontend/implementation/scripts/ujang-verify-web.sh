#!/usr/bin/env bash
set -euo pipefail
# Verification only. Does NOT deploy or touch main. Run on Ujang's build runner.
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo 'Node.js missing; install Node 20+' >&2; exit 2; }
command -v npm >/dev/null || { echo 'npm missing' >&2; exit 2; }
test -f public/models/hand_landmarker.task || { echo 'hand model missing' >&2; exit 3; }
test -f public/mediapipe/blaze_face_short_range.tflite || { echo 'face model missing' >&2; exit 3; }
test -f public/mediapipe/wasm/vision_wasm_internal.wasm || { echo 'WASM missing' >&2; exit 3; }
echo '[1/5] npm ci'
npm ci --no-audit --no-fund
echo '[2/5] TypeScript'
npm run typecheck
echo '[3/5] ESLint'
npm run lint
echo '[4/5] Vitest'
npm test
echo '[5/5] Production build'
NEXT_PUBLIC_TEST_HOOKS=0 npm run build
echo 'Local gates passed. Deployment and webcam/browser acceptance are separate steps.'
