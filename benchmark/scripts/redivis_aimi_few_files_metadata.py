"""Check small per-file index sampling in AIMI (NO pixel/file download).

Never logs file names, patient IDs, paths, links, row values or secret.
Only queries up to TWO file-index records per selected dataset.
"""
import json
import os
import redivis

TARGETS = [
    ("DDI", "DDI - Diverse Dermatology Images", "Files"),
    ("DDI-2", "DDI2: Diverse Dermatology Images- 2", "Final DDI2 Asian Photos (no metadata)"),
    ("MIDAS", "MRA-MIDAS: Multimodal Image Dataset for AI-based Skin Cancer", "data"),
    ("CheXpert Plus", "CheXpert Plus", "PNG_valid"),
    ("PhysicianBench", "PhysicianBench", "physicianbench"),
]
if not os.environ.get("REDIVIS_API_TOKEN"):
    raise SystemExit("REDIVIS_SECRET_MISSING")
org = redivis.organization("AIMI")
results=[]
for key,dataset_name,table_name in TARGETS:
    try:
        table=org.dataset(dataset_name).table(table_name)
        files=table.list_files(max_results=2)
        results.append({"dataset":key,"status":"small_file_index_access_ok",
                        "sampleFileCount":len(files),"contentDownloaded":False})
    except Exception as err:
        results.append({"dataset":key,"status":"sample_unavailable",
                        "errorType":type(err).__name__})
print("REDIVIS_SMALL_FILE_INDEX_PROBE "+json.dumps(results))

# Contest-only bootstrap: the proven Redivis GitHub Actions job has working
# private secrets. Inspect only up to five authorized clinical label rows per
# new dataset and print count-only summaries, never record values or images.
from redivis_aimi_five_sample_probe import main as run_new_pending_sample_probe
raise SystemExit(run_new_pending_sample_probe())
