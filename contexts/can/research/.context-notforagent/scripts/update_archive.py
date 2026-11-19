#!/usr/bin/env python3
"""Add a ChatGPT Exporter Markdown session and rebuild derived NUI Lab retrieval chunks.
Repository-specific TOON serializer/reader; not a full TOON specification validator.
"""
import argparse
import hashlib
import os
import tempfile
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOON = ROOT / "NUI_LAB_HISTORY.toon"
OUT = ROOT / "retrieval" / "chunks"
INDEX = ROOT / "retrieval" / "INDEX.md"
HEAD = re.compile(r"^# (you asked|chatgpt response)\r?$", re.M)
OLD_IMG = re.compile(r"images/(image-\d+\.png)")
LOCAL_IMG = re.compile(r"images/(nui-lab-\d+-image-\d+\.png)")


def quote(value):
    return json.dumps(value, ensure_ascii=False)


def read_toon():
    sessions = []
    sess = msg = None
    raw = TOON.read_text(encoding="utf-8")
    for line in raw.splitlines():
        x = re.fullmatch(r"  - number: (\d+)", line)
        if x:
            sess = {"number": int(x[1]), "messages": [], "images": []}
            sessions.append(sess)
            msg = None
            continue
        if sess is None:
            continue
        x = re.fullmatch(r"    (title|source_path|source_chat|source_blob_sha|preamble): (.+)", line)
        if x:
            sess[x[1]] = json.loads(x[2])
            continue
        x = re.fullmatch(r"    images\[(\d+)\]:(?: (.*))?", line)
        if x:
            sess["expected_images"] = int(x[1])
            sess["images"] = [v for v in (x[2] or "").split(",") if v]
            continue
        x = re.fullmatch(r"    messages\[(\d+)\]:", line)
        if x:
            sess["expected_messages"] = int(x[1])
            continue
        x = re.fullmatch(r"      - speaker: (user|assistant)", line)
        if x:
            msg = {"speaker": x[1]}
            sess["messages"].append(msg)
            continue
        x = re.fullmatch(r"        (timestamp|text): (.+)", line)
        if x and msg is not None:
            msg[x[1]] = json.loads(x[2])
    if not sessions or [s["number"] for s in sessions] != sorted(set(s["number"] for s in sessions), reverse=True):
        raise ValueError("Missing sessions, duplicate IDs, or invalid newest-first order")
    header = re.search(r"(?m)^session_count: (\d+)$", raw)
    if not header or int(header[1]) != len(sessions):
        raise ValueError("TOON session_count mismatch")
    for s in sessions:
        if s.get("expected_images") != len(s["images"]) or s.get("expected_messages") != len(s["messages"]):
            raise ValueError(f"Broken array lengths in session {s['number']}")
        for m in s["messages"]:
            if not isinstance(m.get("text"), str):
                raise ValueError("Missing or non-string message text")
    return sessions


def get_import(md_path, n, img_dir):
    raw = md_path.read_text(encoding="utf-8")
    markers = list(HEAD.finditer(raw))
    if not markers:
        raise ValueError("Expected ChatGPT Exporter headings # you asked / # chatgpt response")
    preamble = raw[:markers[0].start()]
    origin = re.search(r"^> From:\s*(https?://\S+)", preamble, flags=re.M)
    imgs = sorted(img_dir.glob("image-*.png")) if img_dir else []
    required = set(OLD_IMG.findall(raw))
    if required - {p.name for p in imgs}:
        raise ValueError(f"Export references missing images: {sorted(required - {p.name for p in imgs})}")
    for img in imgs:
        if img.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Image is not PNG: {img}")
        if (ROOT / "images" / f"nui-lab-{n}-{img.name}").exists():
            raise ValueError(f"Refusing to overwrite existing image: {img.name}")
    messages = []
    for i, hit in enumerate(markers):
        end = markers[i + 1].start() if i + 1 < len(markers) else len(raw)
        body = raw[hit.end():end].removeprefix("\n")
        stamp = re.search(r"^message time:\s*(.*?)\r?$", body, flags=re.M)
        body = OLD_IMG.sub(lambda m: f"images/nui-lab-{n}-{m[1]}", body)
        messages.append({"speaker": "user" if hit[1] == "you asked" else "assistant",
                         "timestamp": stamp[1] if stamp else None, "text": body})
    data = raw.encode("utf-8")
    blob_sha = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    new = {"number": n, "title": f"NUI Lab {n}", "source_path": f"imported://{md_path.name}",
           "source_chat": origin[1] if origin else "", "source_blob_sha": blob_sha,
           "preamble": preamble, "images": [f"images/nui-lab-{n}-{p.name}" for p in imgs],
           "messages": messages}
    return new, imgs


