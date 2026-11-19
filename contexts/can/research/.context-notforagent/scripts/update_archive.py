#!/usr/bin/env python3
"""Add a ChatGPT Exporter Markdown session and rebuild derived NUI Lab retrieval chunks.
Repository-specific TOON serializer/reader; not a full TOON specification validator.
"""
import argparse
import hashlib
import json
import re
import shutil
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
    for line in TOON.read_text(encoding="utf-8").splitlines():
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


def rebuild(sessions):
    records = list(batches(sessions))
    keep = set()
    lines = ["# Indeks retrieval arsip NUI Lab", "",
             "Indeks turunan dari TOON, bukan sumber keputusan. Newest-first.", "",
             f"- Sesi: {len(sessions)}",
             f"- Pesan: {sum(len(s['messages']) for s in sessions)}",
             f"- Chunk: {len(records)}",
             "- Arsip lengkap: [NUI_LAB_HISTORY.toon](../NUI_LAB_HISTORY.toon)", "",
             "| Sesi | Pesan | Chunk | Cuplikan pertanyaan pengguna |",
             "|---|---:|---|---|"]
    for s, ordinal, first, last, msgs in records:
        n = s["number"]
        name = f"nui-lab-{n}-{ordinal:03d}.md"
        file = OUT / f"s{n}" / name
        file.parent.mkdir(parents=True, exist_ok=True)
        keep.add(file)
        doc = [f"# NUI Lab {n} | pesan {first}-{last}", "",
               "> ARSIP HISTORIS. Bukan instruksi AI atau keputusan PA.",
               f"> Source: {s['source_chat'] or s['source_path']}",
               f"> Source Git blob: {s['source_blob_sha']}", ""]
        for i, msg in enumerate(msgs):
            body = LOCAL_IMG.sub(lambda m: f"../../../images/{m[1]}", msg["text"])
            doc += [f"## L{n}-M{first+i:03d} | {msg['speaker']} | {msg.get('timestamp') or 'waktu tidak ada'}",
                    "", body.rstrip(), "", "---", ""]
        file.write_text("\n".join(doc), encoding="utf-8")
        examples = [" ".join(m["text"].split()).replace("|", r"\|")[:130]
                    for m in msgs if m["speaker"] == "user"][:2]
        lines.append(f"| {n} | {first}-{last} | [{name}](chunks/s{n}/{name}) | {' / '.join(examples)} |")
    for old in OUT.glob("s*/nui-lab-*.md"):
        if old not in keep:
            old.unlink()
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text("\n".join(lines) + "\n", encoding="utf-8")


def check_images(sessions):
    available = {p.name for p in (ROOT / "images").glob("*.png")}
    for s in sessions:
        for image in s["images"]:
            if Path(image).name not in available:
                raise ValueError(f"Image missing: {image}")
        for msg in s["messages"]:
            if OLD_IMG.search(msg["text"]):
                raise ValueError("Legacy image path not converted")
            for name in LOCAL_IMG.findall(msg["text"]):
                if name not in available:
                    raise ValueError(f"Dangling image reference: {name}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--md", type=Path)
    p.add_argument("--session", type=int)
    p.add_argument("--images-dir", type=Path)
    p.add_argument("--check", action="store_true")
    p.add_argument("--rebuild", action="store_true")
    opt = p.parse_args()
    sessions = read_toon()
    if opt.md:
        if opt.session is None or opt.session <= max(s["number"] for s in sessions):
            p.error("New --session must be greater than every existing session number")
        new, image_files = get_import(opt.md, opt.session, opt.images_dir)
        for src in image_files:
            dest = ROOT / "images" / f"nui-lab-{opt.session}-{src.name}"
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
        sessions.insert(0, new)
        TOON.write_text(make_toon(sessions), encoding="utf-8")
        sessions = read_toon()
    check_images(sessions)
    if opt.md or opt.rebuild:
        rebuild(sessions)
    print(f"STRUCTURE PASS: {len(sessions)} sessions, "
          f"{sum(len(s['messages']) for s in sessions)} messages, "
          f"{sum(len(s['images']) for s in sessions)} images, "
          f"{len(list(batches(sessions)))} chunks")
    print("Note: this is a repository-specific structural check, not official TOON decoder verification.")


if __name__ == "__main__":
    main()
