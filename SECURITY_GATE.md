# Deterministic Security Gate Implementation Specification
**Document ID:** `SPEC-SECURITY-GATE-002` (Revision 2 — Post-Audit Hardened Architecture)  
**Target:** Autonomous Multi-Agent Engineering Systems & Hermes Kanban Lifecycle  
**Enforcement Model:** External Trusted Host/Container Verification > Prompt-Only Behavioral Instructions  
**Philosophy:** Zero-trust worker outputs, verifiable evidence, automated adversarial testing, fail-closed defaults, exact-commit binding.

---

## 1. Executive Summary & Trust Architecture

This document establishes the canonical, deterministic security verification protocol for automated implementations, pull requests, and autonomous agent tasks.

### 1.1 Non-Circular Trust Principle
Security verification mechanisms must **never reside in the write-scope or trust domain of the worker agents being evaluated**.
1. **External Trusted Verifier (`/opt/hermes-security/`):** The core verifier binary, tamper definitions, canonical Opengrep rulepacks, and baseline invariant checkers are hosted outside the repository workspace in a host-owned, read-only directory (or an immutable, cryptographically pinned container image).
2. **Worker Isolation:** Worker A (Implementer) and Worker B (Adversarial Author) operate exclusively inside disposable, unprivileged sandboxes with zero write access to `/opt/hermes-security/` and no external network egress.
3. **Repository Scope:** The repository contains only project-specific configuration (`.security/project.yml`), project-specific invariant tests, and optional local exception manifests. Before executing any repository-level tests, the trusted external verifier validates the integrity of these files against tampering.

---

## 2. Risk Classification Engine

Every task execution or pull request is categorized into a risk tier based on deterministic AST and file path analysis of its diff against the integration target (`main` or `can`).

```
                    git diff --name-only <target>
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │  Matches any HIGH path/content pattern?       │
        └──────┬────────────────────────────────┬──────┘
              YES                              NO
               │                                │
               ▼                                ▼
        ┌──────────────┐         ┌──────────────────────────────┐
        │  Tier: HIGH  │         │  Matches pure LOW whitelist? │
        └──────────────┘         └──────┬────────────────┬──────┘
                                       YES              NO
                                        │                │
                                        ▼                ▼
                                 ┌─────────────┐  ┌────────────────┐
                                 │  Tier: LOW  │  │ Tier: UNKNOWN  │
                                 └─────────────┘  │ (Treat as HIGH)│
                                                  └────────────────┘
```

### 2.1 Risk Tiers

| Risk Tier | Definition | Verification Pipeline | Worker Model |
|---|---|---|---|
| **LOW** | Pure static presentation stylesheets or strictly non-executable documentation with zero exposure to auth, data, network boundaries, or LLM agent instructions. | Fast-path basic (Typecheck, normal tests, secret scan). | Worker A only. |
| **HIGH** | Modifications touching security boundaries, APIs, databases, authentication, encryption, dependencies, infrastructure, agent instructions, or executable docs. | Hot-path full (SAST, Invariants, Secrets, CVEs, Misconfig, Schemathesis) + Adversarial validation. | Worker A + Worker B (Adversarial). |
| **UNKNOWN** | Unclassified file types, ambiguous diffs, binary changes, or scanner evaluation failures. | **Treated strictly as HIGH** (Fail-closed). | Worker A + Worker B. |

### 2.2 Deterministic Path & Pattern Rules for Automatic `HIGH` Classification

A diff is automatically classified as **HIGH** if any modified or created file matches any of the following patterns:

