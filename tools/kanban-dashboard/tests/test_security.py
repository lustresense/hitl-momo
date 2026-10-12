import json
import http.client
import inspect
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from typing import Optional
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import create_server
from db import ALLOWED_BOARDS, FORBIDDEN_TASK_FIELDS

SEC_TOKEN = "sec-test-token-778899"


def assert_no_forbidden_fields(test_case: unittest.TestCase, obj, forbidden_fields=FORBIDDEN_TASK_FIELDS):
    if isinstance(obj, dict):
        for k, v in obj.items():
            test_case.assertNotIn(
                k,
                forbidden_fields,
                f"Forbidden field '{k}' exposed in response object: {obj}",
            )
            assert_no_forbidden_fields(test_case, v, forbidden_fields)
    elif isinstance(obj, list):
        for item in obj:
            assert_no_forbidden_fields(test_case, item, forbidden_fields)


class TestKanbanSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.test_db_path = os.path.join(cls.temp_dir.name, "sec_board.db")
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
        cur.execute("""
            CREATE TABLE task_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                profile TEXT,
                step_key TEXT,
                status TEXT,
                outcome TEXT,
                started_at INTEGER,
                ended_at INTEGER,
                max_runtime_seconds INTEGER,
                claim_lock TEXT,
                claim_expires INTEGER,
                worker_pid INTEGER,
                last_heartbeat_at INTEGER,
                error TEXT,
                metadata TEXT,
                summary TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE task_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                payload TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE task_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                author TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        cur.execute("""
            INSERT INTO tasks (
                id, title, body, assignee, status, priority, workspace_path,
                branch_name, claim_lock, worker_pid, last_failure_error,
                session_id, current_run_id, tenant, consecutive_failures
            )
            VALUES (
                't_sec_1', 'Normal Task', 'Hidden Details', 'dadang', 'running', 5,
                '/srv/internal/path', 'wt/secret_branch', 'lock_99', 12345,
                'Crash log trace', 'sess_999', 1, 'tenant_x', 3
            )
        """)
        cur.execute("""
            INSERT INTO task_runs (task_id, profile, step_key, status, outcome, started_at, ended_at, error, metadata, summary)
            VALUES ('t_sec_1', 'dadang', 'build', 'running', NULL, 1000, 1050, 'Secret run error', '{"meta": true}', 'Run summary')
        """)
        cur.execute("""
            INSERT INTO task_events (task_id, kind, created_at, payload)
            VALUES ('t_sec_1', 'claimed', 1000, '{"claim_payload": "secret"}')
        """)
        cur.execute("""
            INSERT INTO task_comments (task_id, author, body, created_at)
            VALUES ('t_sec_1', 'ujang', 'Private comment', 1010)
        """)
        conn.commit()
        conn.close()

        ALLOWED_BOARDS["sec-test"] = {
            "label": "Sec Test",
            "path": cls.test_db_path,
        }

        cls.server = create_server(host="127.0.0.1", port=0, auth_token=SEC_TOKEN)
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp_dir.cleanup()
        ALLOWED_BOARDS.pop("sec-test", None)

    def _get(self, path, token: Optional[str] = SEC_TOKEN, headers=None):
        url = f"http://127.0.0.1:{self.port}{path}"
        req_headers = {}
        if token:
            req_headers["Authorization"] = f"Bearer {token}"
        if headers:
            req_headers.update(headers)
        req = Request(url, headers=req_headers)
        return urlopen(req)

    # 1. Fail-closed binding to non-loopback hosts
    def test_non_loopback_binding_prohibited(self):
        forbidden_hosts = ["0.0.0.0", "192.168.1.100", "10.0.0.1", "example.com"]
        for host in forbidden_hosts:
            with self.assertRaises(ValueError) as ctx:
                create_server(host=host, port=0)
            self.assertIn("Fail-closed", str(ctx.exception))
            self.assertIn("loopback", str(ctx.exception))

    # 2. Auth Gate Enforcement on all routes
    def test_unauthenticated_api_routes_blocked(self):
        routes = [
            "/api/boards",
            "/api/boards/sec-test/tasks",
            "/api/boards/sec-test/tasks/t_sec_1",
            "/api/boards/sec-test/assignees",
        ]
        for route in routes:
            with self.assertRaises(HTTPError) as ctx:
                self._get(route, token=None)
            self.assertEqual(ctx.exception.code, 401)

    def test_unauthenticated_static_routes_serve_data_free_shell(self):
        # 1. Root HTML is served unauthenticated as login shell with zero secrets
        resp = self._get("/", token=None)
        self.assertEqual(resp.status, 200)
        body = resp.read().decode("utf-8")
        self.assertIn("<!DOCTYPE html>", body)
        self.assertIn("auth-modal", body)
        self.assertNotIn("t_sec_1", body)
        self.assertNotIn("Sec Task", body)
        self.assertNotIn("/secret/", body)

        # 2. Static CSS & JS are served unauthenticated
        for path, expected_snippet in [
            ("/static/style.css", "text/css"),
            ("/static/app.js", "javascript"),
        ]:
            resp = self._get(path, token=None)
            self.assertEqual(resp.status, 200)
            self.assertIn(expected_snippet, resp.headers.get("Content-Type", ""))
            self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
            self.assertEqual(resp.headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")

        # 3. All API routes stay strictly 401 unauthenticated
        api_routes = [
            "/api/boards",
            "/api/boards/sec-test/tasks",
            "/api/boards/sec-test/tasks/t_sec_1",
            "/api/boards/sec-test/assignees",
        ]
        for path in api_routes:
            with self.assertRaises(HTTPError) as ctx:
                self._get(path, token=None)
            self.assertEqual(ctx.exception.code, 401)
            body = json.loads(ctx.exception.read().decode("utf-8"))
            self.assertIn("token required", body["error"].lower())

    # 3. Untrusted Cloudflare Access Header Cannot Authenticate
    def test_untrusted_cf_header_cannot_authenticate(self):
        url = f"http://127.0.0.1:{self.port}/api/boards"
        # Passing Cf-Access-Jwt-Assertion without valid Bearer token MUST be rejected
        req = Request(url, headers={"Cf-Access-Jwt-Assertion": "simulated.valid.jwt"})
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 401)
        body = json.loads(ctx.exception.read().decode("utf-8"))
        self.assertIn("token required", body["error"].lower())

    # 4. Fail-closed when no auth configured across all routes
    def test_unconfigured_auth_fails_closed(self):
        raw_server = create_server(
            host="127.0.0.1",
            port=0,
            auth_token=None,
            auth_store_path="/tmp/nonexistent_auth_store_for_unconfigured_test.json",
        )
        raw_port = raw_server.server_port
        raw_thread = threading.Thread(target=raw_server.serve_forever, daemon=True)
        raw_thread.start()

        try:
            # API routes strictly fail closed when unconfigured
            for test_path in ["/api/boards", "/api/boards/sec-test/tasks"]:
                url = f"http://127.0.0.1:{raw_port}{test_path}"
                with self.assertRaises(HTTPError) as ctx:
                    urlopen(Request(url))
                self.assertEqual(ctx.exception.code, 401)
                body = json.loads(ctx.exception.read().decode("utf-8"))
                self.assertIn("unconfigured", body["error"].lower())

            # Static shell is data-free
            url = f"http://127.0.0.1:{raw_port}/"
            resp = urlopen(Request(url))
            self.assertEqual(resp.status, 200)
            body = resp.read().decode("utf-8")
            self.assertIn("<!DOCTYPE html>", body)
            self.assertNotIn("t_sec_1", body)
        finally:
            raw_server.shutdown()
            raw_server.server_close()

    # 5. Path Traversal & Injection Tests
    def test_static_path_traversal_blocked(self):
        traversals = [
            "/static/../../etc/passwd",
            "/static/..%2f..%2fetc/passwd",
            "/static/server.py",
            "/static/../server.py",
        ]
        for path in traversals:
            with self.assertRaises(HTTPError) as ctx:
                self._get(path)
            self.assertIn(ctx.exception.code, (400, 404))

    def test_board_slug_traversal_blocked(self):
        slug_attacks = [
            "/api/boards/../../etc/passwd/tasks",
            "/api/boards/..%2F..%2Fetc/tasks",
            "/api/boards/default/../../../tasks",
        ]
        for path in slug_attacks:
            with self.assertRaises(HTTPError) as ctx:
                self._get(path)
            self.assertEqual(ctx.exception.code, 404)

    def test_sql_injection_attempt_in_filters(self):
        evil_assignee = "' OR '1'='1"
        from urllib.parse import quote
        path = f"/api/boards/sec-test/tasks?assignee={quote(evil_assignee)}"
        resp = self._get(path)
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(data["total"], 0)
        self.assertEqual(len(data["tasks"]), 0)

    # 6. Information Disclosure & Error Redaction
    def test_error_redaction_no_stack_or_path_leak(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/sec-test/tasks/nonexistent_task_id")
        self.assertEqual(ctx.exception.code, 404)
        body = ctx.exception.read().decode("utf-8")
        self.assertNotIn("Traceback", body)
        self.assertNotIn("/srv/", body)
        self.assertNotIn("/home/", body)
        self.assertNotIn(".db", body)

    # 7. Recursive Forbidden Fields Verification
    def test_recursive_forbidden_fields_in_task_detail(self):
        resp = self._get("/api/boards/sec-test/tasks/t_sec_1")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        assert_no_forbidden_fields(self, data)

    def test_recursive_forbidden_fields_in_tasks_list(self):
        resp = self._get("/api/boards/sec-test/tasks")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        assert_no_forbidden_fields(self, data)

    # 8. Query String Token Rejected & No URL/Log Leakage
    def test_query_string_token_cannot_authenticate(self):
        url = f"http://127.0.0.1:{self.port}/api/boards?token={SEC_TOKEN}"
        req = Request(url)
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 401)

    # 9. Constant-Time Token Comparison Verification
    def test_constant_time_comparison_implemented(self):
        import inspect
        import server
        src = inspect.getsource(server)
        self.assertIn("compare_digest", src, "Token comparison must use hmac.compare_digest for constant-time check")

    # 10. All Responses Carry Security Headers
    def test_all_responses_carry_no_store_and_no_referrer(self):
        test_routes = ["/", "/static/style.css", "/api/boards", "/api/boards/sec-test/tasks"]
        for route in test_routes:
            resp = self._get(route)
            self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
            self.assertEqual(resp.headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")

        # Check error response (404)
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/nonexistent")
        self.assertEqual(ctx.exception.code, 404)
        self.assertEqual(ctx.exception.headers.get("Cache-Control"), "no-store")
        self.assertEqual(ctx.exception.headers.get("Referrer-Policy"), "no-referrer")

        # Check method not allowed response (405)
        url = f"http://127.0.0.1:{self.port}/api/boards"
        req = Request(url, headers={"Authorization": f"Bearer {SEC_TOKEN}"}, method="POST", data=b"{}")
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 405)
        self.assertEqual(ctx.exception.headers.get("Cache-Control"), "no-store")
        self.assertEqual(ctx.exception.headers.get("Referrer-Policy"), "no-referrer")

    # 11. No Logging Leaks of Headers or Query Params
    def test_no_logs_leak_headers_or_query_params(self):
        import io
        import server
        handler_cls = server.KanbanHTTPHandler
        # Verify log_message is quiet and does not output headers/queries
        out = io.StringIO()
        old_stderr = sys.stderr
        sys.stderr = out
        try:
            # instantiate dummy or check implementation
            handler_src = inspect.getsource(handler_cls.log_message)
            self.assertIn("pass", handler_src)
        finally:
            sys.stderr = old_stderr

    # 12. HTTPS Redirection and Plaintext HTTP Defense
    def test_insecure_http_forwarded_get_redirects_to_https(self):
        # When request arrives from tunnel/proxy marked as http, GET/HEAD must 301 redirect to https
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request(
            "GET",
            "/",
            headers={
                "Host": "kanban.momominum.tech",
                "X-Forwarded-Proto": "http",
            },
        )
        resp = conn.getresponse()
        resp_body = resp.read()
        conn.close()

        self.assertEqual(resp.status, 301)
        self.assertEqual(resp.headers.get("Location"), "https://kanban.momominum.tech/")
        self.assertEqual(resp.headers.get("Cache-Control"), "no-store")

    def test_insecure_http_forwarded_post_rejected(self):
        # Plaintext HTTP POST (login/setup) must be rejected to prevent cleartext credential transmission
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request(
            "POST",
            "/api/auth/login",
            body=json.dumps({"password": "some_password"}),
            headers={
                "Host": "kanban.momominum.tech",
                "X-Forwarded-Proto": "http",
                "Content-Type": "application/json",
            },
        )
        resp = conn.getresponse()
        resp_body = resp.read()
        conn.close()

        self.assertEqual(resp.status, 403)
        self.assertIn("https", resp_body.decode("utf-8").lower())

    def test_https_forwarded_request_includes_hsts(self):
        # When request arrives over HTTPS, Strict-Transport-Security must be sent
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request(
            "GET",
            "/",
            headers={
                "Host": "kanban.momominum.tech",
                "X-Forwarded-Proto": "https",
            },
        )
        resp = conn.getresponse()
        resp.read()
        conn.close()

        self.assertEqual(resp.status, 200)
        hsts = resp.headers.get("Strict-Transport-Security")
        self.assertIsNotNone(hsts)
        assert hsts is not None
        self.assertIn("max-age=", hsts)
        self.assertIn("includesubdomains", hsts.lower())


if __name__ == "__main__":
    unittest.main()
