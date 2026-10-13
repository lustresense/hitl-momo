import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

ALLOWED_BOARDS: Dict[str, Dict[str, str]] = {
    "default": {
        "label": "Default",
        "path": "/home/agentops/.hermes/kanban.db",
    },
    "airs-exhibition-v7": {
        "label": "AIRS Exhibition v7",
        "path": "/home/agentops/.hermes/kanban/boards/airs-exhibition-v7/kanban.db",
    },
    "sketchbook-universe-v2": {
        "label": "Sketchbook Universe v2",
        "path": "/home/agentops/.hermes/kanban/boards/sketchbook-universe-v2/kanban.db",
    },
}

# Explicit forbidden fields list to assert exclusion against
FORBIDDEN_TASK_FIELDS = {
    "body",
    "workspace_path",
    "branch_name",
    "claim_lock",
    "claim_expires",
    "worker_pid",
    "last_failure_error",
    "idempotency_key",
    "result",
    "skills",
    "model_override",
    "provider_override",
    "session_id",
    "current_run_id",
    "workflow_template_id",
    "current_step_key",
    "project_id",
    "tenant",
    "consecutive_failures",
    "block_recurrences",
    "goal_mode",
    "created_by",
    "metadata",
    "payload",
    "comments",
    "error",
    "summary",
    "last_heartbeat_at",
}

# Strict approved task columns selected from SQLite
SAFE_TASK_COLUMNS = [
    "id",
    "title",
    "assignee",
    "status",
    "priority",
    "block_kind",
    "created_at",
    "completed_at",
]

MIN_LIMIT = 1
MAX_LIMIT = 100
MIN_OFFSET = 0
MAX_OFFSET = 10000


def get_board_db_path(slug: str) -> Optional[str]:
    board = ALLOWED_BOARDS.get(slug)
    if not board:
        return None
    path = board["path"]
    if not os.path.isabs(path) or not os.path.exists(path):
        return None
    return path