def make_toon(sessions):
    lines = ["# NUI Lab history, newest first, no deduplication.",
             "format: TOON", "version: 1", "order: newest-first",
             f"session_count: {len(sessions)}", "source_repository: lustresense/hitl-momo",
             "images_directory: images", "original_transcripts_preserved: true",
             f"sessions[{len(sessions)}]:"]
    for s in sessions:
        n, msgs, imgs = s["number"], s["messages"], s["images"]
        lines += [f"  # ==================== NUI LAB {n} | {len(msgs)} MESSAGES ====================",
                  f"  - number: {n}"]
        for key in ("title", "source_path", "source_chat", "source_blob_sha"):
            lines.append(f"    {key}: {quote(s[key])}")
        lines += [f"    message_count: {len(msgs)}", f"    image_count: {len(imgs)}",
                  f"    images[{len(imgs)}]:" + (" " + ",".join(imgs) if imgs else ""),
                  f"    preamble: {quote(s['preamble'])}", f"    messages[{len(msgs)}]:"]
        for m in msgs:
            lines += [f"      - speaker: {m['speaker']}",
                      f"        timestamp: {quote(m.get('timestamp'))}",
                      f"        text: {quote(m['text'])}"]
    return "\n".join(lines) + "\n"


def batches(sessions):
    for s in sessions:
        part, size, first, ordinal = [], 0, 1, 1
        for pos, msg in enumerate(s["messages"], start=1):
            cost = len(msg["text"]) + 130
            if part and (len(part) >= 16 or size + cost > 30000):
                yield s, ordinal, first, pos - 1, part
                part, size, first, ordinal = [], 0, pos, ordinal + 1
            part.append(msg)
            size += cost
        if part:
            yield s, ordinal, first, len(s["messages"]), part


# This stoplist is only for generated lookup hints, never for deleting messages.
STOP = set("""
yang dengan untuk dari kalau karena jadi bisa udah sudah masih itu ini disini disitu
banget bangetnya pada dalam tidak bukan akan sama cuma saja agar atas bawah
gw gue gua lu lo loh lah ya iya nah si dan atau tapi terus juga lagi mau
nggak engga gak ga ada apa siapa kapan gimana dimana kenapa bagaimana
tolong coba bikin buat kasih cek baca liat lihat dong coba lagi sudah
anjing jancok cok asu kontol goblok wkwk anjirr
aja situ dll gitu harus jangan kalo kan pake gausah berarti emang enak baru biar dah kea kayak
banget emang sih tuh yaudah oiya udahnya apaada deh loh anjir asuuu
chat chatgpt asked response message time selected text selection
nui lab terbaru lama dulu tadi sekarang semua setiap sendiri
https github com www md png html file repo branch main
tersebut saya kamu kita mereka dengan dapat tersebut
""".split())


def message_key(msg):
    return (msg["speaker"], " ".join(msg["text"].split()))


def find_terms(messages):
    counts = {}
    for msg in messages:
        if msg["speaker"] != "user":
            continue
        body = re.sub(r"(?m)^message time:.*$", "", msg["text"])
        body = re.sub(r"https?://\S+", " ", body)
        body = re.sub(r"(?m)^# (Selected text|Selection).*?$", "", body)
        for word in set(re.findall(r"[a-z][a-z0-9_-]{2,}", body[:500].lower())):
            if word not in STOP and not word.isdigit() and len(word) <= 28:
                counts[word] = counts.get(word, 0) + 1
    return ", ".join(sorted(counts, key=lambda w: (-counts[w], w))[:8]) or "(lihat chunk)"


