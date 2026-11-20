# APPLY.md — R22B HandState Candidate Patch (`r22b-handstate`, DEV Target)

- **Candidate ID:** `r22b-handstate` (Wave 1 Complete)
- **Base Commit (`main`):** `745bb6d840793dcab8558f65aef6bfac58807e79` (`745bb6d`)
- **Cumulative DEV Patch (`main@745bb6d` -> `R22B`):** `r22b_main-745bb6d_to_8f74db4.patch`
- **Incremental Review Patch (`R22@1bb1a71` -> `R22B@8f74db4`):** `r22b_incremental_1bb1a71_to_8f74db4.patch`
- **Target Snapshot Tree Hash (`git write-tree`):** `16806cb23382a0655c040b3398903feeeaf0fe7b` (matches historical `8f74db4`)
- **Policy:** Single active branch is `research-can`. Do **NOT** push any code branch to `origin`. Future iterations (`Wave 2+`) are published as versioned patches (`_v2.patch`, etc.) in this directory without overwriting earlier patches.

---

## 1. Clean Checkout & Patch Application Procedure (For Ujang / DEV)

```bash
# 1. Start from a clean detached checkout/worktree of main@745bb6d
git fetch origin main research-can
git worktree add --detach /tmp/r22b-dev 745bb6d840793dcab8558f65aef6bfac58807e79
cd /tmp/r22b-dev

# 2. Verify patch SHA-256 checksum from research-can
(cd /path/to/research-can && sha256sum -c r22b/manifests/SHA256SUMS.txt)

# 3. Apply cumulative R22B patch to working tree and git index
git apply --index /path/to/research-can/r22b/candidates/r22b-handstate/r22b_main-745bb6d_to_8f74db4.patch

# 4. Mandatory tree-hash verification (must match 16806cb23382a0655c040b3398903feeeaf0fe7b)
TREE_HASH=$(git write-tree)
echo "TREE_HASH=$TREE_HASH"
test "$TREE_HASH" = "16806cb23382a0655c040b3398903feeeaf0fe7b"
```

---

## 2. Mandatory Test Gates (Node 22 Required)

```bash
cd /tmp/r22b-dev/frontend/implementation
node -v  # Must be Node >= 22 (Node 20 fails on crypto.subtle.digest in jsdom)
npm ci

# Gate 1: TypeScript & ESLint
npx tsc --noEmit
npm run lint

# Gate 2: NUI Lab + Owner Build Manifest (must pass 23 files / 264 tests)
npx vitest run tests/nui-lab tests/owner-build-manifest.test.ts

# Gate 3: Gameplay regression baseline (must remain 39/48 PASS, 9/48 FAIL, identical to main@745bb6d)
npx vitest run tests/input/hand-stroke-surface.test.ts tests/input/two-hand-surface.test.ts tests/input/eraser-controls.test.ts
```

---

## 3. Production Static Build for DEV (No Code Branch Push)

```bash
cd /tmp/r22b-dev/frontend/implementation
RESEARCH_SHA=$(git -C /path/to/research-can rev-parse HEAD)

NEXT_PUBLIC_TEST_HOOKS=0 \
NEXT_PUBLIC_GIT_COMMIT="$RESEARCH_SHA" \
NEXT_PUBLIC_GIT_BRANCH="research-can/r22b-handstate" \
NEXT_PUBLIC_APP_VERSION="0.29.1-alpha+r22b" \
npm run build

# Verify version badge in static output
grep -o "0.29.1-alpha+r22b" out/nui-lab.html | head -n 1
```

- **Do NOT push any branch from `/tmp/r22b-dev`.**
- Serve `frontend/implementation/out/` via the DEV Caddy static server.
