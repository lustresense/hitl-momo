# APPLY.md — MoNUI-7 R23 Candidate Patch (`monui7`, Wave 0 Candidate)

- **Candidate ID:** `monui7-r23-wave0`
- **Base Commit (`main`):** `745bb6d840793dcab8558f65aef6bfac58807e79` (`745bb6d`)
- **Incremental Base Commit (`R22B`):** `c6ed50b9b11fc60295752940dae6174ced4d935c` (`c6ed50b`)
- **Cumulative Patch (`main@745bb6d` -> `R23@57acc5e`):** `r23_main-745bb6d_to_57acc5e.patch`
- **Incremental Review Patch (`R22B@c6ed50b` -> `R23@57acc5e`):** `r23_incremental_c6ed50b_to_57acc5e.patch`
- **Target Snapshot Tree Hash (`git write-tree`):** `aed6f04ee5be846ed185128f8e2cfea282e2a0b9`
- **Policy:** Single active branch is `research-can`. Do **NOT** push any code branch to `origin`.

---

## 1. Clean Checkout & Patch Application Procedure (For Ujang / DEV)

```bash
# 1. Start from a clean detached checkout/worktree of main@745bb6d
git fetch origin main research-can
git worktree add --detach /tmp/r23-dev 745bb6d840793dcab8558f65aef6bfac58807e79
cd /tmp/r23-dev

# 2. Verify patch SHA-256 checksum from research-can
(cd /path/to/research-can && sha256sum -c r23/manifests/SHA256SUMS.txt)

# 3. Apply cumulative R23 patch to working tree and git index
git apply --index /path/to/research-can/r23/candidates/monui7/r23_main-745bb6d_to_57acc5e.patch

# 4. Mandatory tree-hash verification (must match aed6f04ee5be846ed185128f8e2cfea282e2a0b9)
TREE_HASH=$(git write-tree)
echo "TREE_HASH=$TREE_HASH"
test "$TREE_HASH" = "aed6f04ee5be846ed185128f8e2cfea282e2a0b9"
```

### Alternatively: Apply Incremental Patch from R22B (`c6ed50b`)
```bash
cd /path/to/r22b-worktree
git apply --index /path/to/research-can/r23/candidates/monui7/r23_incremental_c6ed50b_to_57acc5e.patch
test "$(git write-tree)" = "aed6f04ee5be846ed185128f8e2cfea282e2a0b9"
```

---

## 2. Deploy Model & Prebuild Assets

Model ONNX (`monui7-hand-yolo26n-320.onnx`, SHA-256 `ee50a5d1e9f195c734f348f0d09eceab354f85b8094e8aefff1a5a9e45099f98`) is distributed via `$DATA_ROOT/release/` or release artifacts and is excluded from git commits per mandate:

```bash
mkdir -p /tmp/r23-dev/frontend/implementation/public/models
cp /path/to/monui7-hand-yolo26n-320.onnx /tmp/r23-dev/frontend/implementation/public/models/
```

---

## 3. Mandatory Test Gates (Node >= 22 Required)

```bash
cd /tmp/r23-dev/frontend/implementation
npm ci

# Gate 1: TypeScript & ESLint
npx tsc --noEmit
npm run lint

# Gate 2: NUI Lab Unit & Component Test Suite (27 files / 290 tests must all PASS)
npx vitest run tests/nui-lab/

# Gate 3: Gameplay baseline regression check (must remain 39 PASS / 9 FAIL, matching main@745bb6d)
npx vitest run tests/input/eraser-controls.test.ts tests/input/two-hand-surface.test.ts tests/input/hand-stroke-surface.test.ts
```

---

## 4. Production Static Build for DEV

```bash
cd /tmp/r23-dev/frontend/implementation
RESEARCH_SHA=$(git -C /path/to/research-can rev-parse HEAD)

NEXT_PUBLIC_TEST_HOOKS=0 \
NEXT_PUBLIC_GIT_COMMIT="$RESEARCH_SHA" \
NEXT_PUBLIC_GIT_BRANCH="research-can/monui7-r23" \
NEXT_PUBLIC_APP_VERSION="0.29.1-alpha+r23-monui7" \
npm run build
```

- **Do NOT push any branch from `/tmp/r23-dev`.**
- Serve `frontend/implementation/out/` via the DEV static server.
