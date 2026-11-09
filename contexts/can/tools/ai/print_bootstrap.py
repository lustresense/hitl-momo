from pathlib import Path
import argparse
root = Path(__file__).resolve().parents[2]
files = ["AGENTS.md","SOURCE_OF_TRUTH.md","PROJECT_MEMORY.md","WORKING_CONTEXT.md","docs/team/TEAM_OPERATING_MODEL.md"]
ap = argparse.ArgumentParser()
ap.add_argument("--full", action="store_true")
args = ap.parse_args()
if args.full:
    files = ["INSTRUCTION.md","CHANGELOG.md"] + files
for rel in files:
    p = root / rel
    print(f"\n===== {rel} =====\n")
    print(p.read_text(encoding="utf-8") if p.exists() else "[MISSING]")
