#!/usr/bin/env python3
"""Build the per-file migration manifest for MuhammadDias/HITL -> lustresense/hitl-momo.

Every Git-tracked file of the Dias source commit gets exactly one final status. Comparison is by
Git blob SHA (byte-exact) and, for line-ending-only differences, by content with CRLF->LF.

Usage (from monorepo root, with a Dias clone available):
    python3 docs/migration/dias-94120d4/build_manifest.py <dias_repo> <dias_sha> <base_sha> <target_ref> <out_csv>
Example:
    python3 docs/migration/dias-94120d4/build_manifest.py ../HITL 94120d4 81bab5e HEAD \
        docs/migration/dias-94120d4/MANIFEST.csv
"""
import csv
import subprocess
import sys
from collections import Counter, defaultdict

dias_repo, dias_sha, base_sha, target_ref, out_csv = sys.argv[1:6]
ARCHIVE = "contexts/dias/archive/source-94120d4/files-not-in-monorepo.tar.gz"
FE_PATCH = "contexts/dias/archive/source-94120d4/frontend-implementation-dias-delta-81bab5e..94120d4.patch"


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True).stdout


def tree(repo, ref):
    out = {}
    for line in git(repo, "ls-tree", "-r", "-z", ref).split(b"\0"):
        if line:
            meta, path = line.split(b"\t", 1)
            out[path.decode()] = meta.split()[2].decode()
    return out


def blob(repo, sha):
    return git(repo, "cat-file", "blob", sha)


dias = tree(dias_repo, dias_sha)
target = tree(".", target_ref)
by_sha = defaultdict(list)
for p, s in target.items():
    by_sha[s].append(p)
delta = set(git(dias_repo, "diff", "--name-only", "--no-renames", base_sha, dias_sha).decode().split("\n")) - {""}

# Decisions taken during the migration (path -> (category, target, evidence)).
ADAPTED = {
    "backend/app/main.py": "Merged: kept monorepo CORS_ORIGINS, MAX_PREDICT_POINTS, version; added optional levelId + difficulty behind AI_DIFFICULTY_ENABLED (default off).",
    "backend/app/db.py": "Merged: kept monorepo student_sessions + _migrate(); added level_difficulty table (additive).",
    "backend/app/dashboard.py": "Dias version + 'active' flag in GET /api/settings/difficulty.",
    "backend/app/difficulty.py": "Dias version + difficulty_enabled() feature flag.",
    "frontend/admin/lib/api.ts": "Dias version + DifficultySettings.active.",
    "frontend/admin/app/(dashboard)/kesulitan/page.tsx": "Dias version + banner when the backend flag is off.",
    "backend/tests/blackbox.py": "Dias version; case 7 now sends Bearer student_session_token + submission_key (current contract).",
    ".gitignore": "Monorepo .gitignore kept; Dias additions .train-home/ and .eval-home/ appended.",
}
CONTEXT_DOCS = {
    "DEPLOY.md": "contexts/dias/docs/DEPLOY.md",
    "CHANGELOG.md": "contexts/dias/docs/CHANGELOG-dias.md",
    "README.md": "contexts/dias/docs/README-dias.md",
    "docs/DIAGRAM.md": "contexts/dias/docs/DIAGRAM.md",
    "docs/DOKUMENTASI-TEKNIS.md": "contexts/dias/docs/DOKUMENTASI-TEKNIS.md",
    "docs/USULAN-LABEL-LEVEL.md": "contexts/dias/docs/USULAN-LABEL-LEVEL.md",
}
NOT_PORTED = {
    "docker-compose.yml": "Only Dias change is NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1, which would activate per-level difficulty input from the game. Not enabled without Can+Dias approval.",
}

rows, counts = [], Counter()
for path in sorted(dias):
    sha = dias[path]
    tgt_sha = target.get(path)
    if tgt_sha == sha:
        cat, tgt, ev = "1-IDENTICAL", path, "same blob SHA at same path"
    elif path in ADAPTED:
        cat, tgt, ev = "3-ADAPTED", path, ADAPTED[path] + f" Byte-exact original in {ARCHIVE}."
    elif path in CONTEXT_DOCS:
        t = CONTEXT_DOCS[path]
        same = target.get(t) and blob(".", target[t]).replace(b"\r\n", b"\n") == blob(dias_repo, sha).replace(b"\r\n", b"\n")
        cat, tgt = "4-ARCHIVED-DIAS-CONTEXT", t
        ev = ("content-identical copy" if same else "copy (see note)") + "; canonical monorepo doc not overwritten"
        if sha not in by_sha and path not in ("README.md",):
            ev += f"; byte-exact in {ARCHIVE}"
        if path == "README.md":
            ev += f"; byte-exact in {ARCHIVE}"
    elif path in NOT_PORTED:
        cat, tgt, ev = "4-ARCHIVED-NOT-ENABLED", ARCHIVE, NOT_PORTED[path]
    elif tgt_sha and blob(".", tgt_sha).replace(b"\r\n", b"\n") == blob(dias_repo, sha).replace(b"\r\n", b"\n"):
        cat, tgt = "2-INTEGRATED", path
        ev = "content-identical after CRLF->LF normalisation (.gitattributes *.py eol=lf)" + (
            f"; byte-exact in {ARCHIVE}" if path in delta or sha not in by_sha else "")
    elif sha in by_sha:
        cat, tgt, ev = "1-IDENTICAL-RELOCATED", by_sha[sha][0], "same blob SHA at another monorepo path"
    elif path.startswith("frontend/implementation/") and path in delta:
        cat, tgt = "4-ARCHIVED-CAN-AREA", FE_PATCH
        ev = f"Dias edit to Can-owned code; not ported (needs Can approval). Byte-exact in {ARCHIVE}"
    elif path not in delta and tgt_sha:
        cat, tgt = "4-HISTORICAL-DIVERGENCE", path
        ev = (f"Dias did not change this since {base_sha}; the monorepo has since evolved it (newer version kept). "
              "Dias blob reachable in monorepo history" + (" (and in docs/history/dias/)" if sha in by_sha else ""))
    elif path.startswith("archive_unused/"):
        cat, tgt, ev = "4-ARCHIVED", ARCHIVE, "pre-v0.6 copy of a train script, superseded by train/; byte-exact in archive"
    else:
        cat, tgt, ev = "UNRESOLVED", "", "no rule matched"
    counts[cat] += 1
    rows.append([path, sha, cat, tgt, ev])

with open(out_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["dias_path", "dias_blob_sha", "category", "target_path", "evidence"])
    w.writerows(rows)

print(f"files={len(rows)}")
for k, v in sorted(counts.items()):
    print(f"{k}={v}")
sys.exit(1 if counts.get("UNRESOLVED") else 0)
