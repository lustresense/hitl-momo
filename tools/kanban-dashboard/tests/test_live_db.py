import os
import sqlite3
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import (
    ALLOWED_BOARDS,
    get_board_db_path,
    get_db_connection,
    get_boards_summary,
    get_tasks,
    FORBIDDEN_TASK_FIELDS,
)


class TestLiveKanbanDBs(unittest.TestCase):
    def test_all_live_dbs_exist_and_read_only(self):
        for slug, meta in ALLOWED_BOARDS.items():
            path = meta["path"]
            self.assertTrue(os.path.exists(path), f"DB file does not exist: {path}")
            conn = get_db_connection(path)

            # Test read works
            cur = conn.cursor()
            cur.execute("SELECT count(*) FROM tasks")
            count = cur.fetchone()[0]
            self.assertGreater(count, 0, f"Board {slug} has 0 tasks")

            # Test write fails strictly
            with self.assertRaises(sqlite3.OperationalError):
                cur.execute("INSERT INTO tasks (id, title, status) VALUES ('t_ro_test', 'Fail', 'todo')")

            conn.close()

    def test_live_boards_summary_counts(self):
        summary = get_boards_summary()
        self.assertEqual(len(summary), 3)

        for b in summary:
            self.assertTrue(b["available"], f"Board {b['slug']} is not available")
            self.assertGreater(b["total"], 0, f"Board {b['slug']} total is 0")
            self.assertIn("counts", b)
            sum_counts = sum(b["counts"].values())
            self.assertEqual(sum_counts, b["total"])

    def test_live_tasks_sanitized_fields(self):
        for slug, meta in ALLOWED_BOARDS.items():
            path = meta["path"]
            conn = get_db_connection(path)
            tasks, total = get_tasks(conn, limit=100)
            conn.close()

            self.assertGreater(len(tasks), 0)
            for t in tasks:
                for forbidden in FORBIDDEN_TASK_FIELDS:
                    self.assertNotIn(forbidden, t, f"Forbidden field {forbidden} leaked in {slug} task {t.get('id')}")


if __name__ == "__main__":
    unittest.main()
