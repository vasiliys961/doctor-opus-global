#!/usr/bin/env python3
"""Offline consolidation of Neon VQA-RAD public 20-case Actions artifacts."""
import json,pathlib,statistics
ROOT=pathlib.Path("shard-artifacts")
OUT=pathlib.Path("benchmark/internal-results/neon-vqa-rad-20261120-report")
OUT.mkdir(parents=True,exist_ok=True)
all_rows=[];shards=[]
for i in range(4):
    d=ROOT/("neon-vqa-rad-shard-%s"%i)
    if not d.exists():
        shards.append({"shard":i,"error":"missing artifact"})
        continue
    meta=d/"shard-summary.json"
    shards.append(json.loads(meta.read_text()) if meta.exists() else {"shard":i,"error":"missing summary"})
    for j in range(i*5+1,i*5+6):
        p=d/("vqa-neon-%02d.json"%j)
        if p.exists():all_rows.append(json.loads(p.read_text()))
all_rows.sort(key=lambda x:x["id"])
ok=[r for r in all_rows if r.get("status")=="ok"]
cost=sum(x.get("billedUsd",0) for x in shards)
matched=sum(1 for r in ok if r.get("strictMatch"))
ys=[r for r in ok if str(r.get("reference","")).lower() in ("yes","no")]
op=[r for r in ok if str(r.get("reference","")).lower() not in ("yes","no")]
s={"planned":20,"completed":len(ok),"records":len(all_rows),"strictCorrect":matched,
   "binaryCorrect":sum(bool(r.get("strictMatch")) for r in ys),"binaryCount":len(ys),
   "openCorrect":sum(bool(r.get("strictMatch")) for r in op),"openCount":len(op),
   "billedUsd":round(cost,9),"costUpperLimitApprovedUsd":0.5,
   "pairedWithHistoricalArgon":False,"originalManifestRecovered":False,
   "reason":"Original Argon 2026-11-12 20-image case list was not stored in GitHub",
   "historicArgonResultOnDifferent20":15,"shards":shards,
   "note":"Exact answer agreement only, not medical accuracy, no clinical adjudication."}
(OUT/"summary.json").write_text(json.dumps(s,ensure_ascii=False,indent=2)+"\n")
(OUT/"responses.jsonl").write_text("".join(json.dumps(r,ensure_ascii=False)+"\n" for r in all_rows))
lines=["# Gemini 4 Neon: public VQA-RAD standalone 20-image pilot",
       "","**UNPAIRED comparison:** the original 12 Nov Argon panel was saved only locally,",
       "and its exact case manifest was absent from accessible repository. Thus this",
       "is a NEW pinned, reproducible VQA-RAD test; it cannot prove Neon > Argon.",
       "","- Model: google/gemini-4-neon, only one LLM, no detectors or preliminary Flash.",
       "- Dataset: VQA-RAD test pinned revision bcf91e7654fb9d51c8ab6a5b82cacf3fafd2fae9.",
       "- New panel: first 10 unique yes/no and first 10 unique open-answer images.",
       "- Maximum authorized paid exposure: 4 shards x $0.125 = $0.50.",
       "- Passed responses: %s / 20."%len(ok),
       "- Normalized exact answers: %s / %s."%(matched,len(ok)),
       "- Binary questions: %s / %s."%(s["binaryCorrect"],len(ys)),
       "- Open questions: %s / %s."%(s["openCorrect"],len(op)),
       "- Confirmed provider usage.cost subtotal: $%.6f."%cost,
       "- Historical Argon: 15/20, **different/unknown exact cases; NOT a direct A/B.**",
       "","| Case | Source row | Question | Reference | Neon | Exact | Cost USD |",
       "|---|---:|---|---|---|---:|---:|"]
def esc(x):return str(x or "").replace("|","\\|").replace("\n"," ")
for r in all_rows:
    lines.append("| %s | %s | %s | %s | %s | %s | %.6f |"%(
        r["id"],r.get("rowIndex"),esc(r.get("question")),esc(r.get("reference")),
        esc(r.get("answer","[NOT COMPLETE]")),
        "yes" if r.get("strictMatch") else "no",
        r.get("costUsd") or 0))
lines+=["","**Limitations:** 20 public image-QA examples; model may have encountered this dataset",
        "in training; short answers only; no diagnostic sensitivity, specificity, or reader",
        "adjudication. Results do not justify changing Doctor Opus's image pipeline.",
        "No patient data or application changes. No Argon calls. One attempt per case."]
(OUT/"report.md").write_text("\n".join(lines)+"\n")
print("NEON_PILOT_FINAL "+json.dumps(s,ensure_ascii=False),flush=True)
if len(ok)!=20:raise SystemExit("Incomplete 20-case pilot; see artifacts and known unknown costs")
