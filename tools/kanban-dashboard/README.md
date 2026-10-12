# Hermes Kanban Read-Only Dashboard

A lightweight, zero-dependency read-only Kanban dashboard for visualizing tasks across multiple Hermes Kanban databases (`Default`, `AIRS Exhibition v7`, and `Sketchbook Universe v2`).

## Architecture & Security Model

- **Runtime:** Python 3 standard library (`http.server`, `sqlite3`, `urllib`, `hashlib`, `secrets`, `hmac`). Zero third-party dependencies.
- **Fail-Closed Loopback Binding:** The server strictly enforces binding only to loopback (`127.0.0.1`, `localhost`, `::1`). Any attempt to bind to non-loopback addresses (e.g. `0.0.0.0`, public IPs) raises a `ValueError` at startup, preventing accidental public exposure.
- **Client IP Verification:** Inbound requests are checked against loopback origin (`127.0.0.1`, `::1`, `localhost`). Non-loopback clients are denied with `403 Forbidden`.
- **First-Run Password Setup & Secure Session Auth:**
  - **One-Time Setup Gate:** When no admin password exists, opening the dashboard presents a one-time admin setup form.
  - **Cryptographic Storage:** Only a strong salted password hash is stored. Uses Python standard library `hashlib.scrypt` (OWASP recommended parameters: `N=16384`, `r=8`, `p=1`, `maxmem=32MB`, `dklen=32`) with a cryptographically random 16-byte salt (`secrets.token_bytes(16)`). Plaintext passwords are NEVER stored or logged.
  - **Atomic File Creation & Concurrency Race Defense:** The password hash is stored outside the repository and static tree (`~/.hermes/kanban_dashboard_auth.json` or `KANBAN_AUTH_STORE`). Parent directory is restricted to `0700` and file to `0600`. File creation uses `os.O_CREAT | os.O_EXCL | os.O_WRONLY` so concurrent setup races fail closed with `409 Conflict`.
  - **Permanent Setup Closure:** Once password hash is established, `/api/auth/setup` is permanently disabled (returns `409 Conflict`). There is no public password reset endpoint.
  - **Fail-Closed Corrupt Store Defense:** If the auth store file exists but is corrupted, unparseable, or invalid, the server fails closed (`500 Internal Server Error`) and refuses setup or login until manual admin recovery.
  - **Constant-Time Verification:** Password comparison uses `hmac.compare_digest` to prevent timing side-channel attacks.
  - **Brute-Force Rate Limiting:** Failed login attempts are throttled via in-memory rate limiting (`LoginRateLimiter`) with bounded exponential delay and temporary lockout, without leaking whether credentials exist.
  - **Secure Session Cookie:** Successful setup or login issues a cryptographically random session token (`secrets.token_urlsafe(32)`) via `Set-Cookie`:
    - `HttpOnly` (inaccessible to JavaScript, defending against token theft)
    - `SameSite=Strict` (prevents cross-site request forgery)
    - `Path=/`
    - `Secure` (enforced when accessed over HTTPS or `X-Forwarded-Proto: https`, or `KANBAN_COOKIE_SECURE=1`)
    - Bounded lifetime (default: 12 hours) with session rotation on login.
  - **CSRF Defense:** State-changing auth endpoints (`/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`) fail closed if the `Origin` header is missing, malformed, or untrusted. All state-changing auth requests strictly require a valid active session and matching `X-CSRF-Token` header validated with constant-time `hmac.compare_digest`.
  - **Auth Store Integrity & Permission Verification:**
    - Checks POSIX file mode (`0600`, no group/world read/write access) and file ownership (`UID == current process UID`).
    - Verifies schema, strict `version: 1`, and `kdf: scrypt`.
    - Strictly bounds KDF parameters before derivation (`n` power of 2 between 1024 and 65536, `r` 1..16, `p` 1..4, `maxmem` 1MB..64MB, `dklen` 32..64) to prevent CPU/memory exhaustion attacks.
    - Validates salt and hash hex formatting and exact expected lengths. Any malformed or tampered local store fails closed (`500 Internal Server Error`).
  - **Bounded & Auto-Pruned Rate Limiting:**
    - `LoginRateLimiter` enforces `max_entries: 1000` cap and purges expired entries (`failure_ttl: 300s`) to prevent unbounded memory growth from IP-spoofed requests.
  - **Bearer Token Backward Compatibility:** Programmatic CLI and automated test requests may also authenticate via `Authorization: Bearer *** when `KANBAN_AUTH_TOKEN` is configured.
- **Method-Wide Gate & Security Headers:**
  - Every HTTP method (including `HEAD`, `OPTIONS`, `TRACE`, mutation methods, and arbitrary unsupported methods) requires authentication before receiving any application or method response.
  - Unauthenticated requests return `401 Unauthorized` (or serve data-free login shell on root/static GET).
  - Authenticated requests with unsupported methods return controlled `405 Method Not Allowed` (`HEAD` returns 405 without a body).
  - Protocol errors (`send_error`) and parser errors return structured JSON errors with no HTML stack traces or internal server details.
  - Every response across all methods and error paths carries:
    - `Cache-Control: no-store` (prevents caching of data or credentials)
    - `Referrer-Policy: no-referrer` (prevents token or path leakage via Referer headers)
    - `X-Content-Type-Options: nosniff`
  - Request headers and query strings are never logged to console/logs.
- **Reverse Proxy & Cloudflare Access Outer Gate Policy:**
  - The Kanban server origin MUST remain bound to loopback only and unreachable from the public internet.
  - **CRITICAL ROLLOUT GATE (Unverified):** Do NOT deploy, tunnel, or expose this service publicly. Cloudflare Access, ingress allowlists, and DNS/tunnel configurations remain unverified. First-run setup and auth flows MUST remain private and loopback-only.
  - The local service does not validate raw Cloudflare Access assertions and requires its own local password/session gate regardless of outer proxying.
- **SQLite Strict Read-Only Mode:** Databases are opened with URI `file:<path>?mode=ro` and `PRAGMA query_only = ON`. Any SQL write operation is rejected with `sqlite3.OperationalError`.
- **Pagination Validation & Hard Ceiling:**
  - `limit`: integer, strictly between `1` and `100` (default: 50).
  - `offset`: integer, strictly between `0` and `10000` (default: 0).
  - Malformed, negative, or oversized pagination parameters are rejected with `400 Bad Request`.
- **Explicit Response Field Allowlist:**
  - Response objects are constructed strictly from approved UI fields.
  - Excluded sensitive fields: `body`, `workspace_path`, `branch_name`, `claim_lock`, `claim_expires`, `worker_pid`, `last_failure_error`, `idempotency_key`, `result`, `skills`, `model_override`, `provider_override`, `session_id`, `current_run_id`, `tenant`, `consecutive_failures`, `block_recurrences`, raw `metadata`, `payload`, and `comments`.
- **Frontend Safe DOM:** Pure vanilla HTML, CSS, and JS.
  - Zero `innerHTML` usage. All dynamic content is rendered using `textContent` and `createElement`.
  - Zero storage of credentials in `localStorage`, `sessionStorage`, `document.cookie`, or URL query/hash parameters.

## Endpoints

### Authentication & Static Routes
- `GET /` — Serves static data-free login and setup shell (`index.html`).
- `GET /static/<filename>` — Serves static data-free assets (`style.css`, `app.js`). Path traversal is blocked.
- `GET /api/auth/status` — Returns auth state: `{"setup_required": bool, "authenticated": bool, "csrf_token": str}` with zero Kanban data.
- `POST /api/auth/setup` — One-time admin password creation. Permanently disabled (409) once configured.
- `POST /api/auth/login` — Verifies admin password, rotates session, and sets `kanban_session` cookie. Throttles brute force.
- `POST /api/auth/logout` — Destroys server-side session and clears `kanban_session` cookie.

### Protected Board APIs
All board endpoints require an authenticated session cookie or `Authorization: Bearer ***