def get_db_connection(db_path: str) -> sqlite3.Connection:
    # Open SQLite database strictly read-only using URI mode
    abs_path = os.path.abspath(db_path)
    uri_path = f"file:{abs_path}?mode=ro"
    conn = sqlite3.connect(uri_path, uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enforce query_only pragma
    conn.execute("PRAGMA query_only = ON;")
    return conn


def get_boards_summary() -> List[Dict[str, Any]]:
    summary = []
    for slug, meta in ALLOWED_BOARDS.items():
        db_path = meta["path"]
        board_data: Dict[str, Any] = {
            "slug": slug,
            "label": meta["label"],
            "counts": {},
            "total": 0,
            "available": False,
        }
        if os.path.exists(db_path):
            try:
                conn = get_db_connection(db_path)
                cur = conn.cursor()
                cur.execute("SELECT status, count(*) FROM tasks GROUP BY status")
                rows = cur.fetchall()
                total = 0
                counts = {}
                for row in rows:
                    st = row[0] or "unknown"
                    cnt = row[1]
                    counts[st] = cnt
                    total += cnt
                board_data["counts"] = counts
                board_data["total"] = total
                board_data["available"] = True
                conn.close()
            except Exception:
                board_data["available"] = False
        summary.append(board_data)
    return summary


def get_tasks(
    conn: sqlite3.Connection,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    # Enforce strict bounds validation
    if not isinstance(limit, int) or limit < MIN_LIMIT or limit > MAX_LIMIT:
        raise ValueError(f"Limit must be an integer between {MIN_LIMIT} and {MAX_LIMIT}")
    if not isinstance(offset, int) or offset < MIN_OFFSET or offset > MAX_OFFSET:
        raise ValueError(f"Offset must be an integer between {MIN_OFFSET} and {MAX_OFFSET}")

    where_clauses = []
    params: List[Any] = []

    if status:
        where_clauses.append("status = ?")
        params.append(status)

    if assignee:
        where_clauses.append("assignee = ?")
        params.append(assignee)

    if search:
        where_clauses.append("(title LIKE ? OR id LIKE ?)")
        search_pattern = f"%{search}%"
        params.extend([search_pattern, search_pattern])

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    cur = conn.cursor()
    # Count total matching tasks
    count_sql = f"SELECT count(*) FROM tasks {where_sql}"
    cur.execute(count_sql, params)
    total_count = cur.fetchone()[0]

    # Select strictly safe task columns only
    cols_sql = ", ".join(SAFE_TASK_COLUMNS)
    query_sql = f"""
        SELECT {cols_sql}
        FROM tasks
        {where_sql}
        ORDER BY priority DESC, created_at DESC
        LIMIT ? OFFSET ?
    """
    cur.execute(query_sql, params + [limit, offset])
    rows = cur.fetchall()

    # Explicitly construct response objects using approved fields only
    tasks = []
    for r in rows:
        tasks.append({
            "id": str(r["id"]),
            "title": str(r["title"] or ""),
            "assignee": str(r["assignee"]) if r["assignee"] else None,
            "status": str(r["status"] or "unknown"),
            "priority": int(r["priority"]) if r["priority"] is not None else 5,
            "block_kind": str(r["block_kind"]) if r["block_kind"] else None,
            "created_at": r["created_at"],
            "completed_at": r["completed_at"],
        })
    return tasks, total_count


def get_task_detail(conn: sqlite3.Connection, task_id: str) -> Optional[Dict[str, Any]]:
    cur = conn.cursor()
    cols_sql = ", ".join(SAFE_TASK_COLUMNS)
    cur.execute(f"SELECT {cols_sql}, body FROM tasks WHERE id = ?", (task_id,))
    row = cur.fetchone()
    if not row:
        return None

    # Safe task_runs: id, profile, status, duration_s only. Omit claim locks, pids, errors, metadata
    cur.execute(
        """
        SELECT id, profile, status, started_at, ended_at
        FROM task_runs
        WHERE task_id = ?
        ORDER BY id DESC
        LIMIT 20
        """,
        (task_id,),
    )
    runs_rows = cur.fetchall()
    runs = []
    for r in runs_rows:
        started_at = r["started_at"]
        ended_at = r["ended_at"]
        duration_s = (ended_at - started_at) if (started_at and ended_at) else None
        runs.append({
            "id": r["id"],
            "profile": r["profile"],
            "status": r["status"],
            "duration_s": duration_s,
        })

    # Safe task_events: id, kind, created_at only. Omit payload.
    cur.execute(
        """
        SELECT id, kind, created_at
        FROM task_events
        WHERE task_id = ?
        ORDER BY id ASC
        LIMIT 50
        """,
        (task_id,),
    )
    events = [
        {
            "id": e["id"],
            "kind": e["kind"],
            "created_at": e["created_at"],
        }
        for e in cur.fetchall()
    ]

    # Safe task_comments: id, author, body (mapped to content), created_at
    cur.execute(
        """
        SELECT id, author, body, created_at
        FROM task_comments
        WHERE task_id = ?
        ORDER BY id ASC
        LIMIT 50
        """,
        (task_id,),
    )
    comment_threads = [
        {
            "id": c["id"],
            "author": str(c["author"] or ""),
            "content": str(c["body"] or ""),
            "created_at": c["created_at"],
        }
        for c in cur.fetchall()
    ]

    task = {
        "id": str(row["id"]),
        "title": str(row["title"] or ""),
        "description": str(row["body"] or ""),
        "assignee": str(row["assignee"]) if row["assignee"] else None,
        "status": str(row["status"] or "unknown"),
        "priority": int(row["priority"]) if row["priority"] is not None else 5,
        "block_kind": str(row["block_kind"]) if row["block_kind"] else None,
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
        "runs": runs,
        "events": events,
        "comment_threads": comment_threads,
    }

    return task


def get_board_assignees(conn: sqlite3.Connection) -> List[str]:
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT assignee FROM tasks WHERE assignee IS NOT NULL AND assignee != '' ORDER BY assignee ASC")
    return [row[0] for row in cur.fetchall()]