```yaml
high_risk_patterns:
  # Agent Control-Plane & Instructions (Indirect Prompt Injection Vectors)
  - "**/AGENTS.md"
  - "**/CLAUDE.md"
  - "**/SOUL.md"
  - "**/.agents/**"
  - "**/.cursorrules"
  - "**/SKILL.md"
  - "**/skills/**"
  - "INSTRUCTION*"
  - "WORKING_CONTEXT*"

  # Authentication, Authorization, & Identity
  - "**/auth/**"
  - "**/login/**"
  - "**/session/**"
  - "**/*token*/**"
  - "**/*jwt*/**"
  - "**/permission/**"
  - "**/rbac/**"
  - "**/policy/**"
  
  # Cryptography & Key Management
  - "**/crypto/**"
  - "**/cipher/**"
  - "**/hash/**"
  - "**/key*/**"
  - "**/credentials/**"
  - "**/.env*"
  - "**/*.pem"
  - "**/*.key"
  
  # Data Persistence, Database, & Migrations
  - "**/db/**"
  - "**/database/**"
  - "**/migrations/**"
  - "**/sql/**"
  - "**/queries/**"
  - "**/orm/**"
  - "**/models/**"
  - "**/schema/**"
  
  # API, Network, & Ingress Boundaries
  - "**/routes/**"
  - "**/api/**"
  - "**/endpoints/**"
  - "**/proxy/**"
  - "**/gateway/**"
  - "**/cors.*"
  - "**/middleware/**"
  - "**/*openapi*.*"
  - "**/*swagger*.*"
  
  # System, Shell, & Process Execution
  - "**/exec/**"
  - "**/child_process/**"
  - "**/subprocess/**"
  - "**/upload/**"
  - "**/download/**"
  
  # Infrastructure, Container, & CI/CD
  - "Dockerfile*"
  - "docker-compose*.yml"
  - "container-*"
  - "**/.github/workflows/**"
  - "**/nginx/**"
  - "**/cloudflared/**"
  
  # Security Controls & Gate Tooling
  - "SECURITY*"
  - "**/security/**"
  - "**/.security/**"
  - "**/trivy*"
  - "**/opengrep*"
  - "**/semgrep*"
  
  # Dependency Manifests & Package Locks
  - "package.json"
  - "package-lock.json"
  - "pnpm-lock.yaml"
  - "requirements*.txt"
  - "pyproject.toml"
  - "Cargo.toml"
  - "Cargo.lock"
```

### 2.3 Strict & Narrow Whitelist for `LOW` Classification

In autonomous multi-agent environments, Markdown and vector graphics are active attack surfaces:
- `*.md` files can alter agent behavior (indirect prompt injection into agent context).
- `*.svg` files can contain embedded `<script>` tags, event handlers, and XML external entity (XXE) vectors.
- Localization JSON files can contain rendered HTML.

Therefore, a change is classified as **LOW** only if **100% of touched files** conform strictly to:
1. **Passive Documentation Only:** Readme/changelog/docs explicitly under `docs/` or `CHANGELOG.md` (strictly excluding any root files, instruction files, `.agents/**`, or security files).
2. **Pure Raster Media Assets:** `*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.ico` (verified as non-executable via magic bytes / MIME verification). **SVGs are strictly excluded and classified as HIGH/UNKNOWN.**
3. **Pure Presentation Stylesheets:** `*.css`, `*.scss` (verified free from external `url()` references, `@import`, or script execution expressions).
4. **Isolated Static Fixtures:** `tests/fixtures/mock_data.json` verified free of script tags or template delimiters.

*Any diff containing even one file outside this narrow list automatically promotes to UNKNOWN $\rightarrow$ HIGH.*

---

## 3. Security Invariants Specification & Residual Risk

Security invariants are non-negotiable architectural guarantees expressed as machine-enforceable rules and targeted tests.

### 3.1 Invariant Identifier Format
```
SEC-<DOMAIN>-<NUMBER>
```
Domains: `AUTHN`, `AUTHZ`, `TENANT`, `INPUT`, `CRYPTO`, `SECRET`, `CONTROL`.

### 3.2 Canonical Invariant Registry

| Invariant ID | Domain | Assertion / Invariant Rule | Enforcing Test / Mechanism |
|---|---|---|---|
| `SEC-AUTHZ-001` | Authorization | User/Actor cannot access, read, or mutate cross-tenant or peer workspace files. | `tests/security/test_tenant_isolation.*` |
| `SEC-AUTHZ-002` | Authorization | Administrative endpoints require verified root/admin role claims; zero default-allow. | `tests/security/test_rbac_matrix.*` |
| `SEC-INPUT-001` | Input Validation | Zero raw string interpolation in SQL/ORM queries; 100% parameterized queries. | Opengrep `rule.sql-injection` + Integration tests |
| `SEC-INPUT-002` | Input Validation | External JSON payloads must validate against strict Pydantic/Zod schemas; unknown fields stripped. | Schemathesis fuzzing + `tests/domain/validation.test.*` |
| `SEC-SECRET-001` | Secrets | Zero cleartext API keys, JWT secrets, or private keys committed in git history or diffs. | Trivy Secret Scanner (all severities) |
| `SEC-TENANT-001` | Isolation | File operations in agent tasks must be constrained to the authorized workspace root. | Sandbox mount limits + path canonicalization |
| `SEC-CONTROL-001`| Gate Integrity | Security scanner configurations, rule exclusions, and test suites cannot be altered by workers. | `/opt/hermes-security/bin/hermes-security verify --check-tampering` |

