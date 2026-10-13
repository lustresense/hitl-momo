import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from typing import Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import create_server
from db import ALLOWED_BOARDS, FORBIDDEN_TASK_FIELDS

TEST_TOKEN = "test-token-sec-12345"


def assert_no_forbidden_fields(test_case: unittest.TestCase, obj, forbidden_fields=FORBIDDEN_TASK_FIELDS):
    """
    Recursively inspect obj (dict/list) and assert none of forbidden_fields appear anywhere.
    """
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


class TestKanbanAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create temporary database for testing
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.test_db_path = os.path.join(cls.temp_dir.name, "test_api_board.db")
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
            INSERT INTO tasks (id, title, body, assignee, status, priority, workspace_path, claim_lock, session_id, tenant, consecutive_failures, created_at)
            VALUES ('t_101', 'Task One', 'Private details', 'dadang', 'running', 8, '/secret/dir', 'lock_abc', 'sess_xyz', 'tenant_1', 2, 1700000000)
        """)
        cur.execute("""
            INSERT INTO tasks (id, title, body, assignee, status, priority, workspace_path, created_at)
            VALUES ('t_102', 'Task Two', 'Another body', 'udin', 'todo', 4, '/secret/dir2', 1700000100)
        """)
        cur.execute("""
            INSERT INTO task_runs (task_id, profile, step_key, status, started_at, ended_at, error, metadata, summary)
            VALUES ('t_101', 'dadang', 'step_1', 'running', 1700000010, 1700000070, 'Secret error', '{"meta": 1}', 'Summary')
        """)
        cur.execute("""
            INSERT INTO task_events (task_id, kind, created_at, payload)
            VALUES ('t_101', 'started', 1700000010, '{"secret": "event_payload"}')
        """)
        cur.execute("""
            INSERT INTO task_comments (task_id, author, body, created_at)
            VALUES ('t_101', 'ujang', 'Sensitive comment text', 1700000020)
        """)
        conn.commit()
        conn.close()

        # Mock the ALLOWED_BOARDS path for testing
        ALLOWED_BOARDS["test-board"] = {
            "label": "Test Board",
            "path": cls.test_db_path,
        }

        # Start test HTTP server with explicit auth_token on loopback
        cls.server = create_server(host="127.0.0.1", port=0, auth_token=TEST_TOKEN)
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp_dir.cleanup()
        ALLOWED_BOARDS.pop("test-board", None)

    def _get(self, path, token: Optional[str] = TEST_TOKEN, headers=None):
        url = f"http://127.0.0.1:{self.port}{path}"
        req_headers = {}
        if token:
            req_headers["Authorization"] = f"Bearer {token}"
        if headers:
            req_headers.update(headers)
        req = Request(url, headers=req_headers)
        return urlopen(req)

    def _request(self, method, path, data=None, token=TEST_TOKEN):
        url = f"http://127.0.0.1:{self.port}{path}"
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = Request(url, data=data, method=method, headers=headers)
        return urlopen(req)

    # 1. Auth Gate Tests
    def test_unauthenticated_request_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards", token=None)
        self.assertEqual(ctx.exception.code, 401)
        body = json.loads(ctx.exception.read().decode("utf-8"))
        self.assertIn("error", body)
        self.assertIn("token required", body["error"].lower())

    def test_unauthenticated_root_serves_static_login_shell(self):
        resp = self._get("/", token=None)
        self.assertEqual(resp.status, 200)
        content_type = resp.headers.get("Content-Type", "")
        self.assertIn("text/html", content_type)
        body = resp.read().decode("utf-8")
        self.assertIn("<!DOCTYPE html>", body)
        self.assertIn('id="auth-modal"', body)
        # Assert NO task or secret data leaks into unauthenticated HTML
        self.assertNotIn("t_101", body)
        self.assertNotIn("Task One", body)
        self.assertNotIn("Private details", body)
        self.assertNotIn("/secret/", body)

    def test_unauthenticated_static_assets_served(self):
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
            body = resp.read().decode("utf-8")
            self.assertNotIn("t_101", body)

    def test_unauthenticated_api_endpoints_strictly_rejected(self):
        for path in [
            "/api/boards",
            "/api/boards/test-board/tasks",
            "/api/boards/test-board/tasks/t_101",
            "/api/boards/test-board/assignees",
        ]:
            with self.assertRaises(HTTPError) as ctx:
                self._get(path, token=None)
            self.assertEqual(ctx.exception.code, 401)
            body = json.loads(ctx.exception.read().decode("utf-8"))
            self.assertIn("error", body)
            self.assertIn("token required", body["error"].lower())

    def test_invalid_token_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards", token="wrong-invalid-token")
        self.assertEqual(ctx.exception.code, 401)
        body = json.loads(ctx.exception.read().decode("utf-8"))
        self.assertIn("error", body)
        self.assertIn("invalid", body["error"].lower())

    def test_x_kanban_token_header_rejected(self):
        url = f"http://127.0.0.1:{self.port}/api/boards"
        req = Request(url, headers={"X-Kanban-Token": TEST_TOKEN})
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 401)

    def test_cookie_auth_rejected(self):
        url = f"http://127.0.0.1:{self.port}/api/boards"
        req = Request(url, headers={"Cookie": f"kanban_token={TEST_TOKEN}"})
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 401)

    def test_query_param_token_rejected(self):
        url = f"http://127.0.0.1:{self.port}/api/boards?token={TEST_TOKEN}"
        req = Request(url)
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 401)

    def test_no_auth_cookie_emitted(self):
        resp = self._get("/api/boards")
        self.assertEqual(resp.status, 200)
        self.assertIsNone(resp.headers.get("Set-Cookie"))

    def test_security_headers_present(self):
        # 200 responses
        for path in ["/", "/api/boards", "/static/style.css"]:
            resp = self._get(path)
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
            self.assertEqual(resp.headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")

        # 401 error response
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards", token=None)
        self.assertEqual(ctx.exception.code, 401)
        self.assertEqual(ctx.exception.headers.get("Cache-Control"), "no-store")
        self.assertEqual(ctx.exception.headers.get("Referrer-Policy"), "no-referrer")

    def test_root_serves_html(self):
        resp = self._get("/")
        self.assertEqual(resp.status, 200)
        content_type = resp.headers.get("Content-Type", "")
        self.assertIn("text/html", content_type)
        body = resp.read().decode("utf-8")
        self.assertIn("<!DOCTYPE html>", body)

    # 2. Boards Summary & Allowlist
    def test_api_boards_summary(self):
        resp = self._get("/api/boards")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertIn("boards", data)
        assert_no_forbidden_fields(self, data)
        test_b = next((b for b in data["boards"] if b["slug"] == "test-board"), None)
        self.assertIsNotNone(test_b)
        assert test_b is not None
        self.assertEqual(test_b["counts"].get("running"), 1)
        self.assertEqual(test_b["counts"].get("todo"), 1)
        # Check strict allowed keys on board summary item
        self.assertEqual(
            set(test_b.keys()),
            {"slug", "label", "counts", "total", "available"},
        )

    # 3. Tasks List & Allowlist
    def test_api_board_tasks(self):
        resp = self._get("/api/boards/test-board/tasks")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertIn("tasks", data)
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["limit"], 50)
        self.assertEqual(data["offset"], 0)
        assert_no_forbidden_fields(self, data)
        # Check strict allowed keys on each task item
        for t in data["tasks"]:
            self.assertEqual(
                set(t.keys()),
                {"id", "title", "assignee", "status", "priority", "block_kind", "created_at", "completed_at"},
            )

    def test_api_board_tasks_filtered(self):
        resp = self._get("/api/boards/test-board/tasks?assignee=dadang")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["tasks"][0]["id"], "t_101")
        assert_no_forbidden_fields(self, data)

    # 4. Task Detail & Allowlist
    def test_api_board_task_detail(self):
        resp = self._get("/api/boards/test-board/tasks/t_101")
        self.assertEqual(resp.status, 200)
        task = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(task["id"], "t_101")
        assert_no_forbidden_fields(self, task)
        # Exact allowlisted top-level keys
        self.assertEqual(
            set(task.keys()),
            {"id", "title", "assignee", "status", "priority", "block_kind", "created_at", "completed_at", "runs", "events", "description", "comment_threads"},
        )
        # Verify runs allowlist
        self.assertEqual(len(task["runs"]), 1)
        self.assertEqual(
            set(task["runs"][0].keys()),
            {"id", "profile", "status", "duration_s"},
        )
        self.assertEqual(task["runs"][0]["duration_s"], 60)
        # Verify events allowlist
        self.assertEqual(len(task["events"]), 1)
        self.assertEqual(
            set(task["events"][0].keys()),
            {"id", "kind", "created_at"},
        )
        # Verify comments are completely omitted
        self.assertNotIn("comments", task)

    # 5. Assignees API & Allowlist
    def test_api_board_assignees(self):
        resp = self._get("/api/boards/test-board/assignees")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(set(data.keys()), {"board", "assignees"})
        self.assertEqual(data["board"], "test-board")
        self.assertEqual(sorted(data["assignees"]), ["dadang", "udin"])
        assert_no_forbidden_fields(self, data)

    # 6. Pagination Bounds & Rejections (400)
    def test_pagination_malformed_limit_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?limit=not_an_int")
        self.assertEqual(ctx.exception.code, 400)
        body = json.loads(ctx.exception.read().decode("utf-8"))
        self.assertIn("error", body)
        self.assertIn("limit", body["error"].lower())

    def test_pagination_negative_limit_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?limit=-5")
        self.assertEqual(ctx.exception.code, 400)

    def test_pagination_zero_limit_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?limit=0")
        self.assertEqual(ctx.exception.code, 400)

    def test_pagination_oversized_limit_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?limit=101")
        self.assertEqual(ctx.exception.code, 400)

    def test_pagination_malformed_offset_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?offset=xyz")
        self.assertEqual(ctx.exception.code, 400)

    def test_pagination_negative_offset_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?offset=-1")
        self.assertEqual(ctx.exception.code, 400)

    def test_pagination_oversized_offset_rejected(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/test-board/tasks?offset=10001")
        self.assertEqual(ctx.exception.code, 400)

    def test_pagination_valid_bounded(self):
        resp = self._get("/api/boards/test-board/tasks?limit=1&offset=1")
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(data["limit"], 1)
        self.assertEqual(data["offset"], 1)
        self.assertEqual(len(data["tasks"]), 1)
        self.assertEqual(data["total"], 2)

    # 7. Other Security / Router checks
    def test_invalid_board_slug_returns_404(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/boards/evil-board/tasks")
        self.assertEqual(ctx.exception.code, 404)

    def test_mutation_method_not_allowed(self):
        with self.assertRaises(HTTPError) as ctx:
            self._request("POST", "/api/boards", data=b"{}")
        self.assertEqual(ctx.exception.code, 405)

        with self.assertRaises(HTTPError) as ctx:
            self._request("DELETE", "/api/boards/test-board/tasks/t_101")
        self.assertEqual(ctx.exception.code, 405)

    def test_no_cors_headers(self):
        resp = self._get("/api/boards")
        self.assertIsNone(resp.headers.get("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()
