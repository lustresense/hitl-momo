#!/usr/bin/env python3
"""Standalone CLI to roll back users.role from ('admin', 'guru') to ('superadmin', 'admin').

Creates an atomic SQLite backup via sqlite3.Connection.backup() before altering the table,
remaps 'admin' -> 'superadmin' and 'guru' -> 'admin', verifies PRAGMA foreign_key_check is
empty, and is idempotent if the database is already on legacy roles.

Usage:
    python rollback_user_roles.py [--db PATH]
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DEFAULT_DB_PATH = Path(
    os.getenv("MOMO_DB_PATH", Path(__file__).resolve().parent / "data" / "momo.sqlite")
)


def _atomic_backup(conn: sqlite3.Connection, db_path: Path, suffix_prefix: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = db_path.parent / f"{db_path.name}.{suffix_prefix}-{timestamp}.bak"
    if backup_path.exists():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup_path = db_path.parent / f"{db_path.name}.{suffix_prefix}-{timestamp}.bak"
    tmp_path = db_path.parent / f".{backup_path.name}.tmp.{os.getpid()}"
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


def rollback_user_roles(db_path: Path) -> Optional[Path]:
    """Convert users table schema and data back to ('superadmin', 'admin').

    Returns the backup path if a rollback was performed, or None if already on legacy roles.
    """
    if not db_path.is_file():
        raise FileNotFoundError(f"Database file not found: {db_path}")

    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        ).fetchone()
        if row is None or not row[0]:
            print(f"No 'users' table found in {db_path}; nothing to roll back.")
            return None

        table_sql = row[0]
        if "'superadmin'" in table_sql:
            print(f"Database {db_path} is already on legacy roles ('superadmin', 'admin'). No changes made.")
            return None
        if "'guru'" not in table_sql:
            raise RuntimeError(f"Unexpected users table schema in {db_path}: {table_sql}")

        conn.commit()
        backup_path = _atomic_backup(conn, db_path, "pre-role-rollback")

        conn.execute("PRAGMA foreign_keys = OFF")
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                CREATE TABLE users_legacy (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    name           TEXT NOT NULL,
                    password_hash  TEXT NOT NULL,
                    role           TEXT NOT NULL CHECK (role IN ('superadmin', 'admin')),
                    school_id      INTEGER REFERENCES schools(id) ON DELETE CASCADE,
                    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """
            )
            conn.execute(
                """
                INSERT INTO users_legacy (id, email, name, password_hash, role, school_id, created_at)
                SELECT
                    id,
                    email,
                    name,
                    password_hash,
                    CASE role
                        WHEN 'admin' THEN 'superadmin'
                        WHEN 'guru' THEN 'admin'
                        ELSE role
                    END,
                    school_id,
                    created_at
                FROM users
                """
            )
            conn.execute("DROP TABLE users")
            conn.execute("ALTER TABLE users_legacy RENAME TO users")
            conn.commit()
        except Exception:
            if conn.in_transaction:
                conn.rollback()
            raise
        finally:
            conn.execute("PRAGMA foreign_keys = ON")

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError(
                f"Foreign key check failed after rolling back users.role: {[tuple(r) for r in fk_errors]}"
            )

        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        print(
            f"Rolled back {count} user(s) in {db_path} to legacy roles ('superadmin', 'admin'). "
            f"Backup saved to: {backup_path}"
        )
        return backup_path
    finally:
        conn.close()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Roll back users.role from ('admin', 'guru') to ('superadmin', 'admin')."
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Path to SQLite database (default: {DEFAULT_DB_PATH})",
    )
    args = parser.parse_args(argv)
    try:
        rollback_user_roles(args.db)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