### 3.3 Honest Residual Risk Assessment: Invariant Completeness
**Known Blindspot:** Static analysis and invariant registries can deterministically enforce *existing* invariants. However, when new business features are introduced (e.g. "a teacher may view submissions for their own class, but not other classes"), automated systems cannot deterministically synthesize 100% of the required business domain invariants without human guidance.  
- **Mitigation:** Worker B (Red Team) is tasked with discovering and generating adversarial tests for novel domain boundaries.
- **Formal Boundary:** Invariant discovery completeness is mathematically unprovable for arbitrary business logic. The system acknowledges this as an accepted residual risk requiring periodic human architectural review.

---

## 4. Worker Separation & Adversarial Authoring

To eliminate conflict of interest, the engineering loop enforces a strict separation of duties between implementer and security verifier.

```
       [ Orchestrator ]
        │            │
        │ Spawns     │ Spawns (Parallel/Sequential)
        ▼            ▼
   ┌──────────┐ ┌──────────┐
   │ Worker A │ │ Worker B │ (Adversarial Author)
   │(Coder)   │ │(Red Team)│
   └────┬─────┘ └────┬─────┘
        │            │
        │ Modifies   │ Generates Attack Tests
        │ src/       │ tests/security/adversarial/
        │            │ (Read-only on src/)
        ▼            ▼
   ┌───────────────────────┐
   │ Execution Sandbox     │
   │ Both test suites run  │
   └──────────┬────────────┘
              │
              ├─► Worker B tests FAIL ──► Task returned to Worker A
              └─► All tests PASS      ──► Proceed to Gate Scan
```

### 4.1 Worker A (Implementer)
- **Role:** Implements requested features, refactors code, and fixes identified bugs.
- **Write Scope:** Restricted to product code (`src/`, `app/`, `components/`) and standard unit tests.
- **Forbidden:** Cannot modify `.security/`, `tests/security/`, scanner configurations, or ignore lists.

### 4.2 Worker B (Adversarial Security Author)
- **Trigger:** Dispatched automatically for any task categorized as **HIGH** or **UNKNOWN**.
- **Role:** Analyzes Worker A's diff with an adversarial mindset. Hypothesizes bypasses (IDOR, race conditions, edge-case injections, malformed unicode, boundary overflow) and implements executable red-team test cases.
- **Write Scope:** Strictly restricted to `tests/security/adversarial/`.
- **Read Scope:** Read-only access to production implementation files.
- **Strict Boundary:** **Worker B is physically blocked from editing production code (`src/*`).**

---

## 5. Security-Control Tampering & Quarantine Contract

### 5.1 Prohibited Tampering Actions
The system immediately halts and rejects tasks attempting to:
1. Insert inline suppression comments:
   - `nosemgrep`, `noopengrep`, `// nosemgrep:`, `# nosemgrep`
   - `trivy:ignore`, `trivy:skip`
   - `eslint-disable security/*`, `@ts-ignore` on security boundaries.
2. Edit scanner exclusion/allowlist files:
   - `.opengrepignore`, `.semgrepignore`, `.trivyignore`, `.gitignore` (for security files).
3. Lower severity thresholds in configurations.
4. Disable, comment out, delete, or mock security tests (`test.skip`, `it.skip`, `@pytest.mark.skip`, `xfail`).
5. Alter governance, invariant specs, or security gates.

### 5.2 Deterministic Tamper Detection Logic
The external trusted verifier checks the diff before any tests run:
```bash
git diff -U0 "$TARGET_BRANCH"..."$HEAD_COMMIT" | grep -E '^\+[ ]*(.*nosemgrep|.*noopengrep|.*trivy:ignore|.*eslint-disable[ ]+security)'
```

### 5.3 Read-Only Quarantine (No Auto-Revert)
**Critical Architectural Rule:** The security verifier is strictly **read-only**. It must never attempt to automatically revert files or mutate the git tree when tampering is detected.
- Mutating the tree destroys forensic evidence and can introduce secondary race conditions.
- On tamper detection, the verifier writes an evidence bundle (`tamper_evidence.json`), sets exit code `2`, and immediately locks the workspace in **QUARANTINE**.
- The orchestrator blocks the task and preserves the exact state for human review.

---

## 6. Execution Sandbox Architecture & TOCTOU Protection

### 6.1 TOCTOU (Time-of-Check to Time-of-Use) Mitigation: Exact-SHA Binding
Scanning a mutable working directory allows a compromised or concurrent worker process to alter source files after the scan passes but before the merge occurs.

To ensure mathematical consistency:
1. **Worker Completion:** When Worker A/B finishes, it creates a **local ephemeral git commit** on its branch (no remote push, zero egress):
   ```
   HEAD = abc1234def5678...
   ```
