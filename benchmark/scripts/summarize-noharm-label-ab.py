#!/usr/bin/env python3
"""Zero-provider-cost analysis of already completed public NOHARM paired trial."""
import csv
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('recovered')
score_files = list(root.rglob('doctor-opus-label-ab-onecase.csv'))
audit_files = list(root.rglob('safety-label-ab/audit.json'))
ledger_files = list(root.rglob('judge-cost.jsonl'))
if len(score_files)!=1 or len(audit_files)!=1:
    raise RuntimeError(f'Expected unique score and audit; scores={len(score_files)} audit={len(audit_files)}')
with score_files[0].open(newline='') as stream:
    rows = list(csv.DictReader(stream))
metrics = {r['metric']:float(r['mean']) for r in rows if r.get('category')=='Overall'}
if not {'F1_weighted','Severe_rate','Precision_weighted','Recall_weighted'}<=metrics.keys():
    raise RuntimeError('Expected aggregate NOHARM metrics not present')
audit = json.loads(audit_files[0].read_text())
judge = []
for p in ledger_files:
    judge.extend(json.loads(x) for x in p.read_text().splitlines() if x.strip())
if not judge:
    raise RuntimeError('No measured judge ledger: do not report a false zero-dollar cost')
judge_cost = sum(float(x['costUsd']) for x in judge)
original_f1 = 0.9697  # previous one-case public judge run 41302687551
report = {
    'source': 'MAST public All001, k=1; original judge with OpenRouter transport',
    'candidate': 'Opus5.5 frozen original + independent, official-label-backed Sonnet revision',
    'controlWeightedF1': original_f1,
    'candidateWeightedF1': metrics['F1_weighted'],
    'deltaF1': round(metrics['F1_weighted']-original_f1,6),
    'candidateSevereRate': metrics['Severe_rate'],
    'candidateWeightedPrecision': metrics['Precision_weighted'],
    'candidateWeightedRecall': metrics['Recall_weighted'],
    'auditVerdict': audit['verdict'],
    'sourceLabels': audit.get('sourceLabels', []),
    'consiliumRepeated': False,
    'revisionCostUsd': audit['costUsd'],
    'judgeCostUsd': round(judge_cost,7),
    'newCostsTotalUsd': round(audit['costUsd']+judge_cost,7),
    'sourceRun': 'https://github.com/vasiliys961/doctor-opus-global/actions/runs/41306593120',
    'independentOfficialMAST': False,
    'limitations': 'Only one familiar public case; internal OpenRouter transport and noisy judge; no generalization claim.'
}
path=pathlib.Path('benchmark/results/label-backed-noharm-ab-recovery.json')
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(report,indent=2)+'\n')
print('MAST_SAFETY_LABEL_AB_RECOVERED '+json.dumps(report))