- `GET /api/boards` — Returns list of allowed boards with live status counts (`slug`, `label`, `counts`, `total`, `available`).
- `GET /api/boards/<slug>/tasks` — Returns paginated tasks with allowlisted fields:
  - Allowed fields: `id`, `title`, `assignee`, `status`, `priority`, `block_kind`, `created_at`, `completed_at`.
  - Query parameters: `status`, `assignee`, `search`, `limit` (1-100), `offset` (0-10000).
- `GET /api/boards/<slug>/tasks/<task_id>` — Returns task detail along with allowlisted run history (`id`, `profile`, `status`, `duration_s`) and event timeline (`id`, `kind`, `created_at`).
- `GET /api/boards/<slug>/assignees` — Returns distinct assignees for filter dropdown.
- Mutation methods (`PUT`, `DELETE`, `PATCH`, and `POST` on non-auth routes) return `405 Method Not Allowed`.

## Local Bootstrap & Recovery Procedure

### 1. First-Run Setup (Browser)
1. Start the server locally:
   ```bash
   python3 tools/kanban-dashboard/server.py 9200
   ```
2. Open `http://127.0.0.1:9200/` in your browser.
3. If no password has been configured, the "Create Admin Password" modal will appear automatically.
4. Enter an admin password (minimum 8 characters) and confirm it.
5. The password hash is atomically persisted to `~/.hermes/kanban_dashboard_auth.json` and the session is authenticated immediately.

### 2. Admin Password Recovery / Reset
Because public password resets are intentionally disallowed to prevent account takeover:
1. Log in to the host machine via local console/SSH.
2. Stop the dashboard server.
3. Delete the auth store file:
   ```bash
   rm -f ~/.hermes/kanban_dashboard_auth.json
   ```
4. Restart the server. First-run setup will be re-enabled.

## Running Tests

Run the full automated test suite:

```bash
python3 -m unittest discover -s tools/kanban-dashboard/tests -p 'test_*.py' -v
```

Run loopback acceptance verification:

```bash
python3 tools/kanban-dashboard/tests/verify_loopback.py
```
