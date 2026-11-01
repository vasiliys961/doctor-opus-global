#!/usr/bin/env python3
"""Narrow a pinned PUBLIC NOHARM manifest to four pre-registered perturbations.

Official MAST score.py requires complete input for each base family at --k.
This internal n=4 comparison intentionally scores a sparse predeclared set,
so we create a separate *temporary* manifest, without changing expert rubrics,
case prompts, judge prompts, or the scorer's scoring algorithm.
Not comparable to a full official MAST leaderboard score.
"""
import argparse
import hashlib
import json
from pathlib import Path

EXPECTED = {
    "Endo009-0": "Endo009",
    "GI002-0": "GI002",
    "GI004-3": "GI004",
    "Heme010-0": "Heme010",
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset-manifest", required=True)
    ap.add_argument("--preregistration", required=True)
    ap.add_argument("--control-answers", required=True)
    ap.add_argument("--rag-answers", required=True)
    args = ap.parse_args()
    prereg = json.loads(Path(args.preregistration).read_text())
    declared = {x["id"]: x["baseId"] for x in prereg["cases"]}
    if declared != EXPECTED:
        raise SystemExit("Preregistration drift: " + repr(declared))
    for file in (args.control_answers, args.rag_answers):
        records = [json.loads(s) for s in Path(file).read_text().splitlines() if s.strip()]
        if len(records) != len(EXPECTED) or {x["id"] for x in records} != set(EXPECTED):
            raise SystemExit("Incomplete or changed clinical responses: "+file)
        if not all(x.get("trial") == 1 and len(x.get("response", "")) >= 100 for x in records):
            raise SystemExit("Invalid response/trial in "+file)
    path = Path(args.dataset_manifest)
    original = path.read_bytes()
    selected = []
    for ln in original.decode().splitlines():
        if not ln.strip():
            continue
        item = json.loads(ln)
        if item["id"] in EXPECTED:
            if item.get("metadata", {}).get("base_id") != EXPECTED[item["id"]]:
                raise SystemExit("Case mapping mismatch for "+item["id"])
            selected.append(item)
    if len(selected) != len(EXPECTED):
        raise SystemExit("Pinned source missing one or more declared variants")
    path.with_name("items-original-source.jsonl.sha256").write_text(hashlib.sha256(original).hexdigest()+"\n")
    path.write_text("\n".join(json.dumps(x) for x in selected)+"\n")
    print("SCOPED_PUBLIC_NOHARM "+json.dumps({
      "cases": list(EXPECTED),
      "originalManifestSha256": hashlib.sha256(original).hexdigest(),
      "scopedManifestSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
      "note": "Exact source rubrics and judge unchanged; sparse manifest is INTERNAL scope only, not a canonical full MAST leaderboard run."
    }))

if __name__ == "__main__":
    main()