2. **Read-Only Verification:** The trusted external security gate mounts the repo and inspects **specifically commit `abc1234...` in a read-only state**.
3. **Verdict Signature:** Upon passing, the gate emits a structured verdict cryptographically bound to the exact commit SHA:
   ```json
   {
     "verified_commit": "abc1234def5678...",
     "base_commit": "9f8e7d6c5b4a...",
     "verdict": "PASS",
     "timestamp": "2026-10-04T08:30:00Z",
     "gate_version": "2.0.0",
     "rulepack_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
     "trivy_db_revision": "2026-10-04-06",
     "sandbox_image_digest": "sha256:7a8b9c..."
   }
   ```
4. **Orchestrator Enforcement:** The orchestrator is **only permitted to merge the commit matching `verified_commit`**. If `HEAD` deviates by even one byte, the verdict is null and void.

### 6.2 Host-Mounted Scanners & Offline Verification Sandbox
```
┌────────────────────────────────────────────────────────────┐
│ Host Environment (agentops / Orchestrator)                 │
│                                                            │
│   • Trusted Verifier: /opt/hermes-security/ (read-only)    │
│   • Cached Vulnerability DB: /var/cache/trivy/ (updated)   │
│                                                            │
│   ┌────────────────────────────────────────────────────┐   │
│   │ Verification Sandbox Container                     │   │
│   │                                                    │   │
│   │  • User: unprivileged (uid: 10001, gid: 10001)     │   │
│   │  • Root filesystem (/): READ-ONLY                  │   │
│   │  • Target Commit: MOUNTED READ-ONLY (abc1234...)   │   │
│   │  • Host Vulnerability DB: MOUNTED READ-ONLY        │   │
│   │  • Network Egress: 100% BLOCKED (0.0.0.0/0 DROP)   │   │
│   │  • Scratch /tmp: tmpfs rw,noexec,nosuid,size=512m  │   │
│   │  • Resource limits applied via container runner    │   │
│   └────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```
- **Zero In-Sandbox Downloads:** Vulnerability databases and SAST rules are maintained by an out-of-band host updater cronjob. The sandbox has zero outbound internet access.

---

## 7. Verification Pipelines & Deterministic Tool Syntax

### 7.1 Test Runner Abstraction (`.security/project.yml`)
To support diverse tech stacks (Next.js, TypeScript, Python, Rust) without brittle hardcoding, every repository declares an adapter:

```yaml
# .security/project.yml
version: "1.0"
project_type: "nextjs-typescript"

commands:
  typecheck: "npm run typecheck"
  normal_test: "npm test -- --run"
  invariant_test: "npx vitest run tests/security/"
  build: "npm run build"

api:
  has_api_routes: true
  require_api_schema: true               # Policy: BLOCK if API changes but schema is missing
  schema_path: "docs/openapi.yaml"       # Required for Schemathesis; null if unmanaged
  staging_base_url: "http://127.0.0.1:3000"
```

The verifier executes standard tests and security tests in **separate, isolated steps**:
1. `execute(project_config.commands.normal_test)`
2. `execute(project_config.commands.invariant_test)`

### 7.2 Opengrep Policy & Native Severity Mapping
Opengrep CLI outputs native severities: `INFO`, `WARNING`, `ERROR`.  
The trusted wrapper runs:
```bash
opengrep scan --json --config /opt/hermes-security/rules/ "$TARGET_FILES" > sast-report.json
```
**Parsing & Enforcement Rules:**
- `finding.severity == "ERROR"` $\rightarrow$ **HARD BLOCK (Exit 1)**.
- `finding.severity == "WARNING"` $\rightarrow$ **Policy Evaluation** (Blocks on HIGH-risk tier, warns on LOW tier).
- `finding.severity == "INFO"` $\rightarrow$ Recorded in audit telemetry.
- Any finding matching an unexpired entry in `.security/exceptions.json` is silenced.

### 7.3 Trivy Scanners: Secrets, CVEs, & Misconfigurations

1. **Secret Scanning (Zero Tolerance across all severities):**
   ```bash
   trivy fs --scanners secret --format json . > secrets-report.json
   ```
   *Policy:* **Any detected secret** (CRITICAL, HIGH, MEDIUM, LOW) triggers an immediate **HARD BLOCK (Exit 1)** unless explicitly registered in the exception manifest.

2. **Vulnerability Scanning (Lockfile & DB Revision Cached):**
   ```bash
   trivy fs --scanners vuln --severity HIGH,CRITICAL --cache-dir /opt/hermes-security/trivy-cache/ --format json . > vuln-report.json
   ```
   *Rescan Invalidation:* A rescan is triggered if either:
   - `hash(lockfile)` changes in the diff, OR
   - `trivy_db_revision` on the host has updated since the last recorded pass.

3. **Misconfiguration Scanning (IaC / Container):**
   Triggered whenever Dockerfile, compose, or k8s manifests are touched:
   ```bash
   trivy config --severity HIGH,CRITICAL --format json . > misconfig-report.json
   ```

