from pathlib import Path
from datetime import datetime
import argparse, re, uuid

root = Path(__file__).resolve().parents[2]
allowed = {"contexts","decisions","facts","handoffs","lessons","notes","preferences","runbooks"}
ap = argparse.ArgumentParser(description="Create-only ECC-compatible TEAM memory fallback.")
ap.add_argument("kind", choices=sorted(allowed))
ap.add_argument("title")
ap.add_argument("body")
args = ap.parse_args()
secret_patterns = [r"(?i)api[_-]?key\\s*[:=]", r"(?i)password\\s*[:=]", r"-----BEGIN .*PRIVATE KEY-----"]
if any(re.search(p, args.body) for p in secret_patterns):
    raise SystemExit("Refusing to store secret-like content.")
now = datetime.now().astimezone().isoformat(timespec="seconds")
slug = re.sub(r"[^a-z0-9]+","-",args.title.lower()).strip("-")[:50]
mid = "mem_" + datetime.now().strftime("%Y%m%d") + "_" + uuid.uuid4().hex[:8]
dest = root / ".ecc" / "memory" / "team" / args.kind / f"{mid}_{slug}.md"
dest.parent.mkdir(parents=True, exist_ok=True)
kind_value = args.kind[:-1] if args.kind.endswith("s") else args.kind
title = args.title.replace(chr(34), chr(39))
content = "\n".join([
    "---",
    'schema: "ecc.memory.v1"',
    f'id: "{mid}"',
    f'title: "{title}"',
    f'kind: "{kind_value}"',
    'scope: "team"',
    'trust: "unreviewed"',
    'status: "active"',
    'source_harness: "fallback"',
    'target_harnesses: ["all"]',
    "tags: []",
    "links: []",
    f'created_at: "{now}"',
    f'updated_at: "{now}"',
    "---",
    "",
    args.body,
    ""
])
dest.write_text(content, encoding="utf-8")
print(dest)
