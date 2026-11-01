#!/usr/bin/env python3
"""Download ONLY ten original CC0 ISIC-2016 Task-3 training dermoscopy JPEGs.

No 600 MB archive, no restricted Stanford data, no private labels. ISIC-2016
Task 3 training dataset is listed as CC0 by its official challenge data page.
Image labels are stored separately, never sent to model input. No image data
is committed or uploaded in CI artifacts.
"""
import csv
import hashlib
import io
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image

GT_URL = "https://isic-archive.s3.amazonaws.com/challenges/2016/ISBI2016_ISIC_Part3_Training_GroundTruth.csv"
API_URL = "https://api.isic-archive.com/api/v2/images/"
ROOT = Path("isic2016-ten")
IMAGES = ROOT / "images"
ROOT.mkdir(parents=True, exist_ok=True)
IMAGES.mkdir(parents=True, exist_ok=True)

session = requests.Session()
session.headers["User-Agent"] = "DoctorOpusMAST/1.0 (public academic dermoscopy 10-image smoke)"
def get(url):
    for retry in range(3):
        try:
            r = session.get(url, timeout=(12, 40))
            r.raise_for_status()
            return r
        except requests.RequestException:
            if retry == 2:
                raise
            time.sleep(2 * (retry + 1))

raw = get(GT_URL).content
rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
pairs = [(r[0].strip(), r[1].strip().lower()) for r in rows if len(r) == 2]
assert len(pairs) == 900 and len({n for n, _ in pairs}) == 900, "Not the official 900-record training file"
assert set(c for _, c in pairs) == {"benign", "malignant"}
assert all(re.fullmatch(r"ISIC_\d{7}", name) for name, _ in pairs)
classes = {label: sorted((id for id, kind in pairs if kind == label),
           key=lambda id: hashlib.sha256(("opus-mast-2026-isic2016-v1|" + id).encode()).hexdigest())[:5]
           for label in ("benign", "malignant")}
ids = [id for label in ("benign", "malignant") for id in classes[label]]
assert len(ids) == 10 and len(set(ids)) == 10
print("ISIC_PREFLIGHT_SELECTION", json.dumps({"selected": ids, "classCounts": {"benign": 5, "malignant": 5}}), flush=True)
manifest = {
    "dataset": "ISIC 2016 Task 3 Training",
    "source": GT_URL,
    "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "collectionPage": "https://api.isic-archive.com/collections/74/",
    "licenseBasis": "ISIC official Challenge Datasets lists ISIC 2016 Task 3 as CC-0; verify image-specific metadata; reject incompatible restrictions",
    "challengeLicensePage": "https://challenge.isic-archive.com/data/",
    "selection": "sha256 seeded deterministic within source CSV, balanced 5/5; research dev only",
    "cases": []
}
for i, id in enumerate(ids, 1):
    metadata = get(API_URL + id + "/").json()
    # The ISIC API v2 has documented files.full.url and may carry a copyright
    # string in either its image or metadata fields, depending on collection.
    license_field = None
    for container in [metadata, metadata.get("metadata", {}), metadata.get("copyright", {})]:
        if not isinstance(container, dict):
            continue
        for key in ("copyright_license", "copyrightLicense", "license", "license_url", "copyright"):
            value = container.get(key)
            if isinstance(value, str) and value.strip():
                license_field = value.strip()
                break
        if license_field:
            break
    if license_field:
        low = license_field.lower().replace("_", "-")
        if any(s in low for s in ("noncommercial", "non-commercial", "cc-by-nc", "cc by-nc", "all rights reserved")):
            raise RuntimeError(f"Individual ISIC image license not permitted for this pilot: {id}")
    files = metadata.get("files", {})
    url = files.get("full", {}).get("url") if isinstance(files.get("full"), dict) else None
    if not isinstance(url, str):
        raise RuntimeError(f"No original ISIC full image URL for {id}")
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise RuntimeError(f"Non-HTTPS image source {id}")
    allowed_host = parsed.hostname or ""
    if not (allowed_host.endswith(".isic-archive.com") or allowed_host in ("isic-archive.com", "api.isic-archive.com")
            or allowed_host.endswith(".amazonaws.com") or allowed_host.endswith(".cloudfront.net")):
        raise RuntimeError(f"Unexpected ISIC image source hostname for {id}: {allowed_host}")
    blob = get(url).content
    if not (20000 < len(blob) < 9000000) or blob[:2] != b"\xff\xd8":
        raise RuntimeError(f"Invalid ISIC JPEG source {id}")
    with Image.open(io.BytesIO(blob)) as img:
        img.verify()
    path = IMAGES / (id + ".jpg")
    path.write_bytes(blob)
    item = {
        "id": id, "label": dict(pairs)[id],
        "file": str(path), "imageUrl": url,
        "sourceMetadataUrl": API_URL + id + "/",
        "declaredIndividualLicense": license_field,
        "licensedViaOfficial2016CC0Dataset": True,
        "sha256": hashlib.sha256(blob).hexdigest(),
        "bytes": len(blob)
    }
    manifest["cases"].append(item)
    print("ISIC_PREFLIGHT_IMAGE", json.dumps({"id": id, "bytes": len(blob), "license": license_field}), flush=True)
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
assert len(manifest["cases"]) == 10
print("ISIC_PREFLIGHT_READY", json.dumps({"images": 10, "bytes": sum(c["bytes"] for c in manifest["cases"])}), flush=True)