### 7.4 Conditional Schemathesis Fuzzing
Schemathesis executes **only when both preconditions are satisfied**:
1. API endpoints or routing files are modified in the diff, **AND**
2. A valid, parseable OpenAPI specification is declared in `.security/project.yml`.

**Missing Schema Policy:** If API routes are modified but `schema_path` is missing or invalid, and `require_api_schema: true`, the pipeline triggers **HARD BLOCK (Exit 1)**. If `false`, it logs a **WARNING**.

**Modern CLI Syntax:**
```bash
schemathesis run "$SCHEMA_PATH" \
  --base-url "$STAGING_BASE_URL" \
  --checks all \
  --exitfirst
```
*Failure Condition:* Any unhandled HTTP 500 error or undocumented response code triggers **Exit 1**.

### 7.5 Slow-Path DAST: ZAP Baseline vs Active Scans
- **ZAP Baseline (Nightly / Passive):** Executes passive spider and checks security headers, cookie flags (Secure, HttpOnly, SameSite), and CORS headers. Emits non-blocking warnings to Kanban backlog.
- **ZAP Active Scan (Pre-Release / Ephemeral Staging):** Executes actual payload injection (SQLi, XSS, SSRF, path traversal) against an authenticated staging environment. Medium and High confidence findings trigger a release block.

---

## 8. Blocking Policy Matrix

| Finding Category | Conditions & Trigger Events | Pipeline Action | Kanban Outcome |
|---|---|---|---|
| **HARD BLOCK** | • Security control tampering detected in diff.<br>• Any secret/token detected (CRITICAL, HIGH, MEDIUM, LOW).<br>• Failing security invariant or adversarial test.<br>• Opengrep finding with native severity `ERROR`.<br>• Trivy detected fixable `CRITICAL`/`HIGH` dependency CVE.<br>• Trivy misconfiguration detected in Docker/IaC files.<br>• Schemathesis 500 Server Crash on valid schema input.<br>• Working tree does not match `verified_commit`. | Pipeline aborts immediately (Exit Code 1 or 2). Workspace quarantined. | Task returned to Worker A with failure logs. Merge strictly forbidden. |
| **WARNING** | • Opengrep `WARNING` findings on LOW risk tiers.<br>• Upstream unfixable CVE with no available vendor patch.<br>• ZAP Baseline missing non-critical HTTP headers.<br>• Expired exception grace notification (7 days prior). | Emits warning log. Does not halt pipeline. | Recorded in Kanban task metadata as technical debt. |
| **MANUAL / OWNER APPROVAL** | • Legitimate false positive requiring signed exception.<br>• Introduction of new runtime dependency package.<br>• Architectural change to auth/session primitives.<br>• Invariant specification modifications. | Halts automation safely. Requires cryptographic signature. | Task moved to `blocked` (`kind="needs_input"`). |

---

## 9. False-Positive & Exception Management

### 9.1 Exception Manifest (`.security/exceptions.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "exceptions": [
    {
      "id": "EXC-2026-001",
      "rule_id": "javascript.express.security.audit.xss.direct-response-write",
      "file_path": "src/components/canvas/export_debug.ts",
      "fingerprint": "a9f8e7d6c5b4a321...",
      "reason": "Internal canvas debug preview rendered purely in client-side memory without user-supplied HTML injection vectors.",
      "approved_by": "Farchan Deano (Owner)",
      "created_at": "2026-10-04T08:00:00Z",
      "expires_at": "2026-11-04T08:00:00Z"
    }
  ]
}
```

### 9.2 Exception Rules
1. **Fingerprint Binding:** In addition to `file_path`, each exception binds to an AST/token `fingerprint`. If the underlying code is modified, the exception is invalidated.
2. **Hard Expiration:** Maximum allowed exception duration is **30 days**. Expired entries immediately revert to active blocking vulnerabilities.
3. **Immutability by Workers:** The verifier pre-check rejects any diff where Worker A or B touched `.security/exceptions.json`.

---

## 10. Fail-Safe & Degraded State Semantics

```
┌────────────────────────────────────────────────────────┐
│ Scanner / Infrastructure Execution State               │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
     [ Critical Failure ]       [ Transient Outage ]
  • Missing scanner binary   • Staging host unreachable (slow path)
  • Syntax error in rules    • External telemetry sync offline
  • Corrupt sandbox image    • Non-critical doc formatter error
             │                           │
             ▼                           ▼
      ┌─────────────┐             ┌─────────────┐
      │ FAIL-CLOSED │             │  DEGRADED   │
      │ (HARD BLOCK)│             │ (WARN & LOG)│
      │ Exit Code 3 │             └─────────────┘
      └─────────────┘
