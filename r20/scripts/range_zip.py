#!/usr/bin/env python3
"""In-memory HTTP Range ZIP & ZIP64 reader for streaming individual entries without saving archives."""
from __future__ import annotations

import dataclasses
import struct
import threading
import time
import urllib.error
import urllib.request
import zlib
from typing import Optional


@dataclasses.dataclass(frozen=True)
class ZipEntry:
    filename: str
    compress_method: int
    crc32: int
    comp_size: int
    uncomp_size: int
    local_header_offset: int
    flag_bits: int


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class RangeZipReader:
    """Streams ZIP Central Directory and individual entries via HTTP 206 Range requests."""

    def __init__(
        self,
        url: str,
        timeout: float = 30.0,
        max_retries: int = 8,
        expected_size: Optional[int] = None,
        user_agent: str = "R20-RangeZip/1.0",
    ) -> None:
        self.source_url = url
        self.timeout = timeout
        self.max_retries = max_retries
        self.expected_size = expected_size
        self.user_agent = user_agent
        self._lock = threading.Lock()
        self._resolved_url: Optional[str] = None
        self.total_size: int = 0
        self.entries: list[ZipEntry] = []
        self._init_remote_size()

    def _resolve_url(self, force: bool = False) -> str:
        with self._lock:
            if self._resolved_url and not force:
                return self._resolved_url
            req = urllib.request.Request(
                self.source_url,
                headers={"User-Agent": self.user_agent, "Range": "bytes=0-0"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                cr = resp.headers.get("Content-Range")
                if resp.status != 206 or not cr or "/" not in cr:
                    body_preview = resp.read(256)
                    raise RuntimeError(
                        f"Expected HTTP 206 with Content-Range, got status={resp.status}, "
                        f"Content-Range={cr!r}, preview={body_preview!r}"
                    )
                total_str = cr.rsplit("/", 1)[1].strip()
                if not total_str.isdigit():
                    raise RuntimeError(f"Invalid Content-Range total: {cr!r}")
                sz = int(total_str)
                if sz < 22 or (self.expected_size is not None and sz != self.expected_size):
                    raise RuntimeError(f"Remote size mismatch: {sz} != expected {self.expected_size}")
                self.total_size = sz
                self._resolved_url = resp.geturl()
                resp.read(1)
            return self._resolved_url

    def _init_remote_size(self) -> None:
        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                self._resolve_url(force=True)
                if self.total_size > 0:
                    return
                raise RuntimeError("Could not determine remote ZIP total_size via Range")
            except Exception as exc:
                last_err = exc
                time.sleep(min(2 ** attempt, 16))
        raise RuntimeError(f"Failed to probe remote ZIP {self.source_url}: {last_err}")

    def read_range(self, start: int, end_inclusive: int) -> bytes:
        if start < 0:
            start = 0
        if end_inclusive >= self.total_size:
            end_inclusive = self.total_size - 1
        if end_inclusive < start:
            return b""
        expected = end_inclusive - start + 1
        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                target = self._resolve_url(force=(attempt > 0))
                req = urllib.request.Request(
                    target,
                    headers={
                        "User-Agent": self.user_agent,
                        "Range": f"bytes={start}-{end_inclusive}",
                    },
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    if resp.status not in (200, 206):
                        raise RuntimeError(f"Unexpected HTTP status {resp.status}")
                    data = resp.read()
                    if resp.status == 200 and len(data) == self.total_size:
                        data = data[start : end_inclusive + 1]
                    if len(data) != expected:
                        raise RuntimeError(f"Short range read: got {len(data)} != {expected}")
                    return data
            except urllib.error.HTTPError as exc:
                last_err = exc
                if exc.code in (403, 410):
                    self._resolved_url = None
                time.sleep(min(1.5 * (2 ** attempt), 20.0))
            except Exception as exc:
                last_err = exc
                self._resolved_url = None
                time.sleep(min(1.5 * (2 ** attempt), 20.0))
        raise RuntimeError(f"Range read {start}-{end_inclusive} failed after {self.max_retries} retries: {last_err}")

    def parse_central_directory(self) -> list[ZipEntry]:
        tail_len = min(self.total_size, 65536 + 22 + 256)
        tail_start = self.total_size - tail_len
        tail = self.read_range(tail_start, self.total_size - 1)

        eocd_rel = tail.rfind(b"PK\x05\x06")
        if eocd_rel < 0 or eocd_rel + 22 > len(tail):
            raise RuntimeError("ZIP EOCD signature PK\\x05\\x06 not found in tail")

        (
            _disk_no,
            _cd_disk,
            _disk_entries,
            total_entries,
            cd_size,
            cd_offset,
            _comment_len,
        ) = struct.unpack_from("<HHHHIIH", tail, eocd_rel + 4)

        # Check for ZIP64 EOCD Locator immediately preceding EOCD
        if eocd_rel >= 20 and tail[eocd_rel - 20 : eocd_rel - 16] == b"PK\x06\x07":
            (_disk_eocd64, eocd64_offset, _total_disks) = struct.unpack_from(
                "<IQI", tail, eocd_rel - 16
            )
            eocd64 = self.read_range(eocd64_offset, eocd64_offset + 55)
            if eocd64[:4] != b"PK\x06\x06":
                raise RuntimeError("Invalid ZIP64 EOCD record signature")
            (
                _rec_size,
                _ver_made,
                _ver_need,
                _d1,
                _d2,
                _d_entries,
                total_entries,
                cd_size,
                cd_offset,
            ) = struct.unpack_from("<QHHIIQQQQ", eocd64, 4)

        cd_bytes = self.read_range(cd_offset, cd_offset + cd_size - 1)
        pos = 0
        entries: list[ZipEntry] = []
        while pos < len(cd_bytes):
            sig = cd_bytes[pos : pos + 4]
            if sig != b"PK\x01\x02":
                raise RuntimeError(f"Bad CDFH signature at CD offset {pos}: {sig!r}")
            (
                _ver_made,
                _ver_need,
                flag_bits,
                comp_method,
                _mod_time,
                _mod_date,
                crc32,
                comp_size,
                uncomp_size,
                fname_len,
                extra_len,
                comment_len,
                _disk_start,
                _int_attr,
                _ext_attr,
                local_offset,
            ) = struct.unpack_from("<HHHHHHIIIHHHHHII", cd_bytes, pos + 4)
            pos += 46
            fname_raw = cd_bytes[pos : pos + fname_len]
            pos += fname_len
            extra = cd_bytes[pos : pos + extra_len]
            pos += extra_len
            pos += comment_len

            if flag_bits & 0x0800:
                fname = fname_raw.decode("utf-8", errors="replace")
            else:
                fname = fname_raw.decode("cp437", errors="replace")

            # Parse ZIP64 extra field (tag 0x0001) if needed
            if (
                uncomp_size == 0xFFFFFFFF
                or comp_size == 0xFFFFFFFF
                or local_offset == 0xFFFFFFFF
            ):
                ep = 0
                while ep + 4 <= len(extra):
                    tag, sz = struct.unpack_from("<HH", extra, ep)
                    ep += 4
                    if tag == 0x0001:
                        zpos = ep
                        if uncomp_size == 0xFFFFFFFF and zpos + 8 <= ep + sz:
                            uncomp_size = struct.unpack_from("<Q", extra, zpos)[0]
                            zpos += 8
                        if comp_size == 0xFFFFFFFF and zpos + 8 <= ep + sz:
                            comp_size = struct.unpack_from("<Q", extra, zpos)[0]
                            zpos += 8
                        if local_offset == 0xFFFFFFFF and zpos + 8 <= ep + sz:
                            local_offset = struct.unpack_from("<Q", extra, zpos)[0]
                            zpos += 8
                        break
                    ep += sz

            entries.append(
                ZipEntry(
                    filename=fname,
                    compress_method=comp_method,
                    crc32=crc32,
                    comp_size=comp_size,
                    uncomp_size=uncomp_size,
                    local_header_offset=local_offset,
                    flag_bits=flag_bits,
                )
            )

        if len(entries) != total_entries:
            raise RuntimeError(
                f"CD entry count mismatch: parsed {len(entries)} != expected {total_entries}"
            )
        self.entries = entries
        return entries

    def fetch_entry_bytes(self, entry: ZipEntry, verify_crc: bool = True) -> bytes:
        # Fetch LFH + buffer for extra + compressed bytes in one Range request
        extra_guess = 512
        fname_guess = len(entry.filename.encode("utf-8")) + 16
        fetch_len = 30 + fname_guess + extra_guess + entry.comp_size
        start = entry.local_header_offset
        end = min(self.total_size - 1, start + fetch_len - 1)
        buf = self.read_range(start, end)
        if len(buf) < 30 or buf[:4] != b"PK\x03\x04":
            raise RuntimeError(f"Bad LFH signature for {entry.filename}")
        lfh_fname_len, lfh_extra_len = struct.unpack_from("<HH", buf, 26)
        data_rel = 30 + lfh_fname_len + lfh_extra_len
        need_total = data_rel + entry.comp_size
        if len(buf) < need_total:
            missing_start = start + len(buf)
            missing_end = start + need_total - 1
            buf = buf + self.read_range(missing_start, missing_end)
        comp_data = buf[data_rel : data_rel + entry.comp_size]

        if entry.compress_method == 0:
            raw = comp_data
        elif entry.compress_method == 8:
            raw = zlib.decompress(comp_data, -zlib.MAX_WBITS)
        else:
            raise RuntimeError(
                f"Unsupported compression method {entry.compress_method} for {entry.filename}"
            )
        if len(raw) != entry.uncomp_size:
            raise RuntimeError(
                f"Decompressed size mismatch for {entry.filename}: {len(raw)} != {entry.uncomp_size}"
            )
        if verify_crc:
            got_crc = zlib.crc32(raw) & 0xFFFFFFFF
            if got_crc != entry.crc32:
                raise RuntimeError(
                    f"CRC32 mismatch for {entry.filename}: {got_crc:#x} != {entry.crc32:#x}"
                )
        return raw
