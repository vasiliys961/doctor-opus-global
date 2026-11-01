"""Small *real* Redivis rows / index feasibility for still-unbenchmarked tasks.

Never prints or saves row contents, patient identifiers, file names, URLs,
images, text, reports, clinical values or small-cell label distributions.
Reading 2-5 rows is attempted only via the platform's official API, which
enforces export restrictions. There is NO external LLM transmission.
This is source-access preparation, not a diagnostic model score.
"""
from __future__ import annotations

import json
import os
import re
import sys

MAX_ROWS_PER_DATASET = 5
MAX_FILES_PER_DATASET = 3
MAX_COLUMNS = 8

# Focus on pending tasks, not the completed ISIC/ReXrank/MedAgent pilots.
TARGETS = (
    ("CheXpert Plus", "CheXpert Plus", "rows"),
    ("INSPECT", "INSPECT: A Multimodal Dataset for Pulmonary Embolism Diagnosis and Prognosis", "rows"),
    ("DDI2", "DDI2: Diverse Dermatology Images- 2", "rows"),
    ("Thyroid ultrasound", "Thyroid Ultrasound Cine-clip", "files"),
    ("PhysicianBench", "PhysicianBench", "files"),
)
PATHOLOGY = (
    "label", "diagnos", "patholog", "malignan", "melanoma", "histolog",
    "benign", "ground_truth", "classification", "atelectasis",
    "cardiomegaly", "consolidation", "edema", "pneumonia", "pneumothorax",
    "effusion", "fracture", "nodule", "opacity", "embolism", "pe_label",
    "outcome", "finding", "disease",
)
IDENTITY = (
    "patient", "person", "subject", "accession", "name", "birth", "date",
    "time", "report", "notes", "free_text", "text", "phone", "address",
    "path", "file", "image", "study", "series", "token", "secret", "mrn", "url",
)


def candidate_columns(variables):
    names = []
    for variable in variables:
        properties = variable.properties or {}
        name = properties.get("name")
        if not isinstance(name, str):
            continue
        lower = name.casefold()
        if any(part in lower for part in IDENTITY):
            continue
        if any(part in lower for part in PATHOLOGY):
            names.append(name)
    return names[:MAX_COLUMNS]


def inspect_dataset(organization, alias, name, mode):
    record = {"task": alias, "recordsInspected": 0, "filesInspected": 0,
              "imagesDownloaded": 0, "externalModelCalls": 0,
              "status": "unavailable"}
    try:
        tables = organization.dataset(name).list_tables(max_results=30)
    except Exception as exc:
        record.update(status="no_table_access", errorType=type(exc).__name__)
        return record

    if mode == "files":
        for t in tables:
            try:
                props = t.properties or {}
                if not props.get("isFileIndex") and "file" not in str(props.get("name", "")).lower():
                    continue
                files = t.list_files(max_results=MAX_FILES_PER_DATASET)
                record["filesInspected"] = len(files)
                # Only sizes; never names or paths.
                sizes = [f.properties.get("size") for f in files if isinstance(f.properties, dict)]
                sizes = [int(x) for x in sizes if isinstance(x, int) and x >= 0]
                record["bytesInSampleIndex"] = sum(sizes)
                record["largestIndexedFileBytes"] = max(sizes) if sizes else None
                record["status"] = "file_index_sampled"
                return record
            except Exception as exc:
                record.update(status="file_index_error", errorType=type(exc).__name__)
        return record

    for table in tables:
        try:
            variables = table.list_variables(max_results=250)
            selected = candidate_columns(variables)
            if not selected:
                continue
            # Only explicitly chosen clinical label fields (never patient IDs,
            # free text, image paths); max five rows. The Redivis SDK/API decides
            # whether this export is authorized, including 403 restrictions.
            df = table.to_pandas_dataframe(
                max_results=MAX_ROWS_PER_DATASET,
                variables=selected,
                progress=False,
                max_parallelization=1,
            )
            record["recordsInspected"] = min(len(df), MAX_ROWS_PER_DATASET)
            record["labelColumnsInspected"] = len(selected)
            record["status"] = "limited_label_rows_read"
            del df
            return record
        except Exception as exc:
            record.update(status="rows_blocked_or_api_error",
                          errorType=type(exc).__name__)
            # Do not route around access restrictions via another endpoint.
            return record
    record["status"] = "no_label_columns"
    return record


def main():
    if not os.environ.get("REDIVIS_API_TOKEN"):
        print("REDIVIS_SECRET_MISSING")
        return 2
    import redivis
    organization = redivis.organization("AIMI")
    records = []
    for alias, name, mode in TARGETS:
        records.append(inspect_dataset(organization, alias, name, mode))
    result = {
        "scope": "5-row-limited-label-only-no-images-no-LLM",
        "casesPerDatasetMaximum": MAX_ROWS_PER_DATASET,
        "results": records,
        "sourceDataRetained": False,
        "notDiagnosticModelEvaluation": True,
        "mainBranchModified": False,
    }
    print("REDIVIS_PENDING_TASK_FIVE_SAMPLES " + json.dumps(result, sort_keys=True))
    # A limited successful row read or file-index read is meaningful proof.
    successes = sum(x["status"] in ("limited_label_rows_read", "file_index_sampled") for x in records)
    return 0 if successes else 3


if __name__ == "__main__":
    sys.exit(main())