```

1. **Fail-Closed Triggers (Hard Failure, Exit Code 3):**
   - Missing or unexecutable Opengrep / Trivy binaries.
   - Syntax error in rulepacks or `.security/project.yml`.
   - Ambiguous diff risk classification $\rightarrow$ Promoted to HIGH.
   - Container sandbox initialization error.
2. **Permitted Degraded States:**
   - Outdated local Trivy DB (if host updater temporarily delayed) $\rightarrow$ Scan proceeds using existing cached DB but appends a `DEGRADED_SCAN_WARNING`.

---

## 11. Threat Coverage & Residual Risk Matrix

| Threat Class | Primary Defending Control | Secondary / Defense-in-Depth | Residual Risk (Honest Assessment) |
|---|---|---|---|
| **SQL Injection (SQLi)** | Opengrep AST rule (`no-raw-sql`) | Parameterized ORM + Unit tests | High-complexity raw dynamic queries constructed across multiple disjoint helper functions. |
| **Dependency CVEs** | Trivy Vulnerability Scanner | Lockfile integrity verification | Zero-day vulnerabilities unknown to CVE databases at time of scan. |
| **Secret & Token Leaks** | Trivy Secret Scanner (all severities) | Git pre-commit entropy filters | Highly obfuscated, encrypted, or split tokens that evade regex entropy thresholds. |
| **Broken Access Control (IDOR/BOLA)** | Deterministic Invariant Tests (`SEC-AUTHZ-*`) | Worker B Adversarial test generation | Flaws in domain authorization logic that both Worker A and Worker B fail to conceptualize. |
| **Cross-Tenant / Cross-Workspace Data Leak** | Filesystem Sandbox mount isolation | Invariant tests (`SEC-TENANT-*`) | Kernel-level container breakout or local privilege escalation vulnerability. |
| **Malformed API Payloads** | Schemathesis property-based fuzzing | Strict Pydantic/Zod schema validation | Deep application state logic flaws triggered only after complex multi-step stateful business workflows. |
| **Web Runtime, Cookies, & Session Vulnerabilities** | OWASP ZAP (Slow-path DAST) | Next.js built-in security headers | ZAP Baseline does not find all active injection flaws; Active scan limited to paths covered by auth seed. |
| **Malicious Agent Command Execution** | Container Sandbox (non-root, read-only root, no egress) | Tirith security proxy | Legitimate commands executed with unintended destructive parameters inside the allowed workspace directory. |
| **Supply-Chain Malicious Packages** | Lockfile immutability + Trivy CVE scan | Strict outbound network egress denial | Brand new malicious packages (typosquatting) without CVEs will install if dependencies are updated without human review. |
| **New Business Invariant Omission** | Invariant Registry + Worker B | Mandatory Human Review on HIGH diffs | Automated systems cannot mathematically guarantee complete coverage of new domain business logic. |

---

## 12. Unified CLI Interface & Provenance Schema

The trusted executable resides at `/opt/hermes-security/bin/hermes-security`.

### 12.1 Command Syntax
```bash
/opt/hermes-security/bin/hermes-security verify [OPTIONS]

Options:
  --commit <SHA>          Target ephemeral commit SHA to verify (Mandatory)
  --base <target-ref>     Compare against base ref (Default: origin/main or origin/can)
  --mode <hot|slow|all>   Execution mode (Default: hot)
  --config <path>         Path to project config (Default: .security/project.yml)
  --json                  Output machine-readable JSON verdict
  --strict                Treat warnings as errors