def render_outputs(sessions):
    """Deterministic, in-memory derivatives. TOON is the single canonical archive."""
    records = list(batches(sessions))
    expected = {}
    index = ["# Indeks lengkap retrieval NUI Lab", "",
             "Turunan otomatis dari NUI_LAB_HISTORY.toon. Bukan keputusan PA.",
             "Untuk routing hemat token, mulai dari [MAP.md](MAP.md), lalu buka chunk terpilih.",
             "Jangan memuat TOON untuk pertanyaan biasa; TOON hanya untuk ingest, recovery, atau audit verbatim.", "",
             f"- Sesi: {len(sessions)}",
             f"- Pesan historis: {sum(len(s['messages']) for s in sessions)}",
             f"- Chunk: {len(records)}", "",
             "| Sesi | ID pesan | Chunk | Cuplikan pesan pengguna |",
             "|---|---|---|---|"]
    lookup = ["# Peta retrieval NUI Lab (baca ini lebih dulu)", "",
              "Ini peta pendek berbasis kata dari pesan pengguna. Kata kunci adalah petunjuk otomatis, bukan ringkasan fakta.",
              "Cari topik/frasa, pilih 1-2 chunk, kemudian cek chunk tetangga bila percakapan terpotong.",
              "Baris bertanda duplikat mengacu ke kemunculan lebih baru; jangan memuat ulang tanpa alasan.",
              "Setiap Lx-Myyy adalah ID pesan historis, bukan otoritas keputusan. TOON hanya untuk verifikasi verbatim.", "",
              f"{len(sessions)} sesi / {sum(len(s['messages']) for s in sessions)} pesan / {len(records)} chunk.", "",
              "| Sesi | Pesan | Chunk | Topik otomatis | Duplikasi pesan |",
              "|---|---|---|---|---|"]
    previously = set()
    for s in sessions:
        previously_this_session = set()
        for sess, ordinal, first, last, msgs in (r for r in records if r[0] is s):
            n = sess["number"]
            name = f"nui-lab-{n}-{ordinal:03d}.md"
            rel = Path("retrieval") / "chunks" / f"s{n}" / name
            doc = [f"# NUI Lab {n} | pesan {first}-{last}", "",
                   "> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.",
                   f"> Source: {sess['source_chat'] or sess['source_path']}",
                   f"> Source Git blob: {sess['source_blob_sha']}", ""]
            for i, msg in enumerate(msgs):
                body = LOCAL_IMG.sub(lambda m: f"../../../images/{m[1]}", msg["text"])
                speaker = "User" if msg["speaker"] == "user" else "Assistant"
                doc += [f"## L{n}-M{first+i:03d} | {speaker} | {msg.get('timestamp') or 'waktu tidak ada'}",
                        "", body.rstrip(), "", "---", ""]
            expected[rel] = "\n".join(doc)
            examples = [" ".join(m["text"].split()).replace("|", r"\|")[:100]
                        for m in msgs if m["speaker"] == "user"][:2]
            index.append(f"| {n} | {first}-{last} | [L{n}-M{first:03d}..{last:03d}](chunks/s{n}/{name}) | {' / '.join(examples)} |")
            dup = sum(message_key(m) in previously for m in msgs)
            lookup.append(f"| {n} | {first}-{last} | [L{n}-M{first:03d}](chunks/s{n}/{name}) | {find_terms(msgs).replace('|', '/')} | {dup}/{len(msgs)} |")
            previously_this_session.update(message_key(m) for m in msgs)
        previously.update(previously_this_session)
    expected[Path("retrieval/INDEX.md")] = "\n".join(index) + "\n"
    expected[Path("retrieval/MAP.md")] = "\n".join(lookup) + "\n"
    return expected


def check_images(sessions, added=()):
    available = {p.name for p in (ROOT / "images").glob("*.png")} | set(added)
    for s in sessions:
        for img in s["images"]:
            if Path(img).name not in available:
                raise ValueError(f"Image missing: {img}")
        for msg in s["messages"]:
            if OLD_IMG.search(msg["text"]):
                raise ValueError("Legacy image path not converted")
            for name in LOCAL_IMG.findall(msg["text"]):
                if name not in available:
                    raise ValueError(f"Dangling image reference: {name}")


