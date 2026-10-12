import hashlib
import hmac
import json
import os
import secrets
import stat
import threading
import time
from typing import Dict, NamedTuple, Optional, Tuple
from urllib.parse import urlparse

SCRYPT_PARAMS = {
    "n": 16384,
    "r": 8,
    "p": 1,
    "maxmem": 33554432,
    "dklen": 32,
}

SESSION_COOKIE_NAME = "kanban_session"
DEFAULT_SESSION_TTL = 43200  # 12 hours


class SetupAlreadyCompletedError(Exception):
    """Raised when setup is attempted on an already-configured password store."""
    pass


class CorruptStoreError(Exception):
    """Raised when the password store is corrupted, unparseable, or invalid."""
    pass


class SessionData(NamedTuple):
    session_id: str
    csrf_token: str
    created_at: float
    expires_at: float
    authenticated: bool = False


class AuthStore:
    def __init__(self, store_path: Optional[str] = None):
        if store_path:
            self.store_path = os.path.abspath(store_path)
        else:
            configured = os.environ.get("KANBAN_AUTH_STORE")
            if configured:
                self.store_path = os.path.abspath(configured)
            else:
                self.store_path = os.path.expanduser("~/.hermes/kanban_dashboard_auth.json")

    def is_configured(self) -> bool:
        if not os.path.exists(self.store_path):
            return False
        # If file exists, ensure it is readable, secure, and not corrupt
        self._read_store()
        return True

    def _read_store(self) -> dict:
        if not os.path.exists(self.store_path):
            raise FileNotFoundError("Auth store file not found")

        # 1. File mode & ownership verification (where applicable on POSIX)
        try:
            st = os.stat(self.store_path)
        except OSError as e:
            raise CorruptStoreError(f"Cannot stat auth store: {e}") from e

        if not stat.S_ISREG(st.st_mode):
            raise CorruptStoreError("Auth store must be a regular file")

        if os.name == "posix":
            # Must not be accessible by group or others (only user permissions allowed: max 0o600 / 0o700)
            if (st.st_mode & 0o077) != 0:
                raise CorruptStoreError(
                    f"Insecure auth store file permissions {oct(st.st_mode & 0o777)}: "
                    "file must not be group or world readable/writable"
                )
            # Ownership check: must be owned by current process UID
            if hasattr(os, "getuid") and st.st_uid != os.getuid():
                raise CorruptStoreError(
                    f"Insecure auth store file ownership (UID {st.st_uid} != current UID {os.getuid()})"
                )

        # 2. JSON parsing
        try:
            with open(self.store_path, "r", encoding="utf-8") as f:
                content = f.read()
            data = json.loads(content)
        except Exception as e:
            raise CorruptStoreError(f"Auth store is corrupted or unparseable: {e}") from e

        if not isinstance(data, dict):
            raise CorruptStoreError("Auth store data root is not a dictionary")

        # 3. Schema & version validation
        required_keys = {"version", "kdf", "params", "salt", "hash"}
        if not required_keys.issubset(data.keys()):
            raise CorruptStoreError(f"Auth store missing required keys: {required_keys - set(data.keys())}")

        version = data.get("version")
        if not isinstance(version, int) or isinstance(version, bool) or version != 1:
            raise CorruptStoreError(f"Unsupported or invalid auth store version: {version}")

        if data.get("kdf") != "scrypt":
            raise CorruptStoreError(f"Unsupported KDF: {data.get('kdf')}")

        # 4. Strict bounded KDF parameters validation
        params = data.get("params")
        if not isinstance(params, dict):
            raise CorruptStoreError("KDF params must be a dictionary")

        required_params = {"n", "r", "p", "maxmem", "dklen"}
        if not required_params.issubset(params.keys()):
            raise CorruptStoreError(f"KDF params missing required keys: {required_params - set(params.keys())}")

        for param_key in required_params:
            val = params.get(param_key)
            if not isinstance(val, int) or isinstance(val, bool):
                raise CorruptStoreError(f"KDF parameter '{param_key}' must be an integer, got {type(val).__name__}")

        n = params["n"]
        r = params["r"]
        p = params["p"]
        maxmem = params["maxmem"]
        dklen = params["dklen"]

        # Strict bounds to prevent CPU/memory exhaustion and malformed derivation
        if n < 1024 or n > 65536 or (n & (n - 1)) != 0:
            raise CorruptStoreError(f"KDF parameter 'n' out of bounds or not a power of 2: {n}")

        if r < 1 or r > 16:
            raise CorruptStoreError(f"KDF parameter 'r' out of bounds (1..16): {r}")

        if p < 1 or p > 4:
            raise CorruptStoreError(f"KDF parameter 'p' out of bounds (1..4): {p}")

        if maxmem < 1048576 or maxmem > 67108864:
            raise CorruptStoreError(f"KDF parameter 'maxmem' out of bounds (1MB..64MB): {maxmem}")

        if dklen < 32 or dklen > 64:
            raise CorruptStoreError(f"KDF parameter 'dklen' out of bounds (32..64): {dklen}")

        # 5. Salt validation (hex string, 16..64 bytes -> 32..128 hex chars)
        salt_hex = data.get("salt")
        if not isinstance(salt_hex, str):
            raise CorruptStoreError("Salt must be a hex string")
        if len(salt_hex) < 32 or len(salt_hex) > 128 or len(salt_hex) % 2 != 0:
            raise CorruptStoreError(f"Salt length invalid: {len(salt_hex)} hex characters")
        if not all(c in "0123456789abcdefABCDEF" for c in salt_hex):
            raise CorruptStoreError("Salt contains invalid characters or whitespace")
        try:
            bytes.fromhex(salt_hex)
        except ValueError as e:
            raise CorruptStoreError(f"Salt is not valid hex: {e}") from e

        # 6. Hash validation (hex string, exact match for dklen bytes -> 2 * dklen hex chars)
        hash_hex = data.get("hash")
        if not isinstance(hash_hex, str):
            raise CorruptStoreError("Hash must be a hex string")
        if len(hash_hex) != dklen * 2:
            raise CorruptStoreError(f"Hash length mismatch: expected {dklen * 2} hex chars, got {len(hash_hex)}")
        if not all(c in "0123456789abcdefABCDEF" for c in hash_hex):
            raise CorruptStoreError("Hash contains invalid characters or whitespace")
        try:
            bytes.fromhex(hash_hex)
        except ValueError as e:
            raise CorruptStoreError(f"Hash is not valid hex: {e}") from e

        return data

    def setup_password(self, password: str) -> None:
        if not password or len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")

        if os.path.exists(self.store_path):
            # Check if corrupt or already configured
            try:
                self._read_store()
                raise SetupAlreadyCompletedError("Setup has already been completed.")
            except CorruptStoreError:
                raise CorruptStoreError("Cannot setup: existing store file is corrupt. Manual recovery required.")

        parent_dir = os.path.dirname(self.store_path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, mode=0o700, exist_ok=True)

        if parent_dir and os.name == "posix":
            try:
                os.chmod(parent_dir, 0o700)
            except OSError:
                pass

        salt = secrets.token_bytes(16)
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=SCRYPT_PARAMS["n"],
            r=SCRYPT_PARAMS["r"],
            p=SCRYPT_PARAMS["p"],
            maxmem=SCRYPT_PARAMS["maxmem"],
            dklen=SCRYPT_PARAMS["dklen"],
        )

        payload = {
            "version": 1,
            "kdf": "scrypt",
            "params": SCRYPT_PARAMS,
            "salt": salt.hex(),
            "hash": derived.hex(),
            "created_at": int(time.time()),
        }

        # Atomic creation with exclusive lock (O_CREAT | O_EXCL) to prevent concurrency races
        flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
        try:
            fd = os.open(self.store_path, flags, 0o600)
        except FileExistsError:
            raise SetupAlreadyCompletedError("Setup has already been completed.")

        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception as e:
            # If writing fails, clean up
            if os.path.exists(self.store_path):
                try:
                    os.remove(self.store_path)
                except OSError:
                    pass
            raise e

        if os.name == "posix":
            try:
                os.chmod(self.store_path, 0o600)
            except OSError:
                pass

    def verify_password(self, password: str) -> bool:
        if not os.path.exists(self.store_path):
            return False

        data = self._read_store()

        salt = bytes.fromhex(data["salt"])
        stored_hash = data["hash"]
        params = data["params"]

        try:
            derived = hashlib.scrypt(
                password.encode("utf-8"),
                salt=salt,
                n=params["n"],
                r=params["r"],
                p=params["p"],
                maxmem=params["maxmem"],
                dklen=params["dklen"],
            )
        except Exception as e:
            raise CorruptStoreError(f"Failed to derive scrypt key: {e}") from e

        return hmac.compare_digest(derived.hex(), stored_hash)