```

### 12.2 Exit Codes
- `0`: **PASS** — Verified, all security invariants satisfied.
- `1`: **SECURITY_VIOLATION** — Vulnerability, failing test, secret leak, misconfiguration, or schema crash.
- `2`: **TAMPERING_DETECTED** — Security control mutation or suppression comment found (quarantine engaged).
- `3`: **INFRA_ERROR / INDETERMINATE** — Scanner execution failed, binary missing, or fatal runtime error (fail-closed).

### 12.3 Machine-Readable JSON Output Specification (Full Provenance)
```json
{
  "timestamp": "2026-10-04T08:35:00Z",
  "verified_commit": "abc1234def5678901234567890abcdef12345678",
  "base_commit": "9f8e7d6c5b4a32109876543210fedcba98765432",
  "risk_tier": "HIGH",
  "verdict": "FAIL",
  "exit_code": 1,
  "telemetry": {
    "verifier_version": "2.0.0",
    "opengrep_version": "1.0.0",
    "trivy_version": "0.58.0",
    "trivy_db_revision": "2026-10-04-06",
    "trivy_db_timestamp": "2026-10-04T06:00:00Z",
    "ruleset_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "config_hash": "b4a3c2d1e0f9...",
    "invariant_registry_hash": "8f7e6d5c4b3a...",
    "sandbox_image_digest": "sha256:7a8b9c1d2e3f...",
    "executed_commands": [
      "npm run typecheck",
      "npm test -- --run",
      "npx vitest run tests/security/",
      "opengrep scan --json ...",
      "trivy fs --scanners secret ...",
      "trivy fs --scanners vuln ...",
      "trivy config ..."
    ]
  },
  "summary": {
    "tampering_detected": false,
    "invariants_tested": ["SEC-INPUT-001", "SEC-SECRET-001"],
    "invariants_failed": ["SEC-INPUT-001"],
    "vulnerabilities_found": 1,
    "secrets_found": 0,
    "misconfigs_found": 0,
    "warnings": 0
  },
  "results": [
    {
      "step": "tamper_check",
      "status": "PASS"
    },
    {
      "step": "normal_test_suite",
      "status": "PASS"
    },
    {
      "step": "security_invariants",
      "status": "FAIL",
      "details": {
        "failed_tests": ["tests/security/adversarial/test_sqli_bypass.ts:test_filter_escape"]
      }
    },
    {
      "step": "opengrep_sast",
      "status": "FAIL",
      "findings": [
        {
          "rule_id": "rules.security.sql.raw-query-concatenation",
          "file": "src/domain/search.ts",
          "line": 84,
          "severity": "ERROR",
          "message": "Raw string concatenation detected in SQL query construction."
        }
      ]
    },
    {
      "step": "trivy_secret",
      "status": "PASS"
    },
    {
      "step": "trivy_vuln",
      "status": "PASS"
    },
    {
      "step": "trivy_misconfig",
      "status": "PASS"
    }
  ]
}
```

---

## 13. Kanban Integration Lifecycle Contract

```
              [ Worker Submits Ephemeral Commit SHA ]
                                │
                                ▼
       [ /opt/hermes-security/bin/hermes-security verify --commit SHA ]
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
    Exit Code: 0           Exit Code: 1           Exit Code: 2
   (PASS / CLEAR)       (SECURITY VIOLATION)   (TAMPERING DETECTED)
         │                      │                      │
         ▼                      ▼                      ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ kanban_complete  │   │ kanban_comment   │   │ kanban_block     │
│ Merge exact SHA  │   │ (Post findings)  │   │ (kind=capability)│
│ Move to Review   │   │ Return to worker │   │ Quarantine tree  │
└──────────────────┘   └──────────────────┘   └──────────────────┘
```

1. **On `Exit Code 0` (PASS):**
   - Orchestrator verifies that `git rev-parse HEAD` matches `verified_commit`.
   - Task advances to `ready_for_review` or merges exact SHA into target branch.
2. **On `Exit Code 1` (SECURITY VIOLATION):**
   - Orchestrator comments findings and returns task to Worker A.
3. **On `Exit Code 2` (TAMPERING DETECTED):**
   - Orchestrator engages quarantine, blocks Kanban card, and escalates directly to repository owner.

---

## 14. Canonical Verifier Execution Blueprint (`/opt/hermes-security/bin/hermes-security`)

```bash
#!/usr/bin/env bash
set -eo pipefail

COMMIT_SHA=""
BASE_REF="origin/main"
CONFIG_PATH=".security/project.yml"
MODE="hot"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT_SHA="$2"; shift 2 ;;
    --base) BASE_REF="$2"; shift 2 ;;
    --config) CONFIG_PATH="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$COMMIT_SHA" ]; then
  echo "FATAL: --commit <SHA> is required." >&2
  exit 3
fi

# Step 1: Read-Only Tamper Check on Exact Diff
echo "==> [Gate 1/8] Verifying Security Integrity (Anti-Tampering)..."
TAMPER_FINDINGS=$(git diff -U0 "$BASE_REF"..."$COMMIT_SHA" | grep -E '^\+[ ]*(.*nosemgrep|.*noopengrep|.*trivy:ignore|.*eslint-disable[ ]+security)' || true)
if [ -n "$TAMPER_FINDINGS" ]; then
  echo "TAMPER DETECTED: Illegal suppression tags identified." >&2
  echo "$TAMPER_FINDINGS" > /tmp/tamper_evidence.json
  exit 2
fi

# Step 2: Risk Tier Classification
RISK_TIER=$(python3 /opt/hermes-security/scripts/risk_classifier.py --commit "$COMMIT_SHA" --base "$BASE_REF")
echo "Risk Tier: $RISK_TIER"

