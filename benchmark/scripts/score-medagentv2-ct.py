#!/usr/bin/env python3
"""Run the source authors' UNMODIFIED task1 evaluator on true FHIR POST trajectories."""
import sys, json
from pathlib import Path
from types import SimpleNamespace

root=Path(__file__).resolve().parents[2]
source=root/'medagentbench-source'/'medagentbench_v2'
sys.path.insert(0,str(source))
from src.medagentbenchevals.new_refsol import task1

data=json.loads((source/'src/MedAgentBench/data/medagentbench/new_patient_tasks.json').read_text())
by_id={x['id']:x for x in data}
out=root/'benchmark/internal-results/medagentv2-ct-orders'
rows=[json.loads(x) for x in (out/'answers.jsonl').read_text().splitlines() if x.strip()]
scores=[]
for row in rows:
    history=[SimpleNamespace(**i) for i in row['history']]
    result=SimpleNamespace(result='[]',history=history)
    passed=bool(task1(by_id[row['taskId']],result,'http://127.0.0.1:8080/fhir/'))
    scores.append({'id':row['taskId'],'passed':passed,'actions':row['posts'],
                  'authorJudge':'src.medagentbenchevals.new_refsol.task1'})
    print('MAST_MEDAGENT_V2_CT_OFFICIAL_CASE '+json.dumps(scores[-1]))
report={'planned':2,'graded':len(scores),'passed':sum(v['passed'] for v in scores),
        'source':'actual FHIR, official new_patient_tasks, unmodified author evaluator',
        'disclaimer':'Two public cases only, not full MedAgentBench v2'}
(out/'official-grades.json').write_text(json.dumps({'report':report,'scores':scores},indent=2))
print('MAST_MEDAGENT_V2_CT_OFFICIAL_SUMMARY '+json.dumps(report))
if not scores:raise SystemExit('Missing answers')
