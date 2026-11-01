#!/usr/bin/env python3
"""Inspect authorized CPC-Bench PUBLIC release locally without exposing NEJM content.

CPC-Bench is NOT Microsoft SDBench synthetic; consult dataset Terms of Use.
This tool never contacts the network, unpacks archive entries, logs case text,
uploads artifacts or invokes LLMs. Run only on legally acquired files.
Outputs inventory metadata (file extension, approximate size, keys/columns).
The file schemas are intentionally discovered, not assumed.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
from collections import Counter
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from typing import Iterable

VALID_FORMATS = {".json", ".jsonl", ".csv", ".tsv", ".parquet", ".txt", ".md",
                 ".png", ".jpg", ".jpeg", ".webp", ".pdf", ".html", ".xlsx"}
MAX_SCHEMA_BYTES = 800_000
MAX_ENTRIES = 20_000
MAX_NESTED_BUNDLE_BYTES = 2_000_000_000

def safe_name(name: str) -> bool:
    p = PurePosixPath(name)
    return (bool(name) and not name.startswith("/") and
            all(part not in (".", "..") for part in p.parts) and
            "\\" not in name and "\x00" not in name)

def summarize_schema(name: str, raw: bytes) -> dict:
    ext = Path(name).suffix.lower()
    if ext not in (".json", ".jsonl", ".csv", ".tsv") or len(raw) > MAX_SCHEMA_BYTES:
        return {}
    try:
        text = raw.decode("utf-8-sig")
        if ext == ".json":
            payload = json.loads(text)
            obj = payload[0] if isinstance(payload, list) and payload else payload
            if not isinstance(obj, dict):
                return {"structure": type(payload).__name__}
            return {"recordCount": len(payload) if isinstance(payload, list) else None,
                    "keys": sorted(obj.keys())[:80]}
        if ext == ".jsonl":
            for line in text.splitlines():
                if not line.strip(): continue
                obj = json.loads(line)
                return {"keys": sorted(obj.keys())[:80]} if isinstance(obj, dict) else {"structure": type(obj).__name__}
        delimiter = "\t" if ext == ".tsv" else ","
        columns = next(csv.reader(io.StringIO(text), delimiter=delimiter))
        return {"columns": columns[:80]}
    except (UnicodeError, ValueError, csv.Error):
        return {"schema": "not-readable-with-simple-text-parser"}
    return {}

def summarize_entries(entries: Iterable[tuple[str, int, bytes | None]], limit: int) -> dict:
    extensions: Counter[str] = Counter()
    examples: list[dict] = []
    total = 0
    skipped = 0
    for name, size, sample in entries:
        if not safe_name(name):
            raise ValueError("Unsafe archive path was detected; archive not processed")
        total += 1
        if total > MAX_ENTRIES:
            raise ValueError("Too many entries; refuse oversized untrusted listing")
        if size < 0 or size > MAX_NESTED_BUNDLE_BYTES:
            raise ValueError("Entry size violates safety limit")
        ext = Path(name).suffix.lower() or "(none)"
        extensions[ext] += 1
        if ext not in VALID_FORMATS:
            skipped += 1
        if len(examples) < limit:
            # Listing names may contain non-public data; only show basename,
            # and only after rejecting obvious personally identifying patterns.
            # Use a numeric index when in doubt; NEVER emit source bytes.
            item = {"entry": total, "fileType": ext, "bytes": size}
            if sample is not None:
                item["schema"] = summarize_schema(name, sample)
            examples.append(item)
    return {"files": total, "extensions": dict(extensions),
            "unrecognizedExtensions": skipped, "sampleSchemas": examples,
            "disclaimer": "Structure only, no CPC text or labels; confirm license before external LLM submission."}

def inventory(path: Path, limit: int) -> dict:
    if path.is_dir():
        paths = sorted(p for p in path.rglob("*") if p.is_file())
        root = path.resolve()
        def walk():
            for p in paths:
                if p.is_symlink() or not p.resolve().is_relative_to(root):
                    raise ValueError("Symlink or path escape refused")
                size = p.stat().st_size
                sample = p.read_bytes() if size <= MAX_SCHEMA_BYTES else None
                yield p.relative_to(path).as_posix(), size, sample
        return summarize_entries(walk(), limit)
    if path.suffix.lower() != ".zip":
        raise ValueError("Provide a directory or ZIP. No data files are uploaded by this script")
    with ZipFile(path) as archive:
        infos = [i for i in archive.infolist() if not i.is_dir()]
        # Refuse duplicates and symlink entries; archive not extracted.
        names = [i.filename for i in infos]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive paths refused")
        def walk():
            for i in infos:
                mode = (i.external_attr >> 16) & 0o170000
                if mode == 0o120000:
                    raise ValueError("Archive symlinks refused")
                raw = archive.read(i) if i.file_size <= MAX_SCHEMA_BYTES else None
                yield i.filename, i.file_size, raw
        return summarize_entries(walk(), limit)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("archive", type=Path, help="Authorized CPC-Bench release ZIP or extracted local directory")
    ap.add_argument("--max-schema-examples", type=int, default=12)
    ap.add_argument("--output", type=Path, default=None,
                    help="Optional LOCAL JSON inventory; never commit protected case content")
    args = ap.parse_args()
    if not args.archive.exists():
        ap.error("CPC-Bench dataset missing; download under its Terms of Use first")
    report = inventory(args.archive, max(0, min(args.max_schema_examples, 30)))
    blob = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(blob+"\n", encoding="utf8")
    print(blob)