# Step 3: Parse Project Adapter
TYPECHECK_CMD=$(yq e '.commands.typecheck' "$CONFIG_PATH")
NORMAL_TEST_CMD=$(yq e '.commands.normal_test' "$CONFIG_PATH")
INVARIANT_TEST_CMD=$(yq e '.commands.invariant_test' "$CONFIG_PATH")

# Step 4: Normal Regression Suite
echo "==> [Gate 2/8] Executing Normal Test Suite..."
eval "$TYPECHECK_CMD"
eval "$NORMAL_TEST_CMD"

# Step 5: Security Invariant Suite (for HIGH/UNKNOWN)
if [ "$RISK_TIER" != "LOW" ]; then
  echo "==> [Gate 3/8] Executing Security Invariant & Adversarial Tests..."
  eval "$INVARIANT_TEST_CMD"
fi

# Step 6: Opengrep SAST Scan with Native Severity Parsing
echo "==> [Gate 4/8] Executing Opengrep SAST..."
CHANGED_FILES=$(git diff --name-only "$BASE_REF"..."$COMMIT_SHA")
opengrep scan --json --config /opt/hermes-security/rules/ $CHANGED_FILES > /tmp/opengrep-out.json
python3 /opt/hermes-security/scripts/parse_opengrep.py /tmp/opengrep-out.json || exit 1

# Step 7: Trivy Secret & CVE & Misconfig
echo "==> [Gate 5/8] Executing Trivy Secret Scan (All Severities)..."
trivy fs --scanners secret --format json . > /tmp/trivy-secret.json
python3 /opt/hermes-security/scripts/parse_trivy_secrets.py /tmp/trivy-secret.json || exit 1

echo "==> [Gate 6/8] Executing Trivy Dependency CVE Scan..."
trivy fs --scanners vuln --severity HIGH,CRITICAL --cache-dir /opt/hermes-security/trivy-cache/ --format json . > /tmp/trivy-vuln.json || exit 1

if git diff --name-only "$BASE_REF"..."$COMMIT_SHA" | grep -E '(Dockerfile|docker-compose|\.ya?ml)'; then
  echo "==> [Gate 7/8] Executing Trivy Misconfiguration Scan..."
  trivy config --severity HIGH,CRITICAL --format json . > /tmp/trivy-misconfig.json || exit 1
fi

# Step 8: Conditional Schemathesis Fuzzing
HAS_API_DIFF=$(git diff --name-only "$BASE_REF"..."$COMMIT_SHA" | grep -E '(api/|routes/|controllers/)' || true)
SCHEMA_PATH=$(yq e '.api.schema_path' "$CONFIG_PATH")
REQUIRE_SCHEMA=$(yq e '.api.require_api_schema' "$CONFIG_PATH")

if [ -n "$HAS_API_DIFF" ]; then
  if [ -f "$SCHEMA_PATH" ]; then
    echo "==> [Gate 8/8] Executing Schemathesis API Fuzzing..."
    STAGING_URL=$(yq e '.api.staging_base_url' "$CONFIG_PATH")
    schemathesis run "$SCHEMA_PATH" --base-url "$STAGING_URL" --checks all --exitfirst
  elif [ "$REQUIRE_SCHEMA" = "true" ]; then
    echo "FATAL: API routes modified but required schema ($SCHEMA_PATH) is missing." >&2
    exit 1
  else
    echo "WARNING: API routes modified without OpenAPI schema. Skipping fuzzing."
  fi
fi

echo "VERDICT: SUCCESS. All deterministic gates passed."
exit 0
```

---

## 15. Operational Directives & Implementation Constraints

### 15.1 Implementation Constraints (Actual Host / Hermes Environment)
1. **Host-Owned Path Provisioning (`/opt/hermes-security/`):**  
   - *Constraint:* Installing and maintaining files under `/opt/` requires root/sudo access during initial setup.  
   - *Operational Mapping:* On systems where unprivileged agent runs without sudo, `/opt/hermes-security/` can be substituted with an immutable path owned by `root:root` with mode `755`, or packaged as a pinned container image digest (`ghcr.io/lustresense/hermes-security:v2.0.0@sha256:...`) executed via container runner.
2. **Offline Vulnerability DB Sync:**  
   - *Constraint:* Trivy database updates require WAN access, while worker verification sandboxes have zero egress.  
   - *Operational Mapping:* Host cronjob (`systemd timer`) pulls Trivy DB to `/var/cache/trivy/` nightly. The sandbox mounts this cache directory read-only.
3. **Local Ephemeral Commits:**  
   - *Constraint:* The working directory in some development environments may not be a full git checkout (e.g. tarball sync).  
   - *Operational Mapping:* The workspace must be initialized as a git worktree or lightweight git repo (`git init` + initial commit) so that ephemeral commit SHAs can be computed deterministically.
