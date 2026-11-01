"""Redivis AIMI benchmark schema preflight. Metadata only; no rows or files.

Fails closed for unavailable tables and never prints patient records, paths,
filenames, source images, IDs, signed URLs or token values.
"""
from __future__ import annotations
import json
import os
import re
import redivis

TARGETS = [
    ("DDI", "DDI - Diverse Dermatology Images"),
    ("DDI2", "DDI2: Diverse Dermatology Images- 2"),
    ("MIDAS", "MRA-MIDAS: Multimodal Image Dataset for AI-based Skin Cancer"),
    ("CheXpert Plus", "CheXpert Plus"),
    ("PhysicianBench", "PhysicianBench"),
    ("INSPECT", "INSPECT: A Multimodal Dataset for Pulmonary Embolism Diagnosis and Prognosis"),
]
# Names only, and only clinical label / annotation-related column names.
LABEL_TERMS = ("label", "diagnos", "patholog", "ground_truth", "gt_", "finding",
               "malignan", "benign", "disease", "target", "outcome", "severity",
               "lesion", "reference", "class", "score")
SENSITIVE_TERMS = ("patient", "person", "subject", "person_id", "file", "path",
                   "url", "key", "token", "secret", "accession", "name",
                   "birth", "date", "time", "note", "report", "text",
                   "location", "address", "email", "phone", "hash")
def label_candidate(name):
    n = name.lower()
    return any(t in n for t in LABEL_TERMS) and not any(t in n for t in SENSITIVE_TERMS)
def safe_name(s):
    return re.sub(r"[^a-zA-Z0-9_ -]", "", str(s or ""))[:90]
def main():
    if not os.environ.get("REDIVIS_API_TOKEN"):
        raise SystemExit("REDIVIS_SECRET_MISSING")
    org = redivis.organization("AIMI")
    outcome = []
    for alias, dataset_name in TARGETS:
        entry = {"dataset": alias, "tables": [], "rowsDownloaded": 0, "filesDownloaded": 0}
        try:
            dataset = org.dataset(dataset_name)
            tables = dataset.list_tables(max_results=30)
            for table in tables:
                p = table.properties or {}
                t = {"table": safe_name(p.get("name")), "variablesStatus": "unknown"}
                try:
                    vars_ = table.list_variables(max_results=250)
                    names = [str((v.properties or {}).get("name") or "") for v in vars_]
                    t["variableCountInspected"] = len(names)
                    t["potentialLabelColumns"] = [safe_name(n) for n in names if label_candidate(n)][:25]
                    t["variablesStatus"] = "ok"
                except Exception as e:
                    t["variablesStatus"] = type(e).__name__
                entry["tables"].append(t)
        except Exception as e:
            entry["errorType"] = type(e).__name__
        outcome.append(entry)
    print("REDIVIS_LABEL_SCHEMA_PREFLIGHT " + json.dumps(outcome, ensure_ascii=False))
    print("NO_ROWS_NO_IMAGES_NO_EXTERNAL_LLM_CALLS")
if __name__ == "__main__":
    main()