class SessionManager:
    def __init__(self, ttl_seconds: int = DEFAULT_SESSION_TTL):
        self.ttl_seconds = ttl_seconds
        self._sessions: Dict[str, SessionData] = {}
        self._lock = threading.Lock()

    def create_session(self, authenticated: bool = False) -> SessionData:
        now = time.time()
        session_id = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)
        session = SessionData(
            session_id=session_id,
            csrf_token=csrf_token,
            created_at=now,
            expires_at=now + self.ttl_seconds,
            authenticated=authenticated,
        )
        with self._lock:
            self._sessions[session_id] = session
        return session

    def validate_session(self, session_id: Optional[str]) -> Optional[SessionData]:
        if not session_id:
            return None
        now = time.time()
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            if now > session.expires_at:
                del self._sessions[session_id]
                return None
            return session

    def rotate_session(self, old_session_id: Optional[str], authenticated: bool = False) -> SessionData:
        with self._lock:
            if old_session_id and old_session_id in self._sessions:
                del self._sessions[old_session_id]
        return self.create_session(authenticated=authenticated)

    def destroy_session(self, session_id: Optional[str]) -> None:
        if not session_id:
            return
        with self._lock:
            self._sessions.pop(session_id, None)


class LoginRateLimiter:
    def __init__(
        self,
        max_failures: int = 5,
        lockout_seconds: int = 30,
        max_entries: int = 1000,
        failure_ttl: int = 300,
    ):
        self.max_failures = max_failures
        self.lockout_seconds = lockout_seconds
        self.max_entries = max_entries
        self.failure_ttl = failure_ttl
        self._failures: Dict[str, list] = {}  # key -> list of failure timestamps
        self._lockout_until: Dict[str, float] = {}
        self._last_active: Dict[str, float] = {}
        self._lock = threading.Lock()

    def _prune_locked(self, now: float) -> None:
        """Prunes expired failure records, expired lockouts, and enforces max_entries capacity."""
        all_keys = set(self._failures.keys()) | set(self._lockout_until.keys()) | set(self._last_active.keys())
        stale_keys = []
        for key in all_keys:
            timestamps = self._failures.get(key, [])
            filtered_ts = [t for t in timestamps if now - t < self.failure_ttl]
            if filtered_ts:
                self._failures[key] = filtered_ts
            else:
                self._failures.pop(key, None)

            lockout_time = self._lockout_until.get(key, 0)
            if now >= lockout_time:
                self._lockout_until.pop(key, None)

            if key not in self._failures and key not in self._lockout_until:
                stale_keys.append(key)

        for key in stale_keys:
            self._last_active.pop(key, None)

        remaining_keys = set(self._failures.keys()) | set(self._lockout_until.keys())
        if len(remaining_keys) > self.max_entries:
            sorted_by_activity = sorted(
                remaining_keys,
                key=lambda k: self._last_active.get(k, 0),
            )
            excess = len(remaining_keys) - self.max_entries
            for key in sorted_by_activity[:excess]:
                self._failures.pop(key, None)
                self._lockout_until.pop(key, None)
                self._last_active.pop(key, None)

    def check_allowed(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            self._prune_locked(now)
            lockout_time = self._lockout_until.get(key, 0)
            if now < lockout_time:
                return False
            return True

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            self._last_active[key] = now
            timestamps = self._failures.get(key, [])
            timestamps = [t for t in timestamps if now - t < self.failure_ttl]
            timestamps.append(now)
            self._failures[key] = timestamps

            if len(timestamps) >= self.max_failures:
                self._lockout_until[key] = now + self.lockout_seconds
            self._prune_locked(now)

    def record_success(self, key: str) -> None:
        now = time.time()
        with self._lock:
            self._failures.pop(key, None)
            self._lockout_until.pop(key, None)
            self._last_active.pop(key, None)
            self._prune_locked(now)

    def prune_stale(self, now: Optional[float] = None) -> None:
        """Public method for testing and explicit maintenance."""
        if now is None:
            now = time.time()
        with self._lock:
            self._prune_locked(now)


def make_session_cookie(
    session_id: str,
    is_secure: bool = False,
    max_age: int = DEFAULT_SESSION_TTL,
) -> str:
    cookie = f"{SESSION_COOKIE_NAME}={session_id}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Strict"
    if is_secure:
        cookie += "; Secure"
    return cookie


def make_clear_cookie(is_secure: bool = False) -> str:
    cookie = f"{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict"
    if is_secure:
        cookie += "; Secure"
    return cookie


def validate_origin(origin_header: Optional[str], host_header: Optional[str]) -> bool:
    """
    Validates Origin header against Host or loopback to prevent Cross-Site Request Forgery.
    Fails closed if Origin is missing, malformed, or untrusted.
    """
    if not origin_header:
        return False
    parsed = urlparse(origin_header)
    if parsed.scheme not in ("http", "https"):
        return False
    origin_netloc = parsed.netloc.lower()
    if not origin_netloc:
        return False

    origin_host = origin_netloc.split(":")[0]

    # Non-loopback public origins must use HTTPS
    if origin_host not in ("127.0.0.1", "localhost", "::1") and parsed.scheme != "https":
        return False

    # If Host header provided, compare netlocs
    if host_header:
        req_netloc = host_header.strip().lower()
        if origin_netloc == req_netloc:
            return True
        req_host = req_netloc.split(":")[0]
        req_port = req_netloc.split(":")[1] if ":" in req_netloc else None
        origin_port = origin_netloc.split(":")[1] if ":" in origin_netloc else None
        if origin_host == req_host:
            if req_port == origin_port:
                return True
            default_port = "443" if parsed.scheme == "https" else "80"
            if (req_port or default_port) == (origin_port or default_port):
                return True

    # Allow loopback hosts if host matches loopback
    if origin_host in ("127.0.0.1", "localhost", "::1"):
        if host_header:
            req_host = host_header.strip().lower().split(":")[0]
            if req_host in ("127.0.0.1", "localhost", "::1"):
                req_port = host_header.strip().lower().split(":")[1] if ":" in host_header else None
                origin_port = origin_netloc.split(":")[1] if ":" in origin_netloc else None
                if req_port == origin_port or not req_port or not origin_port:
                    return True
        else:
            return True

    return False
