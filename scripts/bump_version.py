#!/usr/bin/env python3
"""Global version bump for the whole monorepo (Owner rule, AGENTS.md "Versioning").

One version for game, backend and admin. Run once per push, before committing:

  python3 scripts/bump_version.py --type Perbaikan --bump patch \
      --source "R11-15 / Owner 2026-11-12" --evidence "vitest 243/1894" \
      --change "Cincin cover menunggu kalimat bangun." [--change "..."]

  python3 scripts/bump_version.py --check     # all version fields agree with VERSION

It updates VERSION, frontend/implementation/package.json, frontend/admin/package.json,
backend/app/main.py (FastAPI version) and puts a new entry at the TOP of CHANGELOG.md.
Prints the new version; put it in the commit subject, e.g. "fix(cover): ... (0.12.4-alpha)".
"""
import argparse, datetime, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = ROOT / "VERSION"
PKGS = [ROOT / "frontend/implementation/package.json", ROOT / "frontend/admin/package.json"]
BACKEND = ROOT / "backend/app/main.py"
CHANGELOG = ROOT / "CHANGELOG.md"
TYPES = ["Fitur", "Perbaikan", "Tes", "Dokumen"]
PAT = re.compile(r"^(\d+)\.(\d+)\.(\d+)(-(alpha|beta))?$")


def read_version() -> str:
    return VERSION.read_text().strip()


def fields() -> dict:
    out = {str(p.relative_to(ROOT)): json.loads(p.read_text())["version"] for p in PKGS}
    m = re.search(r'FastAPI\([^)]*version="([^"]+)"', BACKEND.read_text())
    out[str(BACKEND.relative_to(ROOT))] = m.group(1) if m else None
    return out


def write_all(ver: str) -> None:
    VERSION.write_text(ver + "\n")
    for p in PKGS:
        raw = p.read_text()
        cur = json.loads(raw)["version"]
        p.write_text(raw.replace(f'"version": "{cur}"', f'"version": "{ver}"', 1))
    BACKEND.write_text(re.sub(r'(FastAPI\([^)]*version=")[^"]+(")', rf"\g<1>{ver}\g<2>", BACKEND.read_text(), count=1))


def next_version(cur: str, bump: str) -> str:
    m = PAT.match(cur)
    if not m:
        sys.exit(f"VERSION '{cur}' is not MAJOR.MINOR.PATCH[-alpha|-beta]")
    ma, mi, pa, label = int(m[1]), int(m[2]), int(m[3]), m[4] or ""
    return f"{ma}.{mi + 1}.0{label}" if bump == "minor" else f"{ma}.{mi}.{pa + 1}{label}"


def add_entry(ver: str, typ: str, source: str, evidence: str, changes: list) -> None:
    today = datetime.date.today().isoformat()
    s = CHANGELOG.read_text()
    entry = (f"## {ver} — {today} — {typ}\n\n**Sumber:** {source}\n\n**Perubahan:**\n"
             + "".join(f"- {c}\n" for c in changes)
             + f"\n**Commit:** commit berjudul `({ver})`\n\n**Bukti:** {evidence}\n\n---\n\n")
    head = s.index("## Daftar versi")
    first = s.index("\n## ", head + 5) + 1
    s = s[:first] + entry + s[first:]
    s = s.replace("|---|---|---|---|\n", f"|---|---|---|---|\n| {ver} | {today} | {typ} | `({ver})` |\n", 1)
    CHANGELOG.write_text(s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--type", choices=TYPES)
    ap.add_argument("--bump", choices=["minor", "patch"])
    ap.add_argument("--source")
    ap.add_argument("--evidence")
    ap.add_argument("--change", action="append", default=[])
    a = ap.parse_args()
    cur = read_version()
    if a.check:
        bad = {k: v for k, v in fields().items() if v != cur}
        if bad:
            sys.exit(f"out of sync with VERSION {cur}: {bad}")
        print(f"ok {cur}")
        return
    if not (a.type and a.bump and a.source and a.evidence and a.change):
        sys.exit("need --type --bump --source --evidence and at least one --change")
    ver = next_version(cur, a.bump)
    write_all(ver)
    add_entry(ver, a.type, a.source, a.evidence, a.change)
    print(ver)


if __name__ == "__main__":
    main()