def check_outputs(expected):
    """Read-only: detect missing, stale, modified and unexpected derived chunks."""
    errors = []
    for relative, content in expected.items():
        current = ROOT / relative
        if not current.is_file():
            errors.append(f"MISSING {relative}")
        elif current.read_text(encoding="utf-8") != content:
            errors.append(f"STALE {relative}")
    chunks = {ROOT / p for p in expected if p.parts[:2] == ("retrieval", "chunks")}
    for f in (ROOT / "retrieval" / "chunks").glob("s*/nui-lab-*.md"):
        if f not in chunks:
            errors.append(f"UNEXPECTED {f.relative_to(ROOT)}")
    if errors:
        raise ValueError("Retrieval mismatch:\n" + "\n".join(errors[:25]) +
                         (f"\n... {len(errors) - 25} more" if len(errors) > 25 else ""))


def publish(expected, removed=()):
    """Prestage all files; roll back ordinary write errors, not power-loss crashes."""
    changes = {}
    for relative, content in expected.items():
        dest = ROOT / relative
        data = content.encode("utf-8") if isinstance(content, str) else content
        if not dest.is_file() or dest.read_bytes() != data:
            changes[dest] = data
    remove = [p for p in removed if p.is_file() and p not in changes]
    if not changes and not remove:
        return 0
    original = {p: p.read_bytes() if p.is_file() else None for p in [*changes, *remove]}
    with tempfile.TemporaryDirectory(prefix=".archive-stage-", dir=ROOT) as temporary:
        stage = Path(temporary)
        staged = []
        for i, (dest, data) in enumerate(changes.items()):
            staged_file = stage / f"{i:05d}"
            staged_file.write_bytes(data)
            staged.append((staged_file, dest))
        try:
            for source, dest in staged:
                dest.parent.mkdir(parents=True, exist_ok=True)
                os.replace(source, dest)
            for dest in remove:
                dest.unlink()
        except Exception:
            for dest, before in original.items():
                if before is None:
                    dest.unlink(missing_ok=True)
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(before)
            raise
    return len(changes) + len(remove)


def stale_chunks(expected):
    keep = {ROOT / p for p in expected if p.parts[:2] == ("retrieval", "chunks")}
    return sorted(f for f in (ROOT / "retrieval" / "chunks").glob("s*/nui-lab-*.md")
                  if f not in keep)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--md", type=Path, help="ChatGPT Exporter Markdown to ingest")
    p.add_argument("--session", type=int)
    p.add_argument("--images-dir", type=Path)
    p.add_argument("--check", action="store_true", help="Read-only integrity gate")
    p.add_argument("--rebuild", action="store_true", help="Repair generated retrieval from TOON")
    opt = p.parse_args()
    if opt.check and (opt.md or opt.rebuild):
        p.error("--check is read-only; use it in a separate invocation after ingest/rebuild")
    if opt.md and opt.rebuild:
        p.error("--md already rebuilds retrieval; do not combine with --rebuild")
    if not opt.md and (opt.session is not None or opt.images_dir is not None):
        p.error("--session and --images-dir require --md")
    sessions = read_toon()
    imported = []
    extras = {}
    if opt.md:
        if opt.session is None or opt.session <= max(s["number"] for s in sessions):
            p.error("New --session must be greater than every existing session number")
        new, imported = get_import(opt.md, opt.session, opt.images_dir)
        sessions.insert(0, new)
        for src in imported:
            filename = f"nui-lab-{opt.session}-{src.name}"
            extras[Path("images") / filename] = src.read_bytes()
    check_images(sessions, added=(p.name for p in extras))
    expected = render_outputs(sessions)
    if opt.md:
        expected[Path("NUI_LAB_HISTORY.toon")] = make_toon(sessions)
    if opt.md or opt.rebuild:
        changed = publish({**expected, **extras}, removed=stale_chunks(expected))
        check_outputs(expected)
        print(f"UPDATED: {changed} files, {len(sessions)} sessions, "
              f"{sum(len(s['messages']) for s in sessions)} messages")
    else:
        check_outputs(expected)
        print(f"INTEGRITY PASS (read-only): {len(sessions)} sessions, "
              f"{sum(len(s['messages']) for s in sessions)} messages, "
              f"{len(list(batches(sessions)))} chunks")
    print("Repository-specific parser; no claim of official TOON decoder round-trip.")


if __name__ == "__main__":
    main()
