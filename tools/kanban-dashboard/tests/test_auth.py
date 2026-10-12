import http.client
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
from typing import Optional, Tuple, Dict, Any
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from auth import (
    AuthStore,
    SessionManager,
    LoginRateLimiter,
    SetupAlreadyCompletedError,
    CorruptStoreError,
    SCRYPT_PARAMS,
)
from server import create_server
from db import ALLOWED_BOARDS


class TestAuthModuleUnit(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.store_path = os.path.join(self.temp_dir, "auth_store.json")
        self.auth_store = AuthStore(self.store_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_store_initially_unconfigured(self):
        self.assertFalse(self.auth_store.is_configured())

    def test_setup_password_creates_secure_store_and_never_stores_plaintext(self):
        password = "super-secret-password-123"
        self.auth_store.setup_password(password)
        self.assertTrue(self.auth_store.is_configured())

        # Inspect stored file contents
        with open(self.store_path, "r", encoding="utf-8") as f:
            raw_content = f.read()
            data = json.loads(raw_content)

        # Plaintext password must NEVER exist in file
        self.assertNotIn(password, raw_content)
        self.assertEqual(data.get("version"), 1)
        self.assertEqual(data.get("kdf"), "scrypt")
        self.assertIn("salt", data)
        self.assertIn("hash", data)
        self.assertEqual(data.get("params"), SCRYPT_PARAMS)

        # Verify file permissions (0600 on POSIX)
        if os.name == "posix":
            mode = os.stat(self.store_path).st_mode & 0o777
            self.assertEqual(mode, 0o600)

    def test_setup_cannot_be_called_twice(self):
        self.auth_store.setup_password("password-one-123")
        with self.assertRaises(SetupAlreadyCompletedError):
            self.auth_store.setup_password("password-two-456")

    def test_setup_password_concurrency_race_safety(self):
        # Two threads attempting setup simultaneously on fresh store
        results = []

        def attempt_setup(pwd):
            try:
                self.auth_store.setup_password(pwd)
                results.append("success")
            except SetupAlreadyCompletedError:
                results.append("already_completed")
            except Exception as e:
                results.append(f"error:{type(e).__name__}")

        t1 = threading.Thread(target=attempt_setup, args=("thread-pwd-1",))
        t2 = threading.Thread(target=attempt_setup, args=("thread-pwd-2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly one must succeed, one must fail with already_completed
        self.assertEqual(sorted(results), ["already_completed", "success"])

    def test_verify_password_correct_and_incorrect(self):
        password = "correct-horse-battery-staple"
        self.auth_store.setup_password(password)

        self.assertTrue(self.auth_store.verify_password(password))
        self.assertFalse(self.auth_store.verify_password("wrong-password"))
        self.assertFalse(self.auth_store.verify_password(""))

    def test_corrupt_store_fails_closed(self):
        # Write corrupted JSON
        with open(self.store_path, "w", encoding="utf-8") as f:
            f.write("{invalid-json-data")

        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

        with self.assertRaises(CorruptStoreError):
            self.auth_store.verify_password("any-password")

        with self.assertRaises(CorruptStoreError):
            self.auth_store.setup_password("new-password")

    def test_insecure_permissions_rejected(self):
        self.auth_store.setup_password("valid-password-123")
        if os.name == "posix":
            # Set group/world readable
            os.chmod(self.store_path, 0o644)
            with self.assertRaises(CorruptStoreError):
                self.auth_store.is_configured()
            with self.assertRaises(CorruptStoreError):
                self.auth_store.verify_password("valid-password-123")

    def test_invalid_store_schema_and_version(self):
        # Missing keys
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump({"version": 1}, f)
        if os.name == "posix":
            os.chmod(self.store_path, 0o600)
        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

        # Unsupported version
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 2,
                "kdf": "scrypt",
                "params": SCRYPT_PARAMS,
                "salt": "a" * 32,
                "hash": "b" * 64,
            }, f)
        if os.name == "posix":
            os.chmod(self.store_path, 0o600)
        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

        # Unsupported KDF
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 1,
                "kdf": "argon2",
                "params": SCRYPT_PARAMS,
                "salt": "a" * 32,
                "hash": "b" * 64,
            }, f)
        if os.name == "posix":
            os.chmod(self.store_path, 0o600)
        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

    def test_strictly_bounded_kdf_params(self):
        # Dangerous / out of bounds parameters
        bad_cases = [
            {"n": 512, "r": 8, "p": 1, "maxmem": 33554432, "dklen": 32},
            {"n": 131072, "r": 8, "p": 1, "maxmem": 33554432, "dklen": 32},
            {"n": 10000, "r": 8, "p": 1, "maxmem": 33554432, "dklen": 32},
            {"n": 16384, "r": 0, "p": 1, "maxmem": 33554432, "dklen": 32},
            {"n": 16384, "r": 32, "p": 1, "maxmem": 33554432, "dklen": 32},
            {"n": 16384, "r": 8, "p": 0, "maxmem": 33554432, "dklen": 32},
            {"n": 16384, "r": 8, "p": 8, "maxmem": 33554432, "dklen": 32},
            {"n": 16384, "r": 8, "p": 1, "maxmem": 500, "dklen": 32},
            {"n": 16384, "r": 8, "p": 1, "maxmem": 100000000, "dklen": 32},
            {"n": 16384, "r": 8, "p": 1, "maxmem": 33554432, "dklen": 16},
            {"n": 16384, "r": 8, "p": 1, "maxmem": 33554432, "dklen": 128},
        ]
        for bad_p in bad_cases:
            with open(self.store_path, "w", encoding="utf-8") as f:
                json.dump({
                    "version": 1,
                    "kdf": "scrypt",
                    "params": bad_p,
                    "salt": "a" * 32,
                    "hash": "b" * 64,
                }, f)
            if os.name == "posix":
                os.chmod(self.store_path, 0o600)
            with self.assertRaises(CorruptStoreError):
                self.auth_store.is_configured()

    def test_invalid_salt_and_hash_format(self):
        # Invalid salt (not hex)
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 1,
                "kdf": "scrypt",
                "params": SCRYPT_PARAMS,
                "salt": "zz" * 16,
                "hash": "b" * 64,
            }, f)
        if os.name == "posix":
            os.chmod(self.store_path, 0o600)
        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

        # Salt too short
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 1,
                "kdf": "scrypt",
                "params": SCRYPT_PARAMS,
                "salt": "abcd",
                "hash": "b" * 64,
            }, f)
        if os.name == "posix":
            os.chmod(self.store_path, 0o600)
        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

        # Invalid hash length
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump({
                "version": 1,
                "kdf": "scrypt",
                "params": SCRYPT_PARAMS,
                "salt": "a" * 32,
                "hash": "b" * 32,
            }, f)
        if os.name == "posix":
            os.chmod(self.store_path, 0o600)
        with self.assertRaises(CorruptStoreError):
            self.auth_store.is_configured()

    def test_session_manager_lifecycle(self):
        sm = SessionManager(ttl_seconds=2)
        session = sm.create_session()
        self.assertIsNotNone(session.session_id)
        self.assertIsNotNone(session.csrf_token)

        # Validate active session
        valid = sm.validate_session(session.session_id)
        self.assertIsNotNone(valid)
        self.assertEqual(valid.session_id, session.session_id)

        # Invalidate / logout
        sm.destroy_session(session.session_id)
        self.assertIsNone(sm.validate_session(session.session_id))

    def test_session_manager_expiration(self):
        sm = SessionManager(ttl_seconds=1)
        session = sm.create_session()
        self.assertIsNotNone(sm.validate_session(session.session_id))
        time.sleep(1.2)
        # Should be expired
        self.assertIsNone(sm.validate_session(session.session_id))

    def test_session_manager_rotation(self):
        sm = SessionManager(ttl_seconds=60)
        s1 = sm.create_session()
        s2 = sm.rotate_session(s1.session_id)
        self.assertNotEqual(s1.session_id, s2.session_id)
        self.assertIsNone(sm.validate_session(s1.session_id))
        self.assertIsNotNone(sm.validate_session(s2.session_id))

    def test_rate_limiter_throttles_after_threshold(self):
        limiter = LoginRateLimiter(max_failures=3, lockout_seconds=2)
        key = "127.0.0.1"

        self.assertTrue(limiter.check_allowed(key))
        limiter.record_failure(key)
        self.assertTrue(limiter.check_allowed(key))
        limiter.record_failure(key)
        self.assertTrue(limiter.check_allowed(key))
        limiter.record_failure(key)

        # 3rd failure reaches threshold -> locked out
        self.assertFalse(limiter.check_allowed(key))
        time.sleep(2.1)
        self.assertTrue(limiter.check_allowed(key))

    def test_rate_limiter_stale_pruning_and_bounding(self):
        limiter = LoginRateLimiter(max_failures=3, lockout_seconds=10, max_entries=5, failure_ttl=10)
        # Record failures across 10 keys
        for i in range(10):
            limiter.record_failure(f"192.168.1.{i}")

        # Total tracked entries must be strictly capped by max_entries
        self.assertLessEqual(len(limiter._failures), 5)

        # Fast forward time to expire failures
        future_time = time.time() + 15
        limiter.prune_stale(now=future_time)
        # Stale failure entries must be completely purged
        self.assertEqual(len(limiter._failures), 0)
        self.assertEqual(len(limiter._lockout_until), 0)

    def test_validate_origin_strict(self):
        from auth import validate_origin
        # Missing Origin -> False (fails closed)
        self.assertFalse(validate_origin(None, "127.0.0.1:8000"))
        self.assertFalse(validate_origin("", "127.0.0.1:8000"))

        # Untrusted / attacker origin -> False
        self.assertFalse(validate_origin("http://evil.com", "127.0.0.1:8000"))
        self.assertFalse(validate_origin("http://127.0.0.1.attacker.com", "127.0.0.1:8000"))
        self.assertFalse(validate_origin("https://attacker.com/127.0.0.1", "127.0.0.1:8000"))
        self.assertFalse(validate_origin("javascript:alert(1)", "127.0.0.1:8000"))
        self.assertFalse(validate_origin("file:///etc/passwd", "127.0.0.1:8000"))

        # Same origin -> True
        self.assertTrue(validate_origin("http://127.0.0.1:8000", "127.0.0.1:8000"))
        self.assertTrue(validate_origin("http://localhost:8000", "localhost:8000"))


class TestAuthServerIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp()
        cls.store_path = os.path.join(cls.temp_dir, "auth_store.json")
        cls.test_db_path = os.path.join(cls.temp_dir, "auth_test.db")

        # Set up a test DB
        conn = sqlite3.connect(cls.test_db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT,
                assignee TEXT,
                status TEXT NOT NULL,
                priority INTEGER DEFAULT 5,
                created_by TEXT,
                created_at INTEGER,
                started_at INTEGER,
                completed_at INTEGER,
                block_kind TEXT,
                block_recurrences INTEGER DEFAULT 0,
                consecutive_failures INTEGER DEFAULT 0,
                goal_mode INTEGER DEFAULT 0,
                tenant TEXT DEFAULT 'default',
                workspace_path TEXT,
                branch_name TEXT,
                claim_lock TEXT,
                worker_pid INTEGER,
                last_failure_error TEXT,
                idempotency_key TEXT,
                result TEXT,
                skills TEXT,
                model_override TEXT,
                provider_override TEXT,
                session_id TEXT,
                current_run_id INTEGER,
                workflow_template_id TEXT,
                current_step_key TEXT,
                project_id TEXT
            )
        """)
        cur.execute(
            "INSERT INTO tasks (id, title, status) VALUES ('t_auth_1', 'Auth Task 1', 'todo')"
        )
        conn.commit()
        conn.close()

        ALLOWED_BOARDS["auth-test"] = {
            "label": "Auth Test Board",
            "path": cls.test_db_path,
        }

        # Create server with explicit auth store path
        cls.server = create_server(
            host="127.0.0.1",
            port=0,
            auth_store_path=cls.store_path,
        )
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        shutil.rmtree(cls.temp_dir)
        ALLOWED_BOARDS.pop("auth-test", None)

    def _request_raw(
        self,
        method: str,
        path: str,
        body_dict: Optional[dict] = None,
        headers: Optional[dict] = None,
        cookie: Optional[str] = None,
    ):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        req_headers = headers.copy() if headers else {}
        if cookie:
            req_headers["Cookie"] = cookie

        data = None
        if body_dict is not None:
            data = json.dumps(body_dict).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
            req_headers["Content-Length"] = str(len(data))

        conn.request(method, path, body=data, headers=req_headers)
        resp = conn.getresponse()
        resp_body = resp.read()
        resp_headers = dict(resp.getheaders())
        conn.close()
        return resp.status, resp_headers, resp_body

    def _get_preauth_session(self):
        status, headers, body = self._request_raw("GET", "/api/auth/status")
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        csrf = data.get("csrf_token")
        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
        cookie = set_cookie.split(";")[0] if set_cookie else None
        return cookie, csrf

    def test_01_status_before_setup_indicates_setup_required(self):
        status, headers, body = self._request_raw("GET", "/api/auth/status")
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertTrue(data.get("setup_required"))
        self.assertFalse(data.get("authenticated"))
        self.assertIn("csrf_token", data)
        # Verify no kanban data in response
        self.assertNotIn("tasks", data)
        self.assertNotIn("t_auth_1", data)

    def test_02_pre_setup_api_access_is_blocked(self):
        status, _, body = self._request_raw("GET", "/api/boards")
        self.assertEqual(status, 401)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("error", data)

    def test_03_first_run_setup_sets_password_and_returns_session(self):
        # 1. Fetch CSRF token and pre-auth session
        cookie, csrf_token = self._get_preauth_session()

        # 2. Setup with short password should fail validation
        status, _, body = self._request_raw(
            "POST",
            "/api/auth/setup",
            body_dict={"password": "123", "confirm_password": "123"},
            headers={"X-CSRF-Token": csrf_token, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 400)

        # 3. Setup with mismatched password should fail
        status, _, body = self._request_raw(
            "POST",
            "/api/auth/setup",
            body_dict={"password": "valid-password-123", "confirm_password": "mismatch-password"},
            headers={"X-CSRF-Token": csrf_token, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 400)

        # 4. Valid setup
        status, headers, body = self._request_raw(
            "POST",
            "/api/auth/setup",
            body_dict={"password": "admin-strong-password-99", "confirm_password": "admin-strong-password-99"},
            headers={"X-CSRF-Token": csrf_token, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertTrue(data.get("success"))

        # Verify Set-Cookie header has HttpOnly and SameSite=Strict
        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie")
        self.assertIsNotNone(set_cookie)
        self.assertIn("kanban_session=", set_cookie)
        self.assertIn("HttpOnly", set_cookie)
        self.assertIn("SameSite=Strict", set_cookie)
        self.assertIn("Path=/", set_cookie)

    def test_04_setup_endpoint_permanently_disabled_after_initial_setup(self):
        # Subsequent setup attempt must be rejected (409 Conflict)
        cookie, csrf_token = self._get_preauth_session()

        status, _, body = self._request_raw(
            "POST",
            "/api/auth/setup",
            body_dict={"password": "another-password-123", "confirm_password": "another-password-123"},
            headers={"X-CSRF-Token": csrf_token, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 409)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("already completed", data.get("error", "").lower())

    def test_05_csrf_negative_tests_setup_login_logout(self):
        cookie, csrf = self._get_preauth_session()
        valid_origin = f"http://127.0.0.1:{self.port}"

        # 1. Missing Origin on setup/login/logout -> 403
        for path in ("/api/auth/setup", "/api/auth/login", "/api/auth/logout"):
            status, _, _ = self._request_raw(
                "POST",
                path,
                body_dict={"password": "any-password-here"},
                headers={"X-CSRF-Token": csrf},
                cookie=cookie,
            )
            self.assertEqual(status, 403, f"Expected 403 for missing Origin on {path}")

        # 2. Untrusted Origin on setup/login/logout -> 403
        for path in ("/api/auth/setup", "/api/auth/login", "/api/auth/logout"):
            status, _, _ = self._request_raw(
                "POST",
                path,
                body_dict={"password": "any-password-here"},
                headers={"X-CSRF-Token": csrf, "Origin": "http://evil-attacker.com"},
                cookie=cookie,
            )
            self.assertEqual(status, 403, f"Expected 403 for untrusted Origin on {path}")

        # 3. Missing X-CSRF-Token header on setup/login/logout -> 403
        for path in ("/api/auth/setup", "/api/auth/login", "/api/auth/logout"):
            status, _, _ = self._request_raw(
                "POST",
                path,
                body_dict={"password": "any-password-here"},
                headers={"Origin": valid_origin},
                cookie=cookie,
            )
            self.assertEqual(status, 403, f"Expected 403 for missing CSRF token on {path}")

        # 4. Invalid X-CSRF-Token header on setup/login/logout -> 403
        for path in ("/api/auth/setup", "/api/auth/login", "/api/auth/logout"):
            status, _, _ = self._request_raw(
                "POST",
                path,
                body_dict={"password": "any-password-here"},
                headers={"X-CSRF-Token": "invalid-tampered-token", "Origin": valid_origin},
                cookie=cookie,
            )
            self.assertEqual(status, 403, f"Expected 403 for invalid CSRF token on {path}")

        # 5. Missing session cookie on setup/login/logout -> 403
        for path in ("/api/auth/setup", "/api/auth/login", "/api/auth/logout"):
            status, _, _ = self._request_raw(
                "POST",
                path,
                body_dict={"password": "any-password-here"},
                headers={"X-CSRF-Token": csrf, "Origin": valid_origin},
                cookie=None,
            )
            self.assertEqual(status, 403, f"Expected 403 for missing session cookie on {path}")

    def test_06_login_flow_wrong_and_correct_password(self):
        # Wrong password
        cookie, csrf = self._get_preauth_session()
        status, _, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "wrong-password-here"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 401)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("error", data)

        # Correct password
        cookie, csrf = self._get_preauth_session()
        status, headers, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "admin-strong-password-99"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertTrue(data.get("success"))
        self.assertIn("csrf_token", data)

        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie")
        self.assertIn("kanban_session=", set_cookie)
        self.assertIn("HttpOnly", set_cookie)
        self.assertIn("SameSite=Strict", set_cookie)

    def test_07_authenticated_session_cookie_grants_api_access(self):
        # 1. Login to get cookie
        cookie, csrf = self._get_preauth_session()
        status, headers, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "admin-strong-password-99"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie")
        cookie_val = set_cookie.split(";")[0]

        # 2. Access /api/boards with session cookie
        status, _, body = self._request_raw("GET", "/api/boards", cookie=cookie_val)
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("boards", data)

        # 3. Access /api/auth/status with session cookie
        status, _, body = self._request_raw("GET", "/api/auth/status", cookie=cookie_val)
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertFalse(data.get("setup_required"))
        self.assertTrue(data.get("authenticated"))

    def test_08_logout_invalidates_session_and_clears_cookie(self):
        # 1. Login
        cookie, csrf = self._get_preauth_session()
        status, headers, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "admin-strong-password-99"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        csrf_token = json.loads(body.decode("utf-8"))["csrf_token"]
        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie")
        cookie_val = set_cookie.split(";")[0]

        # 2. Logout with CSRF token and Origin
        status, headers, body = self._request_raw(
            "POST",
            "/api/auth/logout",
            headers={
                "X-CSRF-Token": csrf_token,
                "Origin": f"http://127.0.0.1:{self.port}",
            },
            cookie=cookie_val,
        )
        self.assertEqual(status, 200)
        logout_cookie = headers.get("Set-Cookie") or headers.get("set-cookie")
        self.assertIn("Max-Age=0", logout_cookie)

        # 3. Old cookie should now be rejected (401)
        status, _, body = self._request_raw("GET", "/api/boards", cookie=cookie_val)
        self.assertEqual(status, 401)

    def test_09_login_rate_limiting_enforced_by_server(self):
        # Set max_failures threshold on server rate_limiter
        self.server.rate_limiter.max_failures = 4
        self.server.rate_limiter.lockout_seconds = 2

        # 4 failed attempts
        for _ in range(4):
            cookie, csrf = self._get_preauth_session()
            status, _, _ = self._request_raw(
                "POST",
                "/api/auth/login",
                body_dict={"password": "bad-attempt-pwd"},
                headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
                cookie=cookie,
            )
            self.assertEqual(status, 401)

        # 5th attempt must be 429 Too Many Requests
        cookie, csrf = self._get_preauth_session()
        status, _, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "bad-attempt-pwd"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 429)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("too many", data.get("error", "").lower())

        # Reset rate limiter for other tests
        self.server.rate_limiter.record_success("127.0.0.1")

    def test_10_password_never_echoed_in_responses_or_headers(self):
        cookie, csrf = self._get_preauth_session()
        sent_pwd = "canary-password-super-unique-987"
        status, headers, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": sent_pwd},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 401)
        self.assertNotIn(sent_pwd.encode("utf-8"), body)
        for h_k, h_v in headers.items():
            self.assertNotIn(sent_pwd, h_k)
            self.assertNotIn(sent_pwd, h_v)

    def test_11_cookie_secure_flag_behavior(self):
        # Plain HTTP request: no Secure flag
        cookie, csrf = self._get_preauth_session()
        status, headers, _ = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "admin-strong-password-99"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
        self.assertNotIn("; Secure", set_cookie)

        # HTTPS forwarded request: Secure flag present
        cookie, csrf = self._get_preauth_session()
        status, headers, _ = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "admin-strong-password-99"},
            headers={
                "X-CSRF-Token": csrf,
                "Origin": f"http://127.0.0.1:{self.port}",
                "X-Forwarded-Proto": "https",
            },
            cookie=cookie,
        )
        set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
        self.assertIn("; Secure", set_cookie)

    def test_12_corrupt_store_fails_closed_on_server(self):
        cookie, csrf = self._get_preauth_session()
        # Corrupt the store file
        with open(self.store_path, "w", encoding="utf-8") as f:
            f.write("{corrupt-content")

        # GET /api/auth/status fails closed (500)
        status, _, body = self._request_raw("GET", "/api/auth/status")
        self.assertEqual(status, 500)

        # POST /api/auth/setup fails closed (500) and does NOT allow re-setup
        status, _, body = self._request_raw(
            "POST",
            "/api/auth/setup",
            body_dict={"password": "new-password-12345", "confirm_password": "new-password-12345"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 500)

        # POST /api/auth/login fails closed (500)
        status, _, body = self._request_raw(
            "POST",
            "/api/auth/login",
            body_dict={"password": "new-password-12345"},
            headers={"X-CSRF-Token": csrf, "Origin": f"http://127.0.0.1:{self.port}"},
            cookie=cookie,
        )
        self.assertEqual(status, 500)

    def test_13_insecure_mode_and_params_server_fails_closed(self):
        tmp_dir = tempfile.mkdtemp()
        try:
            insecure_store = os.path.join(tmp_dir, "auth_insecure.json")
            # Write insecure permissions store
            with open(insecure_store, "w", encoding="utf-8") as f:
                json.dump({
                    "version": 1,
                    "kdf": "scrypt",
                    "params": SCRYPT_PARAMS,
                    "salt": "a" * 32,
                    "hash": "b" * 64,
                }, f)
            if os.name == "posix":
                os.chmod(insecure_store, 0o666)

            insecure_srv = create_server("127.0.0.1", port=0, auth_store_path=insecure_store)
            t = threading.Thread(target=insecure_srv.serve_forever, daemon=True)
            t.start()
            try:
                conn = http.client.HTTPConnection("127.0.0.1", insecure_srv.server_port)
                conn.request("GET", "/api/auth/status")
                resp = conn.getresponse()
                _ = resp.read()
                # Insecure permissions must fail closed with 500
                self.assertEqual(resp.status, 500)
                conn.close()
            finally:
                insecure_srv.shutdown()
                insecure_srv.server_close()
        finally:
            shutil.rmtree(tmp_dir)


if __name__ == "__main__":
    unittest.main()
