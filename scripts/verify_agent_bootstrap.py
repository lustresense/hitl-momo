#!/usr/bin/env python3
"""Read-only structural check for portable agent instructions. No runtime agent guarantee."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
REQUIRED=[
"AGENTS.md","contexts/can/AGENTS.md","contexts/dias/AGENTS.md",
"contexts/can/SOUL.md","contexts/can/DECISIONS.md","contexts/can/SOURCE_OF_TRUTH.md",
"contexts/can/NOW.md","contexts/can/REVISIONS.md","contexts/can/WORKING_CONTEXT.md",
"contexts/can/PROJECT_MEMORY.md","contexts/can/project/OWNER_MANDATES.md",
"contexts/can/docs/team/TEAM_OPERATING_MODEL.md","contexts/can/docs/team/ROLE_PROTOCOL.md",
"contexts/can/SESSION_HANDOFF.md","frontend/implementation/AGENTS.md",
"frontend/implementation/docs/execution/ARCHITECTURE_ACTUAL.md",
"frontend/implementation/docs/execution/RUN_GUIDE.md",
"README.md","docs/architecture/README.md","contracts/README.md",
"contracts/API_INVENTORY.md","VERSION","CHANGELOG.md",
]
RULES=[
"contexts/can/.agents/rules/00-project-bootstrap.md",
"contexts/can/.agents/rules/memory-policy.md",
"contexts/can/.agents/rules/runtime-role.md",
"contexts/can/.agents/rules/security-boundaries.md",
"contexts/can/.agents/rules/source-authority.md",
"contexts/can/.agents/rules/team-boundaries.md",
".agents/rules/00-owner-router.md",
]
issues=[]
for name in REQUIRED:
 if not (ROOT/name).is_file(): issues.append("Missing path "+name)
root=(ROOT/"AGENTS.md").read_text()
for name in ["contexts/can/AGENTS.md","contexts/dias/AGENTS.md"]:
 if name not in root: issues.append("Missing router "+name)
can=(ROOT/"contexts/can/AGENTS.md").read_text()
for name in ["contexts/can/SOUL.md","contexts/can/DECISIONS.md","contexts/can/SESSION_HANDOFF.md"]:
 if name not in can: issues.append("Missing CAN bootstrap "+name)
for name in RULES:
 p=ROOT/name
 if not p.is_file(): issues.append("Missing rule "+name);continue
 lines=p.read_text().splitlines()
 if not lines or lines[0]!="---" or "---" not in lines[1:]: issues.append("Missing YAML "+name);continue
 metadata=lines[1:lines[1:].index("---")+1]
 if "trigger: always_on" not in metadata: issues.append("Invalid trigger "+name)
if issues:
 print("FAILED agent bootstrap structural check")
 for issue in issues: print("-",issue)
 sys.exit(1)
print(f"OK agent bootstrap: {len(REQUIRED)} paths, {len(RULES)} rules, CAN and DIAS routing")
