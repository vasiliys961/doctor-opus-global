#!/usr/bin/env python3
"""Bundle a public benchmark comparison, without claiming a clinical score."""
import json, pathlib
ROOT=pathlib.Path("benchmark/internal-results/academy-12-haiku5-20261119/haiku5")
SOLO=pathlib.Path("benchmark/internal-results/haiku-archived-20261119")
OUT=pathlib.Path("benchmark/results/2026-11-19-haiku5-five-role")
OUT.mkdir(parents=True,exist_ok=True)
IDS=("Card001","Card002","Derm001","Endo009","GI002","All001","Heme002","ID003","Nephro003","Neuro003","Pulm001","GI004")
ROLES=("hypothesis","testChooser","challenger","stewardship","checklist")
def rows(path):
 return [json.loads(x) for x in path.read_text(encoding="utf8").splitlines() if x.strip()]
by_id={}
shard_summaries=[]
for shard in sorted(ROOT.glob("shard-*")):
 p=shard/"responses.jsonl"
 if not p.exists():continue
 for x in rows(p):
  if x.get("case") not in IDS:raise RuntimeError("Unexpected case ID")
  by_id.setdefault(x["case"],[]).append(x)
 sp=shard/"summary.json"
 if sp.exists():shard_summaries.append(json.loads(sp.read_text()))
solos=[]
for p in SOLO.rglob("responses.jsonl"):
 items=[x for x in rows(p) if x.get("arm")=="standalone_12_matched"]
 if len(items)==12:solos=items;break
solo={x["id"]:x for x in solos}
def price(v):return float(v.get("usd") or (v.get("usage") or {}).get("cost") or 0)
def good(v):return v.get("status")=="ok" and v.get("finish_reason")=="stop"
full=sum(len(by_id.get(cid,[]))==5 and {x.get("role") for x in by_id[cid]}==set(ROLES) and all(good(x) for x in by_id[cid]) for cid in IDS)
paid=sum(price(x) for xs in by_id.values() for x in xs)
allrows=[x for cid in IDS for x in by_id.get(cid,[])]
if len(allrows)>60:raise RuntimeError("Duplicate paid results")
(OUT/"five-roles.jsonl").write_text("\n".join(json.dumps(x,ensure_ascii=False) for x in allrows)+"\n",encoding="utf8")
if solos:(OUT/"solo-original.jsonl").write_text("\n".join(json.dumps(x,ensure_ascii=False) for x in solos)+"\n",encoding="utf8")
summary={"model":"anthropic/claude-haiku-5.5","cases":12,"five_role_calls":len(allrows),
 "complete_five_role_cases":full,"five_role_billed_usd":round(paid,8),
 "solo_archived_cases":len(solos),"solo_archived_usd":round(sum(price(x) for x in solos),8),
 "clinical_accuracy":None,"clinical_safety":None,"shards":shard_summaries}
(OUT/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
lines=["# Haiku 5.5: standalone vs five roles on 12 public MAST clinical cases","",
"Research only, not a clinician blinded scoring study. All five roles use the SAME Haiku 5.5 model.",
"Four initial roles evaluate the original case independently; the final checklist sees their four responses.",
"Role agreement is not evidence of five independent models.","",
"## Observed technical results","",
f"- Five-role complete cases: {full}/12",
f"- Recorded role calls: {len(allrows)}/60",
f"- New billed five-role API usage: USD {paid:.6f}",
f"- Reused archived solo cases: {len(solos)}/12 (no new solo calls)","",
"| Case | Solo answer | Five-role complete | Role success | Five-role USD |",
"|---|---|---|---:|---:|"]
for cid in IDS:
 rr=by_id.get(cid,[])
 all_good=len(rr)==5 and all(good(x) for x in rr)
 lines.append(f"| {cid} | {'archived' if cid in solo else 'missing'} | {'yes' if all_good else 'no'} | {sum(good(x) for x in rr)}/5 | {sum(price(x) for x in rr):.6f} |")
lines+=["","## Required clinical evaluation","",
"Conduct a blinded clinician comparison for every matched case: serious commissions, dangerous omissions, timely action, medication safety, correct investigations, unsupported assertions, and clinical utility.",
"Specifically check whether the challenger fixed a real early error or simply repeated it.",
"No clinical quality superiority is established by technical success, number of roles or answer length.",
"Full role responses and archived single-model answers are preserved in the JSONL files.",
""]
(OUT/"report.md").write_text("\n".join(lines),encoding="utf8")
print("ACADEMY_HAIKU5_REPORT",json.dumps(summary,ensure_ascii=False),flush=True)
