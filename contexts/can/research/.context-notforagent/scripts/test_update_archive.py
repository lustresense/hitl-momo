#!/usr/bin/env python3
"""Tests for the TOON -> retrieval pipeline, offline and without extra packages."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nui_archive_updater", HERE / "update_archive.py")
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


def session(number, text="Drawing with webcam"):
    return {
        "number": number,
        "title": f"NUI Lab {number}",
        "source_path": f"imported://nui-{number}.md",
        "source_chat": "",
        "source_blob_sha": "0123456789abcdef",
        "preamble": "",
        "images": [],
        "messages": [
            {"speaker": "user", "timestamp": "2026-11-19 10:00:00", "text": text},
            {"speaker": "assistant", "timestamp": None, "text": "Reply"}
        ],
    }


class ArchivePipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.originals = (archive.ROOT, archive.TOON, archive.OUT, archive.INDEX)
        archive.ROOT = self.root
        archive.TOON = self.root / "NUI_LAB_HISTORY.toon"
        archive.OUT = self.root / "retrieval" / "chunks"
        archive.INDEX = self.root / "retrieval" / "INDEX.md"
        self.addCleanup(self.restore)
        (self.root / "images").mkdir()

    def restore(self):
        archive.ROOT, archive.TOON, archive.OUT, archive.INDEX = self.originals

    def test_round_trip_and_read_only_check(self):
        data = [session(2), session(1, "Old unique research topic")]
        archive.TOON.write_text(archive.make_toon(data), encoding="utf-8")
        parsed = archive.read_toon()
        self.assertEqual([s["number"] for s in parsed], [2, 1])
        expected = archive.render_outputs(parsed)
        self.assertEqual(archive.publish(expected), len(expected))
        before = {p: (self.root / p).read_bytes() for p in expected}
        archive.check_outputs(expected)
        self.assertEqual(before, {p: (self.root / p).read_bytes() for p in expected})
        changed = next(p for p in expected if "chunks" in p.parts)
        (self.root / changed).write_text("corrupt", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "STALE"):
            archive.check_outputs(expected)
        self.assertEqual(archive.publish(expected), 1)
        archive.check_outputs(expected)

    def test_duplicate_retrieval_is_signposted_not_deleted(self):
        data = [session(2), session(1)]
        expected = archive.render_outputs(data)
        map_text = expected[Path("retrieval/MAP.md")]
        self.assertIn("2/2", map_text)
        self.assertIn("0/2", map_text)
        self.assertEqual(len([p for p in expected if "chunks" in p.parts]), 2)
        self.assertEqual(sum(len(s["messages"]) for s in data), 4)

    def test_import_uses_one_canonical_toon(self):
        md = self.root / "export.md"
        md.write_text(
            "> From: https://chatgpt.com/c/test\n\n"
            "# you asked\nmessage time: 2026-11-19 12:00:00\n\nPlease test canvas\n"
            "# chatgpt response\nAnswer\n",
            encoding="utf-8",
        )
        data, images = archive.get_import(md, 3, None)
        self.assertEqual(len(data["messages"]), 2)
        self.assertEqual(images, [])
        self.assertEqual(data["number"], 3)
        self.assertIn("imported://", data["source_path"])

    def test_missing_image_ref_rejected(self):
        data = [session(1, "See images/nui-lab-1-image-002.png")]
        with self.assertRaisesRegex(ValueError, "Dangling image"):
            archive.check_images(data)

    def test_publish_rolls_back_after_normal_write_error(self):
        original = self.root / "retrieval" / "INDEX.md"
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_text("old", encoding="utf-8")
        data = {
            Path("retrieval/INDEX.md"): "new",
            Path("retrieval/MAP.md"): "new map",
        }
        real_replace = os.replace
        calls = [0]

        def fail_second(src, dest):
            calls[0] += 1
            if calls[0] == 2:
                raise OSError("simulated disk error")
            return real_replace(src, dest)

        with mock.patch.object(archive.os, "replace", side_effect=fail_second):
            with self.assertRaisesRegex(OSError, "simulated"):
                archive.publish(data)
        self.assertEqual(original.read_text(encoding="utf-8"), "old")
        self.assertFalse((self.root / "retrieval" / "MAP.md").exists())


if __name__ == "__main__":
    unittest.main()
