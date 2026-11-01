"""AIMI five-case preparation: metadata-only label and image-link schema audit.

Uses only table and variable metadata. Never reads clinical rows, files, images,
identifiers, image paths or signed URLs. The audit explicitly fails when no
table schema could be inspected (rather than reporting a misleading green CI).
"""
from __future__ import annotations

import json
import os
import re

TARGETS = (
    ("DDI", "DDI - Diverse Dermatology Images"),
    ("DDI2", "DDI2: Diverse Dermatology Images- 2"),
    ("MIDAS", "MRA-MIDAS: Multimodal Image Dataset for AI-based Skin Cancer"),
    ("CheXpert Plus", "CheXpert Plus"),
    ("PhysicianBench", "PhysicianBench"),
    ("INSPECT", "INSPECT: A Multimodal Dataset for Pulmonary Embolism Diagnosis and Prognosis"),
)
LABEL_TERMS = (
    "label", "diagnos", "patholog", "ground_truth", "gt_", "finding",
    "malignan", "benign", "disease", "target", "outcome", "severity",
    "lesion", "reference", "class", "score", "melanoma", "histolog",
)
LINK_TERMS = ("file_id", "image", "photo", "study_id", "exam_id",
              "series_id", "dicom", "file_name", "filename", "file_path")
# Only column *names* may be printed; never column contents.
IDENTITY_TERMS = ("patient", "person", "subject", "accession", "birth",
                  "address", "email", "phone", "token", "secret", "signed")
MAX_COLUMNS = 250
MAX_TABLES = 30


def safe_name(value):
    return re.sub(r"[^a-zA-Z0-9_ -]", "", str(value or ""))[:90]


def classify_columns(variable_names):
    labels, links = [], []
    for raw in variable_names:
        name = str(raw or "").strip()
        lower = name.casefold()
        if not name or any(term in lower for term in IDENTITY_TERMS):
            continue
        if any(term in lower for term in LABEL_TERMS):
            labels.append(safe_name(name))
        if any(term in lower for term in LINK_TERMS):
            links.append(safe_name(name))
    return labels[:25], links[:25]


def inspect_organization(org):
    records = []
    successful_tables = 0
    for alias, dataset_name in TARGETS:
        entry = {"dataset": alias, "tables": [], "rowsDownloaded": 0,
                 "filesDownloaded": 0, "externalModelCalls": 0}
        try:
            tables = org.dataset(dataset_name).list_tables(max_results=MAX_TABLES)
        except Exception as exc:
            entry["status"] = "table_inventory_unavailable"
            entry["errorType"] = type(exc).__name__
            records.append(entry)
            continue

        for table in tables:
            props = table.properties or {}
            item = {"table": safe_name(props.get("name")),
                    "isFileIndex": bool(props.get("isFileIndex")),
                    "schemaStatus": "unavailable"}
            try:
                variables = table.list_variables(max_results=MAX_COLUMNS)
                names = [v.properties.get("name") for v in variables
                         if isinstance(v.properties, dict)]
                labels, links = classify_columns(names)
                item.update({
                    "schemaStatus": "ok",
                    "variableCountInspected": len(names),
                    "labelColumns": labels,
                    "imageLinkColumns": links,
                    "pairedLabelAndImageColumns": bool(labels and links),
                })
                successful_tables += 1
            except Exception as exc:
                item["errorType"] = type(exc).__name__
            entry["tables"].append(item)
        entry["status"] = "schema_inspected" if any(
            t["schemaStatus"] == "ok" for t in entry["tables"]
        ) else "no_schemas_inspected"
        records.append(entry)
    return {
        "scope": "schema_metadata_only",
        "datasets": records,
        "tablesInspected": successful_tables,
        "rowsDownloaded": 0,
        "filesDownloaded": 0,
        "externalModelCalls": 0,
        "readyForImageBenchmark": False,
        "needs": "Confirm dataset-specific export/cloud rights and actual label-to-file joins",
    }


def main():
    if not os.environ.get("REDIVIS_API_TOKEN"):
        print("REDIVIS_SECRET_MISSING")
        return 2
    import redivis
    report = inspect_organization(redivis.organization("AIMI"))
    print("REDIVIS_LABEL_SCHEMA_PREFLIGHT " +
          json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["tablesInspected"] > 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
