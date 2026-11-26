# backend/app/db.py
"""SQLite storage for schools, admin/guru accounts, classes, students and answers."""
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

DB_PATH = Path(os.getenv("MOMO_DB_PATH", Path(__file__).resolve().parents[1] / "data" / "momo.sqlite"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS schools (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    address     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('admin', 'guru')),
    school_id      INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id      INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    student_count  INTEGER NOT NULL CHECK (student_count BETWEEN 1 AND 60),
    join_token     TEXT NOT NULL UNIQUE,
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    number      INTEGER NOT NULL,
    name        TEXT NOT NULL,
    client_id   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (class_id, number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_class_client
    ON students (class_id, client_id) WHERE client_id IS NOT NULL;

-- Small app-wide switches set from the dashboard or scripts/ (e.g. "skip_button").
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id         INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    level_id         TEXT NOT NULL,
    strokes_json     TEXT NOT NULL,
    candidates_json  TEXT NOT NULL,
    decision_type    TEXT NOT NULL CHECK (decision_type IN ('accept', 'correct', 'override')),
    source_rank      INTEGER,
    final_label      TEXT NOT NULL,
    top1_label       TEXT NOT NULL,
    top1_confidence  REAL NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-level AI difficulty settings (Dias). Additive; only read when AI_DIFFICULTY_ENABLED=1.
CREATE TABLE IF NOT EXISTS level_difficulty (
    level_id    TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 0,
    difficulty  INTEGER NOT NULL DEFAULT 0 CHECK (difficulty BETWEEN 0 AND 100),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_class ON submissions(class_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);

CREATE TABLE IF NOT EXISTS student_sessions (
    token_hash  TEXT PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);
"""

# Columns added to existing databases (idempotent migration). Fresh DBs get them here too.
SUBMISSION_ADDITIONS = {
    "submission_key": "TEXT",
    "attempt_id": "TEXT",
    "prediction_id": "TEXT",
    "redraw_count": "INTEGER",
    "outcome": "TEXT",
    "behavior": "TEXT",
    "retry_count": "INTEGER",
    "outcome_at": "TEXT",
}


def _backup_before_role_migration(conn: sqlite3.Connection) -> Optional[Path]:
    """Create an atomic SQLite backup before destructive users.role migration."""
    db_file: Optional[Path] = None
    for db_row in conn.execute("PRAGMA database_list").fetchall():
        if db_row[1] == "main" and db_row[2]:
            candidate = Path(db_row[2])
            if candidate.is_file():
                db_file = candidate
            break
    if db_file is None:
        return None

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = db_file.parent / f"{db_file.name}.pre-role-migration-{timestamp}.bak"
    if backup_path.exists():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup_path = db_file.parent / f"{db_file.name}.pre-role-migration-{timestamp}.bak"

    tmp_path = db_file.parent / f".{backup_path.name}.tmp.{os.getpid()}"
    dst = sqlite3.connect(tmp_path)
    try:
        conn.backup(dst)
    except Exception:
        dst.close()
        if tmp_path.exists():
            tmp_path.unlink()
        raise
    else:
        dst.close()
        os.replace(tmp_path, backup_path)
    return backup_path


def _migrate_user_roles(conn: sqlite3.Connection) -> None:
    """Idempotently migrate legacy users.role ('superadmin', 'admin') -> ('admin', 'guru')."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).fetchone()
    if row is None or not row[0] or "'superadmin'" not in row[0]:
        return

    # PRAGMA foreign_keys cannot be toggled inside an active transaction.
    conn.commit()
    _backup_before_role_migration(conn)
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("BEGIN")
        conn.execute(
            """
            CREATE TABLE users_new (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name           TEXT NOT NULL,
                password_hash  TEXT NOT NULL,
                role           TEXT NOT NULL CHECK (role IN ('admin', 'guru')),
                school_id      INTEGER REFERENCES schools(id) ON DELETE CASCADE,
                created_at     TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            INSERT INTO users_new (id, email, name, password_hash, role, school_id, created_at)
            SELECT
                id,
                email,
                name,
                password_hash,
                CASE role
                    WHEN 'superadmin' THEN 'admin'
                    WHEN 'admin' THEN 'guru'
                    ELSE role
                END,
                school_id,
                created_at
            FROM users
            """
        )
        conn.execute("DROP TABLE users")
        conn.execute("ALTER TABLE users_new RENAME TO users")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")

    fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
    if fk_errors:
        raise RuntimeError(
            f"Foreign key check failed after migrating users.role: {[tuple(r) for r in fk_errors]}"
        )


def _migrate_students_client_id(conn: sqlite3.Connection) -> None:
    """Idempotently add students.client_id and its partial unique index on existing DBs."""
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'students'"
    ).fetchone()
    if exists is None:
        return
    cols = {row[1] for row in conn.execute("PRAGMA table_info(students)")}
    if "client_id" not in cols:
        conn.execute("ALTER TABLE students ADD COLUMN client_id TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_students_class_client "
        "ON students (class_id, client_id) WHERE client_id IS NOT NULL"
    )


def _migrate(conn: sqlite3.Connection) -> None:
    _migrate_user_roles(conn)
    _migrate_students_client_id(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(submissions)")}
    for name, sql_type in SUBMISSION_ADDITIONS.items():
        if name not in cols:
            conn.execute(f"ALTER TABLE submissions ADD COLUMN {name} {sql_type}")
    # Idempotency: one submission per student per submission_key (NULL keys are not constrained).
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_student_key "
        "ON submissions(student_id, submission_key) WHERE submission_key IS NOT NULL"
    )


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        _migrate_user_roles(conn)
        _migrate_students_client_id(conn)
        conn.executescript(SCHEMA)
        _migrate(conn)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    # FastAPI may open a request's connection in one worker thread and use or close it in
    # another; each connection still serves a single request at a time, so this is safe.
    conn = sqlite3.connect(DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request."""
    with connect() as conn:
        yield conn
