# APPLY.md — MoNUI-7 R23 Candidate Patch (`monui7`, HF2 Candidate)

- **Candidate ID:** `monui7-r23-hf2`
- **Base Commit (`main`):** `745bb6d840793dcab8558f65aef6bfac58807e79` (`745bb6d`)
- **Previous Candidate Commit (`HF1`):** `b4b14f012ab73b7f6267e585d946ac1730a8eebc` (`b4b14f0`)
- **Current Candidate Commit (`HF2`):** `402ea36c49d2fa93f6445137a0c42c290d516b21` (`402ea36`)
- **Cumulative Patch (`main@745bb6d` -> `R23@402ea36`):** `r23_main-745bb6d_to_402ea36.patch`
- **Incremental Review Patch (`HF1@b4b14f0` -> `HF2@402ea36`):** `r23_incremental_b4b14f0_to_402ea36.patch`
- **Target Snapshot Tree Hash (`git write-tree`):** `927439cd9403a1c7050271dbf7c3903cfd4eb833`
- **Policy:** Single active clone is `/srv/sketchbook/research-can` (`research-can` branch). Do **NOT** push any code branch to `origin`.

---

## 1. Clean Checkout & Patch Application Procedure (For Ujang / DEV)

### Option A: Apply Cumulative Patch from `main@745bb6d`
```bash
# 1. Start from a clean detached checkout/worktree of main@745bb6d
git fetch origin main research-can
git worktree add --detach /tmp/r23-dev 745bb6d840793dcab8558f65aef6bfac58807e79
cd /tmp/r23-dev

# 2. Verify patch SHA-256 checksum from research-can
(cd /srv/sketchbook/research-can/r23/candidates/monui7 && sha256sum -c SHA256SUMS.txt)

# 3. Apply cumulative R23 HF2 patch to working tree and git index
git apply --index /srv/sketchbook/research-can/r23/candidates/monui7/r23_main-745bb6d_to_402ea36.patch

# 4. Mandatory tree-hash verification (must match 927439cd9403a1c7050271dbf7c3903cfd4eb833)
TREE_HASH=$(git write-tree)
echo "TREE_HASH=$TREE_HASH"
test "$TREE_HASH" = "927439cd9403a1c7050271dbf7c3903cfd4eb833"
```

### Option B: Apply Incremental Patch from Previous Candidate `HF1@b4b14f0`
```bash
cd /path/to/r23-hf1-worktree
git apply --index /srv/sketchbook/research-can/r23/candidates/monui7/r23_incremental_b4b14f0_to_402ea36.patch
test "$(git write-tree)" = "927439cd9403a1c7050271dbf7c3903cfd4eb833"
```

---

## 2. Deploy Model & Prebuild Assets

Model ONNX (`monui7-hand-yolo26n-320.onnx`, SHA-256 `97f778ea77f4dbf160e91dff021a463ab464cdbf27a34d067d5f28708dbf1ddb`) is distributed via `$BIG_ROOT/release/r23_fx_v0a/` (Windows: `D:\monui7-data\release\r23_fx_v0a\`, WSL: `/mnt/d/monui7-data/release/r23_fx_v0a/`) and is excluded from git commits per mandate:

```bash
mkdir -p /tmp/r23-dev/frontend/implementation/public/models
# From WSL:
cp /mnt/d/monui7-data/release/r23_fx_v0a/monui7-hand-yolo26n-320.onnx /tmp/r23-dev/frontend/implementation/public/models/
# Or Windows cmd/PowerShell:
# copy D:\monui7-data\release\r23_fx_v0a\monui7-hand-yolo26n-320.onnx <path_to_worktree>\frontend\implementation\public\models\
```

---

## 3. Mandatory Test Gates (Node >= 22 Required)

```bash
cd /tmp/r23-dev/frontend/implementation
npm ci

# Gate 1: TypeScript & ESLint
npx tsc --noEmit
npm run lint

# Gate 2: NUI Lab Unit & Component Test Suite (29 files / 304 tests must all PASS, 0 failures)
npx vitest run tests/nui-lab/

# Gate 3: Gameplay baseline regression check (must remain strictly 39 PASS / 9 FAIL, matching main@745bb6d)
npx vitest run tests/input/eraser-controls.test.ts tests/input/two-hand-surface.test.ts tests/input/hand-stroke-surface.test.ts
```

---

## 4. Production Static Build for DEV

```bash
cd /tmp/r23-dev/frontend/implementation
RESEARCH_SHA=$(git -C /srv/sketchbook/research-can rev-parse HEAD)

NEXT_PUBLIC_TEST_HOOKS=0 \
NEXT_PUBLIC_GIT_COMMIT="$RESEARCH_SHA" \
NEXT_PUBLIC_GIT_BRANCH="research-can/monui7-r23" \
NEXT_PUBLIC_APP_VERSION="0.29.1-alpha+r23-monui7" \
npm run build
```

- **Do NOT push any branch from `/tmp/r23-dev`.**
- Serve `frontend/implementation/out/` via the DEV static server.
