#!/usr/bin/env python3
"""Paired original MAST scoring report for same 12 cases, Opus A/B.
Reads original judged JSONL and emits transparent case-level comparison.
"""
import json
import pathlib
import statistics

ROOT=pathlib.Path("mast-reference/results/raw/donoharm/default")
OUT=pathlib.Path("benchmark/internal-results/opus-nemotron-paired-20261119")
OUT.mkdir(parents=True,exist_ok=True)
CASES=("Card001","Card002","Derm001","Endo009","GI002",
       "All001","Heme002","ID003","Nephro003","Neuro003","Pulm001","GI004")
def load(s):
    path=ROOT/(s+"_judged.jsonl")
    if not path.exists():raise SystemExit("Missing original MAST scored file: "+str(path))
    x=[json.loads(z) for z in path.read_text().splitlines() if z.strip()]
    by={r.get("id"):r for r in x}
    if len(x)!=len(CASES) or set(by)!=set(CASES):raise SystemExit("Incomplete or duplicate scored cases: "+s)
    return by
a=load("opus-solo12")
b=load("opus-audit12")
def severe(r):
    harms=(r.get("harm") or [])
    a=[h for h in harms if str(h.get("harm_severity","")).lower()=="severe" and h.get("matched")]
    return len(a)
def score(r):
    return float(r.get("metrics",{}).get("F1_weighted",float("nan")))
rows=[]
for cid in CASES:
    s=score(a[cid]);t=score(b[cid]);sa=severe(a[cid]);sb=severe(b[cid])
    rows.append({"id":cid,"opus_only_f1":round(s,5),"with_nemotron_f1":round(t,5),
                 "f1_delta":round(t-s,5),"opus_only_severe_matches":sa,
                 "with_nemotron_severe_matches":sb,
                 "severe_delta":sb-sa,"known_prior":cid in CASES[:5]})
summary={"cases":len(rows),"f1_baseline_mean":round(statistics.mean(r["opus_only_f1"] for r in rows),5),
         "f1_audit_mean":round(statistics.mean(r["with_nemotron_f1"] for r in rows),5),
         "paired_delta_mean":round(statistics.mean(r["f1_delta"] for r in rows),5),
         "improved_cases":sum(r["f1_delta"]>0 for r in rows),
         "worsened_cases":sum(r["f1_delta"]<0 for r in rows),
         "tied_cases":sum(r["f1_delta"]==0 for r in rows),
         "severe_baseline":sum(r["opus_only_severe_matches"] for r in rows),
         "severe_audit":sum(r["with_nemotron_severe_matches"] for r in rows),
         "severe_improved_cases":[r["id"] for r in rows if r["severe_delta"]<0],
         "severe_worsened_cases":[r["id"] for r in rows if r["severe_delta"]>0],
         "note":"Original open MAST cases, standalone Opus not full Doctor Opus Consilium. Internal LLM grader. Changes not clinical validation."}
report={"summary":summary,"cases":rows}
(OUT/"paired-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
lines=["# Opus 5.5 vs Opus 5.5 + independently generated Nemotron audit",
       "12 paired original open MAST Do NOHARM cases; NOT full Consilium.",
       "Original rubrics; internal OpenRouter judge, not official benchmark.",
       "",
       f"Mean F1: Opus {summary['f1_baseline_mean']}, with audit {summary['f1_audit_mean']}; mean paired delta {summary['paired_delta_mean']}.",
       f"Better / worse / same: {summary['improved_cases']} / {summary['worsened_cases']} / {summary['tied_cases']}.",
       f"Severe matched harms: Opus {summary['severe_baseline']}, with audit {summary['severe_audit']}.",
       "",
       "| Case | Opus | With Nemotron | Delta | Severe alone | Severe with audit |",
       "|---|---:|---:|---:|---:|---:|"]
for r in rows:
    lines.append(f"| {r['id']} | {r['opus_only_f1']:.4f} | {r['with_nemotron_f1']:.4f} | {r['f1_delta']:+.4f} | {r['opus_only_severe_matches']} | {r['with_nemotron_severe_matches']} |")
lines+=["","Caution: small purposive sample with five previously reviewed cases; model outputs are unblinded to auditor note in B. True standalone Opus A/B, not original multiagent Doctor Opus. No diagnoses or safety claims without reviewing per-case MAST rubric outputs."]
(OUT/"REPORT.md").write_text("\n".join(lines)+"\n")
print("PAIRED_MAST_SCORED "+json.dumps(summary,ensure_ascii=False),flush=True)
