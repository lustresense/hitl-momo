"""Seed a temporary database for the classroom E2E run. Usage: seed_e2e.py <db_path> <join_token>.

Creates one school, one class (30 students), and one teacher account (role superadmin so the
dashboard can list every class). The password is read from the E2E_TEACHER_PASSWORD environment variable.
"""
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ["MOMO_DB_PATH"] = sys.argv[1]

from backend.app.db import init_db  # noqa: E402
from backend.app.passwords import hash_password  # noqa: E402

init_db()
conn = sqlite3.connect(sys.argv[1])
conn.execute("INSERT INTO schools (name, address) VALUES ('SMP E2E', '')")
conn.execute("INSERT INTO classes (school_id, name, student_count, join_token) VALUES (1, '7A E2E', 30, ?)", (sys.argv[2],))
conn.execute(
    "INSERT INTO users (email, name, password_hash, role, school_id) VALUES (?, 'Guru E2E', ?, 'superadmin', NULL)",
    ("guru@e2e.test", hash_password(os.environ["E2E_TEACHER_PASSWORD"])),
)
conn.commit()
print("seeded", sys.argv[1])
