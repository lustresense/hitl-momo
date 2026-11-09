from pathlib import Path
import sys, re
root = Path(__file__).resolve().parents[2]
required = [
    "INSTRUCTION.md","CHANGELOG.md","SOURCE_OF_TRUTH.md","AGENTS.md",
    "PROJECT_MEMORY.md","WORKING_CONTEXT.md",
    "docs/team/TEAM_OPERATING_MODEL.md","docs/team/ROLE_PROTOCOL.md",
    ".ops/README.md",".ecc/README.md"
]
problems=[]
for rel in required:
    if not (root/rel).exists():
        problems.append(f"MISSING: {rel}")
legacy = [p.name for p in root.iterdir() if p.is_dir() and re.match(r"^\d\d_", p.name)]
if legacy:
    problems.append("Legacy numbered top-level dirs: " + ", ".join(legacy))
for p in root.rglob("~$*"):
    problems.append(f"Office temp file: {p.relative_to(root)}")
if problems:
    print("\n".join(problems))
    sys.exit(1)
print("OK: control layer, team protocol, and top-level migration checks passed.")
