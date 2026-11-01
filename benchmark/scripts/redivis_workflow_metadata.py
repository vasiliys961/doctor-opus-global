"""Read ONLY metadata for the user's Redivis workflow. No patient records."""
import json
import os
import re
import redivis

if not os.getenv("REDIVIS_API_TOKEN"):
    raise SystemExit("REDIVIS_SECRET_MISSING")
user = redivis.current_user()
workflows = user.list_workflows(max_results=100)
match = None
for wf in workflows:
    props = wf.properties or {}
    url = str(props.get("url", ""))
    if "zpec-2q3khr8v1" in url or str(props.get("id", "")).startswith("zpec"):
        match = wf
        break
print("REDIVIS_AUTH_OK")
print("REDIVIS_WORKFLOW_FOUND", bool(match))
if match:
    props = match.properties or {}
    print("REDIVIS_WORKFLOW_METADATA", json.dumps({
        "name": props.get("name"),
        "access": props.get("accessLevel"),
        "tableCount": props.get("tableCount"),
        "status": "metadata_only"
    }, ensure_ascii=False))
    # No source tables, data files, patient records, or images downloaded.
