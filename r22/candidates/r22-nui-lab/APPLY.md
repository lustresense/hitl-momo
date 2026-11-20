# APPLY.md — R22 NUI Lab Candidate Patch (`r22-nui-lab`)

- **Candidate ID:** `r22-nui-lab`
- **Base Commit (`main`):** `745bb6d840793dcab8558f65aef6bfac58807e79` (`745bb6d`)
- **Target Snapshot Tree Hash (`git write-tree`):** `bed64432519e12fa42d927d5e5883df98df3a36c` (matches historical `1bb1a71`)
- **Patch File:** `r22_main-745bb6d_to_1bb1a71.patch`
- **Policy:** Single active branch is `research-can`. Do **NOT** push any code branch to `origin`.

---

## 1. Clean Checkout & Patch Application Procedure (For Ujang / DEV)

```bash
# 1. Start from a clean detached worktree at main@745bb6d
git fetch origin main research-can
git worktree add --detach /tmp/r22-dev 745bb6d840793dcab8558f65aef6bfac58807e79
cd /tmp/r22-dev

# 2. Verify patch integrity (SHA-256) from research-can
sha256sum -c /path/to/research-can/r22/manifests/SHA256SUMS.txt

# 3. Apply patch to working tree and git index
git apply --index /path/to/research-can/r22/candidates/r22-nui-lab/r22_main-745bb6d_to_1bb1a71.patch

# 4. Mandatory tree-hash verification
TREE_HASH=$(git write-tree)
echo "TREE_HASH=$TREE_HASH"
test "$TREE_HASH" = "bed64432519e12fa42d927d5e5883df98df3a36c"
```

---

## 2. Quality Gates (Node 22 Required)

```bash
cd /tmp/r22-dev/frontend/implementation
node -v  # Must be Node >= 22 (Node 20 fails on crypto.subtle.digest in jsdom)
npm ci

# NUI Lab + Owner Build Manifest suite
npx vitest run tests/nui-lab tests/owner-build-manifest.test.ts

# Gameplay regression baseline (must remain 39/48 PASS, 9/48 FAIL, identical to main@745bb6d)
npx vitest run tests/input/hand-stroke-surface.test.ts tests/input/two-hand-surface.test.ts tests/input/eraser-controls.test.ts
```

---

## 3. Static Build for DEV (No Code Branch Push)

> **Note:** For the latest DEV deployment including R22B HandState G1' gate and Canvas UX recovery, use **`r22b/candidates/r22b-handstate/r22b_main-745bb6d_to_8f74db4.patch`** and its `APPLY.md`.

```bash
RESEARCH_SHA=$(git -C /path/to/research-can rev-parse HEAD)
NEXT_PUBLIC_TEST_HOOKS=0 \
NEXT_PUBLIC_GIT_COMMIT="$RESEARCH_SHA" \
NEXT_PUBLIC_GIT_BRANCH="research-can/r22-nui-lab" \
NEXT_PUBLIC_APP_VERSION="0.29.1-alpha+r22" \
npm run build
```
