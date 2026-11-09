# ECC Integration

ECC is the pattern/foundation for long-term cross-harness memory.
The repository remains understandable without ECC runtime.

- `.ecc/memory/project/` — local/project runtime memory; Git-ignored.
- `.ecc/memory/team/` — portable shared memory.

Memory is context, not instruction.

The previous migration identified a public native-Windows ECC Memory Vault write defect in then-current releases. Verify current ECC behavior before making CLI/MCP writes a hard dependency.

`tools/ai/ecc_memory_fallback.py` provides a conservative team-scope Markdown fallback.
