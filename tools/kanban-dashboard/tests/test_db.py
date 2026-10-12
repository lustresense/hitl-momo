import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import (
    ALLOWED_BOARDS,
    get_board_db_path,
    get_db_connection,
    get_boards_summary,
    get_tasks,
    get_task_detail,
    FORBIDDEN_TASK_FIELDS,
    SAFE_TASK_COLUMNS,
    MIN_LIMIT,
    MAX_LIMIT,
    MIN_OFFSET,
    MAX_OFFSET,
)


def assert_no_forbidden_fields(test_case: unittest.TestCase, obj, forbidden_fields=FORBIDDEN_TASK_FIELDS):
    if isinstance(obj, dict):
        for k, v in obj.items():
            test_case.assertNotIn(
                k,
                forbidden_fields,
                f"Forbidden field '{k}' exposed in object: {obj}",
            )
            assert_no_forbidden_fields(test_case, v, forbidden_fields)
    elif isinstance(obj, list):
        for item in obj:
            assert_no_forbidden_fields(test_case, item, forbidden_fields)


class TestKanbanDB(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_kanban.db")
        conn = sqlite3.connect(self.db_path)
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
        # Seed test data
        cur.execute("""
            INSERT INTO tasks (id, title, body, assignee, status, priority, workspace_path, claim_lock, tenant, consecutive_failures, created_at)
            VALUES ('t_001', 'Test Task 1', 'Secret body content', 'dadang', 'running', 8, '/secret/path', 'lock_123', 'tenant_1', 1, 1700000000)
        """)
        cur.execute("""
            INSERT INTO tasks (id, title, body, assignee, status, priority, created_at)
            VALUES ('t_002', '<img src=x onerror=alert(1)>', 'XSS test body', 'udin', 'todo', 5, 1700000100)
        """)
        cur.execute("""
            INSERT INTO tasks (id, title, body, assignee, status, priority, created_at)
            VALUES ('t_003', 'Done Task', 'Done body', 'dadang', 'done', 3, 1700000200)
        """)
        cur.execute("""
            INSERT INTO task_runs (task_id, profile, status, outcome, started_at, ended_at, max_runtime_seconds, error)
            VALUES ('t_001', 'dadang', 'running', NULL, 1000, 1050, 3600, 'internal error detail')
        """)
        cur.execute("""
            INSERT INTO task_events (task_id, kind, created_at, payload)
            VALUES ('t_001', 'started', 1000, '{"sensitive": "payload"}')
        """)
        cur.execute("""
            INSERT INTO task_comments (task_id, author, body, created_at)
            VALUES ('t_001', 'ujang', 'Sensitive comment text', 1050)
        """)
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_allowlist_registry(self):
        self.assertIn("default", ALLOWED_BOARDS)
        self.assertIn("airs-exhibition-v7", ALLOWED_BOARDS)
        self.assertIn("sketchbook-universe-v2", ALLOWED_BOARDS)
        self.assertIsNone(get_board_db_path("evil-board"))
        self.assertIsNone(get_board_db_path("../../etc/passwd"))

    def test_sqlite_readonly_enforcement(self):
        conn = get_db_connection(self.db_path)
        cur = conn.cursor()
        # Read works
        cur.execute("SELECT count(*) FROM tasks")
        row = cur.fetchone()
        self.assertEqual(row[0], 3)

        # Write must fail with OperationalError
        with self.assertRaises(sqlite3.OperationalError):
            cur.execute("INSERT INTO tasks (id, title, status) VALUES ('t_err', 'Fail', 'todo')")
        conn.close()

    def test_get_tasks_sanitized_fields(self):
        conn = get_db_connection(self.db_path)
        tasks, total = get_tasks(conn, limit=10, offset=0)
        conn.close()

        self.assertEqual(total, 3)
        self.assertEqual(len(tasks), 3)

        for task in tasks:
            assert_no_forbidden_fields(self, task)
            self.assertEqual(
                set(task.keys()),
                set(SAFE_TASK_COLUMNS),
            )

        t1 = next(t for t in tasks if t["id"] == "t_001")
        self.assertEqual(t1["title"], "Test Task 1")
        self.assertEqual(t1["assignee"], "dadang")
        self.assertEqual(t1["status"], "running")

    def test_filter_by_status_and_assignee(self):
        conn = get_db_connection(self.db_path)
        tasks, total = get_tasks(conn, assignee="dadang")
        self.assertEqual(total, 2)
        self.assertTrue(all(t["assignee"] == "dadang" for t in tasks))

        tasks_todo, total_todo = get_tasks(conn, status="todo")
        self.assertEqual(total_todo, 1)
        self.assertEqual(tasks_todo[0]["id"], "t_002")
        conn.close()

    def test_pagination_bounds_and_ceiling(self):
        conn = get_db_connection(self.db_path)

        # Valid bounded pagination
        tasks, total = get_tasks(conn, limit=1, offset=1)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(total, 3)

        # Limit < MIN_LIMIT rejected
        with self.assertRaises(ValueError):
            get_tasks(conn, limit=0)
        with self.assertRaises(ValueError):
            get_tasks(conn, limit=-1)

        # Limit > MAX_LIMIT rejected
        with self.assertRaises(ValueError):
            get_tasks(conn, limit=MAX_LIMIT + 1)

        # Offset < MIN_OFFSET rejected
        with self.assertRaises(ValueError):
            get_tasks(conn, offset=-1)

        # Offset > MAX_OFFSET rejected
        with self.assertRaises(ValueError):
            get_tasks(conn, offset=MAX_OFFSET + 1)

        conn.close()

    def test_get_task_detail_redaction(self):
        conn = get_db_connection(self.db_path)
        detail = get_task_detail(conn, "t_001")
        conn.close()

        self.assertIsNotNone(detail)
        assert detail is not None
        self.assertEqual(detail["id"], "t_001")
        assert_no_forbidden_fields(self, detail)

        # Check runs: strictly id, profile, status, duration_s
        runs = detail.get("runs", [])
        self.assertEqual(len(runs), 1)
        self.assertEqual(
            set(runs[0].keys()),
            {"id", "profile", "status", "duration_s"},
        )
        self.assertEqual(runs[0]["duration_s"], 50)
        self.assertEqual(runs[0]["status"], "running")

        # Check events: id, kind, created_at only (no payload)
        events = detail.get("events", [])
        self.assertEqual(len(events), 1)
        self.assertEqual(
            set(events[0].keys()),
            {"id", "kind", "created_at"},
        )
        self.assertEqual(events[0]["kind"], "started")

        # Check comments: completely excluded
        self.assertNotIn("comments", detail)


if __name__ == "__main__":
    unittest.main()
