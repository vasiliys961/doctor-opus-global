"""Read-only Redivis access inventory for Stanford datasets; never fetch rows or files.

Intended to run with REDIVIS_API_TOKEN in GitHub Actions environment.
Prints only dataset titles, Redivis access levels, and safe public URLs.
Applied/pending approval status is not exposed by the dataset overview API;
metadata-only must NOT be presented as approved data access.
"""
from __future__ import annotations

import json
import os
import re
import sys
import redivis

OWNERS = ("AIMI",)
KEYWORDS = (
    "physicianbench", "diversedermatology", "ddi2", "ddi",
    "mra-midas", "midas", "thyroidultrasound", "inspect",
    "mura", "chexphoto", "chexmultimodal", "chexpert", "ol3i",
    "echonet", "radgraph", "ehrshot", "brainmetshare", "coca",
    "radfusion", "cmrcore", "lera", "chexthought", "boneage",
    "prostate", "sinoct", "merlin", "mrnet", "chexlocalize",
    "opal", "openpocus", "pocus", "tumormap", "skm-tea",
    "scope-hn", "spade"
)
PERMITTED_LEVELS = {"none", "overview", "metadata", "sample", "data", "edit"}
DATA_LEVELS = {"data", "edit"}
SAMPLE_LEVELS = {"sample", "data", "edit"}

def matching(name):
    canonical = re.sub(r"[^a-z0-9]+", "", name.casefold())
    if canonical == "udise" or "school" in canonical:\n        return False\n    return any(re.sub(r"[^a-z0-9]+", "", word) in canonical for word in KEYWORDS)

def summarize(owner, properties):
    if not isinstance(properties, dict):
        return None
    name = str(properties.get("name") or "").strip()
    if not name or not matching(name):
        return None
    level = str(properties.get("accessLevel") or "unknown").casefold()
    if level not in PERMITTED_LEVELS:
        level = "unknown"
    url = str(properties.get("url") or "")
    if url and not url.startswith(("https://redivis.com/", "https://stanford.redivis.com/")):
        url = ""
    return {
        "name": name[:160], "owner": owner, "accessLevel": level,
        "sampleAccess": level in SAMPLE_LEVELS,
        "dataAccess": level in DATA_LEVELS,
        "url": url[:300] if url else None,
        "tableCount": properties.get("tableCount") if isinstance(properties.get("tableCount"), int) else None
    }

def main():
    if not os.environ.get("REDIVIS_API_TOKEN"):
        print("REDIVIS_ACCESS_ERROR missing_token")
        return 2
    summary = []
    checks = []
    for owner in OWNERS:
        try:
            datasets = redivis.organization(owner).list_datasets(max_results=1000)
            checks.append({"organization": owner, "status": "ok", "visibleCount": len(datasets)})
            for dataset in datasets:
                item = summarize(owner, dataset.properties)
                if item:
                    summary.append(item)
        except Exception as exc:
            # Never log exception text: auth/HTTP errors may contain private details.
            checks.append({"organization": owner,
                           "status": "unavailable",
                           "errorType": type(exc).__name__})
    summary.sort(key=lambda x: (x["name"].casefold(), x["owner"]))
    report = {
        "method": "redivis.organization.list_datasets",
        "scope": "metadata_only",
        "organizations": checks,
        "matchingDatasets": summary,
        "matchingCount": len(summary),
        "dataAccessibleCount": sum(x["dataAccess"] for x in summary),
        "sampleAccessibleCount": sum(x["sampleAccess"] for x in summary),
        "note": "Only dataset-level access shown; Applied/pending applications are not returned by this API. No patient data, file contents or images retrieved."
    }
    print("REDIVIS_ACCESS_INVENTORY " + json.dumps(report, ensure_ascii=False))
    # If all checks fail, metadata proof cannot be made.
    return 0 if any(check["status"] == "ok" for check in checks) else 3

if __name__ == "__main__":
    sys.exit(main())
