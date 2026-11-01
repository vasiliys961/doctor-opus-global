#!/usr/bin/env python3
"""Score our NEW MedAgentBench v2 multi-step case outputs with the AUTHOR'S
actual new_refsol.task3 evaluator against the original FHIR test backend.
Only public research cases; no scoring rubric enters the model prompt.
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

base = Path(__file__).resolve().parents[2]
official = base / "medagentbench-source" / "medagentbench_v2"
sys.path.insert(0, str(official))
from src.medagentbenchevals.new_refsol import task3

original = json.loads((official / "src" / "MedAgentBench" / "data" / "medagentbench" / "new_patient_tasks.json").read_text())
cases = {x["id"]: x for x in original}
out = base / "benchmark" / "internal-results" / "medagentv2-advanced"
rows = [json.loads(line) for line in (out / "answers.jsonl").read_text().splitlines() if line.strip()]
graded = []
for row in rows:
    task = cases[row["taskId"]]
    result = SimpleNamespace(result=row["answer"] if row["answer"] is not None else [], history=[])
    correct = bool(task3(task, result, "http://127.0.0.1:8080/fhir/"))
    graded.append({"taskId": row["taskId"], "officialTask3Passed":correct,
                   "answer":row["answer"],"authorEvaluator":"src.medagentbenchevals.new_refsol.task3"})
    print("MAST_MEDAGENT_V2_OFFICIAL_EVAL " + json.dumps({"taskId":row["taskId"],"passed":correct}))
summary={"attempted":len(graded),"passed":sum(x["officialTask3Passed"] for x in graded),
         "authorEvaluator":True,"scope":"2 public task3 cases from new_patient_tasks; not full benchmark"}
(out/"official-grades.json").write_text(json.dumps({"summary":summary,"perCase":graded},indent=2))
print("MAST_MEDAGENT_V2_OFFICIAL_SUMMARY "+json.dumps(summary))
if not rows:
    raise SystemExit("No answers to grade")
