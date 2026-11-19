#!/usr/bin/env python3
"""Unpaid evidence binder for 12-case clinical comparisons, NO automatic medical grading."""
import csv,json,pathlib,statistics
BASE=pathlib.Path("benchmark/internal-results/academy12-compare-sources")
DEST=pathlib.Path("benchmark/internal-results/academy12-comparison-report");DEST.mkdir(parents=True,exist_ok=True)
IDS=("Card001","Card002","Derm001","Endo009","GI002","All001",
"Heme002","ID003","Nephro003","Neuro003","Pulm001","GI004")
FILES={
"Haiku single":"haiku/responses.jsonl",
"Nemotron single":"nemotron/nemotron-standalone12.jsonl",
"Opus single":"opus/opus-alone.jsonl",
"Opus + Nemotron":"opus/opus-plus-nemotron.jsonl",
"Full Consilium":"consilium/original-responses.jsonl",
"Academy Free":"free/responses.jsonl",
"Academy Mixed":"mixed/responses.jsonl"}
def load(name):
 p=BASE/name
 if not p.exists():return []
 return [json.loads(s) for s in p.read_text().splitlines() if s.strip()]
items={name:load(path) for name,path in FILES.items()}
grades={r["id"]:r for r in load("consilium/judged.jsonl")}
out=[];cases=[]
for cid in IDS:
 armdata={};allrows={}
 for name,records in items.items():
  rows=[r for r in records if r.get("id",r.get("case"))==cid and
   (name!="Haiku single" or r.get("arm")=="standalone_12_matched")]
  full=[]
  for r in rows:
   full.append({"role":r.get("role") or "standalone",
    "status":r.get("status") or ("ok" if r.get("response") else "missing"),
    "model":r.get("model") or r.get("model_requested") or name,
    "answer":r.get("answer") or r.get("response") or "",
    "usd":float(r.get("usd") if r.get("usd") is not None else (r.get("usage") or {}).get("cost") or 0),
    "seconds":r.get("seconds") or r.get("duration_s"),
    "finish_reason":r.get("finish_reason"),"archive_reused":r.get("archive_reused")})
  final=next((v for v in full if v["role"]=="checklist"),None) if name.startswith("Academy") else (full[0] if full else None)
  complete=(len(full)==5 and all(v["status"]=="ok" for v in full)) if name.startswith("Academy") else None
  armdata[name]={"roles":full,"final":final,"five_roles_complete":complete}
  out.append({"case":cid,"arm":name,"status":final["status"] if final else "missing",
    "fully_complete":complete,"role_count":len(full),
    "actual_usd":round(sum(v["usd"] for v in full),8),
    "response_chars":len((final or {}).get("answer",""))})
 grade=grades.get(cid)
 rubric_path=BASE/"rubrics"/(cid+".json")
 rubric=json.loads(rubric_path.read_text()) if rubric_path.exists() else {}
 cases.append({"id":cid,"rubric_case_reference":rubric.get("case",{}).get("recommendations",""),
  "rubric_hazard_choices":[x.get("text") for x in rubric.get("options",[])
    if x.get("abstractionType")=="harm" and x.get("score",9)<=2],
  "full_consilium_historical_weighted_f1":grade.get("metrics",{}).get("F1_weighted") if grade else None,
  "full_consilium_original_severe_flags":[{"option":x.get("id"),"type":x.get("harm_type"),
     "abstraction":x.get("abstraction")} for x in (grade or {}).get("harm",[])
      if x.get("harm_severity")=="Severe"],
  "arms":armdata})
(DEST/"case-evidence.json").write_text(json.dumps(cases,ensure_ascii=False,indent=2))
with (DEST/"results.csv").open("w",newline="",encoding="utf-8") as f:
 writer=csv.DictWriter(f,fieldnames=list(out[0]));writer.writeheader();writer.writerows(out)
summaries=[]
for name in FILES:
 rr=[r for r in out if r["arm"]==name]
 summaries.append({"arm":name,"completed_finals":sum(r["status"]=="ok" for r in rr),
  "five_roles_complete":sum(r["fully_complete"] is True for r in rr),
  "observable_api_usd":round(sum(r["actual_usd"] for r in rr),8)})
reviewed=[c["full_consilium_historical_weighted_f1"] for c in cases if c["full_consilium_historical_weighted_f1"] is not None]
lines=["# Doctor Opus Academy — 12 identical public clinical cases","",
"**Research only.** Archived full Consilium F1 cannot be assigned to other ungraded model answers.",
"Exact original questions. The *ensemble role prompts* intentionally differ from single-model control prompts.",
"","| Arm | Completed final answers | 5/5 roles | Observable API USD |",
"|---|---:|---:|---:|"]
for x in summaries:lines.append("| "+x["arm"]+" | "+str(x["completed_finals"])+"/12 | "+(str(x["five_roles_complete"])+"/12" if x["arm"].startswith("Academy") else "n/a")+" | "+str(x["observable_api_usd"])+" |")
lines+=["","**Historical FULL Consilium mean per-case weighted F1 for matched 12:** "+(f"{statistics.mean(reviewed):.3f}" if len(reviewed)==12 else "unavailable"),"",
"Clinical safety assessment MUST use rubric and blinded physician review, not keyword counts.",
"An incomplete critic is NOT a valid 5/5 consilium even when checklist produced plausible text.",
"See case-evidence.json for the complete archived responses and rubrics.",""]
(DEST/"summary.md").write_text("\n".join(lines),encoding="utf-8")
print(json.dumps({"total_cases":len(cases),"summaries":summaries,"full_consilium_judged":len(reviewed)},ensure_ascii=False))
