# backend/app/classroom.py
"""Public endpoints used by the game when a student opens a class link.

Identity: joining a class issues a random `student_session_token` (returned once; only its
SHA-256 is stored). Submissions and outcomes must send `Authorization: Bearer <token>`, and the
token must belong to the student and class in the request. Submissions are idempotent per
student through `submission_key`.
"""
import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .db import get_db

router = APIRouter(prefix="/api")

MAX_POINTS = 20_000  # guards against oversized payloads from a single drawing
STUDENT_SESSION_TTL = timedelta(hours=8)  # one school day


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _student_session(request: Request, conn: sqlite3.Connection) -> sqlite3.Row:
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    row = None
    if token:
        row = conn.execute(
            "SELECT student_id, class_id, expires_at FROM student_sessions WHERE token_hash = ?",
            (_hash_token(token),),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Sesi siswa tidak valid. Gabung kelas lagi.")
    if datetime.fromisoformat(row["expires_at"]) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sesi siswa sudah berakhir. Gabung kelas lagi.")
    return row


def _class_by_token(conn: sqlite3.Connection, token: str) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT c.id, c.name, c.student_count, s.name AS school_name
        FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.join_token = ?
        """,
        (token,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Link kelas tidak valid.")
    return row


@router.get("/join/{token}")
def class_info(token: str, conn: sqlite3.Connection = Depends(get_db)):
    c = _class_by_token(conn, token)
    taken = [r["number"] for r in conn.execute("SELECT number FROM students WHERE class_id = ?", (c["id"],))]
    return {
        "class_name": c["name"],
        "school_name": c["school_name"],
        "student_count": c["student_count"],
        "taken_numbers": sorted(taken),
    }


class JoinBody(BaseModel):
    number: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=80)


@router.post("/join/{token}/students")
def join_class(token: str, body: JoinBody, conn: sqlite3.Connection = Depends(get_db)):
    c = _class_by_token(conn, token)
    if body.number > c["student_count"]:
        raise HTTPException(status_code=400, detail=f"Nomor absen di kelas ini hanya 1–{c['student_count']}.")
    name = body.name.strip()
    # Re-joining with the same number (e.g. another device) keeps one student row.
    conn.execute(
        """
        INSERT INTO students (class_id, number, name) VALUES (?, ?, ?)
        ON CONFLICT (class_id, number) DO UPDATE SET name = excluded.name
        """,
        (c["id"], body.number, name),
    )
    row = conn.execute(
        "SELECT id FROM students WHERE class_id = ? AND number = ?", (c["id"], body.number)
    ).fetchone()
    now = datetime.now(timezone.utc)
    # Drop expired sessions on every join. Keeps the table small without a background job.
    conn.execute("DELETE FROM student_sessions WHERE expires_at <= ?", (now.isoformat(),))
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO student_sessions (token_hash, student_id, class_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (_hash_token(token), row["id"], c["id"], now.isoformat(), (now + STUDENT_SESSION_TTL).isoformat()),
    )
    return {
        "student_id": row["id"],
        "number": body.number,
        "name": name,
        "class_name": c["name"],
        "student_session_token": token,
        "expires_in": int(STUDENT_SESSION_TTL.total_seconds()),
        "joined_at": now.isoformat(),
    }


class Point(BaseModel):
    x: float
    y: float
    width: Optional[float] = None


class Candidate(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    confidence: float = Field(ge=0, le=1)


class SubmissionBody(BaseModel):
    submission_key: str = Field(min_length=8, max_length=80)  # client-generated, stable across retries
    join_token: str
    student_id: int
    level_id: str = Field(min_length=1, max_length=80)
    attempt_id: Optional[str] = Field(default=None, max_length=80)
    prediction_id: Optional[str] = Field(default=None, max_length=80)
    strokes: List[List[Point]]
    candidates: List[Candidate] = Field(min_length=3, max_length=3)
    decision_type: Literal["accept", "correct", "override"]
    source_rank: Optional[int] = Field(default=None, ge=1, le=3)
    final_label: str = Field(min_length=1, max_length=80)
    redraw_count: Optional[int] = Field(default=None, ge=0, le=100)


class OutcomeBody(BaseModel):
    outcome: Literal["success", "fail"]
    behavior: Literal["solid", "danger", "unresolved"]
    retry_count: Optional[int] = Field(default=None, ge=0, le=100)


def _find_by_key(conn: sqlite3.Connection, student_id: int, key: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT id FROM submissions WHERE student_id = ? AND submission_key = ?", (student_id, key)
    ).fetchone()


@router.post("/submissions")
def create_submission(body: SubmissionBody, request: Request, response: Response, conn: sqlite3.Connection = Depends(get_db)):
    session = _student_session(request, conn)
    c = _class_by_token(conn, body.join_token)
    if session["class_id"] != c["id"] or session["student_id"] != body.student_id:
        raise HTTPException(status_code=403, detail="Sesi tidak sesuai dengan murid atau kelas.")
    existing = _find_by_key(conn, body.student_id, body.submission_key)
    if existing is not None:
        response.status_code = 200
        return {"id": existing["id"], "status": "duplicate"}
    student = conn.execute(
        "SELECT id FROM students WHERE id = ? AND class_id = ?", (body.student_id, c["id"])
    ).fetchone()
    if student is None:
        raise HTTPException(status_code=400, detail="Murid tidak terdaftar di kelas ini.")
    if sum(len(s) for s in body.strokes) > MAX_POINTS:
        raise HTTPException(status_code=413, detail="Gambar terlalu besar.")
    strokes = [[p.model_dump(exclude_none=True) for p in s] for s in body.strokes]
    candidates = [cand.model_dump() for cand in body.candidates]
    try:
        cur = conn.execute(
            """
            INSERT INTO submissions (class_id, student_id, level_id, strokes_json, candidates_json,
              decision_type, source_rank, final_label, top1_label, top1_confidence,
              submission_key, attempt_id, prediction_id, redraw_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                c["id"], body.student_id, body.level_id, json.dumps(strokes), json.dumps(candidates),
                body.decision_type, body.source_rank, body.final_label.strip(),
                candidates[0]["label"], candidates[0]["confidence"],
                body.submission_key, body.attempt_id, body.prediction_id, body.redraw_count,
            ),
        )
    except sqlite3.IntegrityError:
        # A concurrent retry won the unique (student_id, submission_key) race: return that row.
        existing = _find_by_key(conn, body.student_id, body.submission_key)
        if existing is None:
            raise
        response.status_code = 200
        return {"id": existing["id"], "status": "duplicate"}
    response.status_code = 201
    return {"id": cur.lastrowid, "status": "created"}


@router.patch("/submissions/{submission_id}/outcome")
def record_outcome(submission_id: int, body: OutcomeBody, request: Request, conn: sqlite3.Connection = Depends(get_db)):
    session = _student_session(request, conn)
    row = conn.execute(
        "SELECT id FROM submissions WHERE id = ? AND student_id = ? AND class_id = ?",
        (submission_id, session["student_id"], session["class_id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Submission tidak ditemukan.")
    conn.execute(
        "UPDATE submissions SET outcome = ?, behavior = ?, retry_count = ?, outcome_at = datetime('now') WHERE id = ?",
        (body.outcome, body.behavior, body.retry_count, submission_id),
    )
    return {"id": submission_id, "status": "updated"}
