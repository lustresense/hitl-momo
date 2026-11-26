#!/usr/bin/env python3
"""Tampilkan / sembunyikan tombol "Lewati" di game r8.3. Panduan lengkap: docs/SKIP_BUTTON.md

  python scripts/skip_button.py status     # lihat pilihan sekarang
  python scripts/skip_button.py on         # tampilkan
  python scripts/skip_button.py off        # sembunyikan (pakai ini sebelum pengujian ke siswa)
  python scripts/skip_button.py default    # hapus pilihan: game ikut bawaan build

Menulis ke database backend yang sama dengan halaman admin. Berlaku saat tab game dimuat ulang
atau difokuskan lagi; backend tidak perlu direstart untuk mengganti pilihan.
Hanya memakai pustaka bawaan Python.
"""
import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Optional

KEY = "skip_button"
DEFAULT_DB = Path(os.getenv("MOMO_DB_PATH", Path(__file__).resolve().parents[1] / "backend" / "data" / "momo.sqlite"))
# Same table as backend/app/db.py.
DDL = """
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
"""
LABEL = {
    True: "TAMPIL (pilihan admin/script)",
    False: "SEMBUNYI (pilihan admin/script)",
    None: "belum diatur: game ikut bawaan build (NEXT_PUBLIC_SKIP_BUTTON, kalau kosong NEXT_PUBLIC_DEV_TOOLS)",
}


def read_setting(conn: sqlite3.Connection) -> Optional[bool]:
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (KEY,)).fetchone()
    return None if row is None else row[0] == "1"


def write_setting(conn: sqlite3.Connection, enabled: Optional[bool]) -> None:
    if enabled is None:
        conn.execute("DELETE FROM app_settings WHERE key = ?", (KEY,))
        return
    conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (KEY, "1" if enabled else "0"),
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Saklar tombol "Lewati" game r8.3 (docs/SKIP_BUTTON.md).')
    parser.add_argument("action", choices=["on", "off", "default", "status"])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"file SQLite backend (bawaan: {DEFAULT_DB})")
    args = parser.parse_args(argv)
    if not args.db.is_file():
        print(
            f"ERROR: database tidak ditemukan: {args.db}\n"
            "Jalankan backend sekali supaya database dibuat, atau tunjuk file yang benar dengan --db / MOMO_DB_PATH.",
            file=sys.stderr,
        )
        return 1
    conn = sqlite3.connect(args.db, timeout=10.0)
    try:
        with conn:
            conn.execute(DDL)
            if args.action != "status":
                write_setting(conn, {"on": True, "off": False, "default": None}[args.action])
        state = read_setting(conn)
    finally:
        conn.close()
    print(f"Database     : {args.db}")
    print(f"Tombol Lewati: {LABEL[state]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
