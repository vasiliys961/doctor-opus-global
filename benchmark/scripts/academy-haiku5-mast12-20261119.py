#!/usr/bin/env python3
"""Doctor Opus Academy: 12-case, five-role, evidence-preserving head-to-head study.

Research on ORIGINAL PINNED PUBLIC MAST cases only. Not a production Consilium.
The four preliminary roles are independent; final checklist gets their literal
recorded opinions, including incomplete/failed voices. Costs have a hard guard.
Free archived two-case pilot is reused without making new calls.
"""
import argparse
import json
import os
from pathlib import Path
import time
from urllib import request, error

SHA="57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee"
CASE_IDS=("Card001","Card002","Derm001","Endo009","GI002","All001",
          "Heme002","ID003","Nephro003","Neuro003","Pulm001","GI004")
ROLE_IDS=("hypothesis","testChooser","challenger","stewardship","checklist")
MODEL_FREE_ULTRA="nvidia/nemotron-3-ultra-550b-a55b:free"
MODEL_FREE_LIGHTNING="nvidia/nemotron-3.5-lightning:free"
ROLE_MODELS={
 "free":{"hypothesis":MODEL_FREE_ULTRA,"testChooser":MODEL_FREE_ULTRA,
         "challenger":MODEL_FREE_LIGHTNING,"stewardship":MODEL_FREE_ULTRA,
         "checklist":MODEL_FREE_ULTRA},
 "mixed":{"hypothesis":"anthropic/claude-haiku-5.5",
          "testChooser":"google/gemini-3.1-flash-lite",
          "challenger":MODEL_FREE_LIGHTNING,
          "stewardship":"google/gemini-3.5-flash-lite",
          "checklist":"anthropic/claude-haiku-5.5"},
 "haiku5":{role:"anthropic/claude-haiku-5.5" for role in ("hypothesis","testChooser","challenger","stewardship","checklist")},
}
ROLE_PROMPTS={
 "hypothesis":"You list differential hypotheses only. Include one dangerous alternative. Do not prescribe treatment.",
 "testChooser":"You suggest which test would separate the hypotheses. You do not order tests.",
 "challenger":"You are the critic. Disagree where the hypothesis is weak. Name what is overestimated and what is underestimated. Do not agree by default.",
 "stewardship":"Review the proposed management for avoidable harm. Check documented medications, allergies, comorbidities and organ function, and state what is missing before choosing an option. Do not add diagnoses or invent contraindications.",
 "checklist":"Synthesize the four independent opinions for the physician. Resolve material disagreements against the supplied evidence. State the supported next step, a safety check, what would change the decision and any urgent escalation trigger. Distinguish unsupported options and absent votes. The draft stays unsigned.",
}
TOKEN_CAPS={"hypothesis":6500,"testChooser":6500,"challenger":6500,
            "stewardship":6500,"checklist":12000}
OUTPUT=Path("benchmark/internal-results/academy-12-haiku5-20261119")
CATALOG_URL="https://openrouter.ai/api/v1/models"
CASES_URL=f"https://raw.githubusercontent.com/ARISENetwork/mast/{SHA}/benchmarks/donoharm/dataset/items.jsonl"
CHAT_URL="https://openrouter.ai/api/v1/chat/completions"
UA={"User-Agent":"DoctorOpusAcademyTwelve/1.0 (public synthetic cases)"}

def get(url,limit=10000000):
 with request.urlopen(request.Request(url,headers=UA),timeout=50) as rsp:return rsp.read(limit)
def args():
 p=argparse.ArgumentParser()
 p.add_argument("--profile",choices=("free","mixed","haiku5"),required=True)
 p.add_argument("--budget-usd",type=float,default=0.0)
 p.add_argument("--limit",type=int,default=3)
 p.add_argument("--start",type=int,default=0)
 return p.parse_args()

def rate(catalog,model,profile):
 v=catalog.get(model)
 if not v:return None
 arch=v.get("architecture") or {}
 if "text" not in (arch.get("input_modalities") or []):return None
 try:
  ri=float(v["pricing"]["prompt"]);ro=float(v["pricing"]["completion"])
 except (KeyError,TypeError,ValueError):return None
 if not(0<=ri<=0.000001 and 0<=ro<=0.000005):return None
 if model.endswith(":free") and (ri!=0 or ro!=0):return None
 if profile=="free" and (not model.endswith(":free") or ri!=0 or ro!=0):return None
 return (ri,ro)

def main():
 a=args()
 if a.limit<1 or a.start<0 or a.start+a.limit>12:raise SystemExit("Only a bounded shard of the 12 original cases is supported")
 if a.profile=="free" and a.budget_usd!=0:raise SystemExit("Free mode cannot incur any paid usage")
 if a.profile=="haiku5" and not(0<a.budget_usd<=0.10):
  raise SystemExit("Haiku 5-role shard hard cap is USD 0.10")
 if a.profile=="mixed" and not(0<a.budget_usd<=0.20):
  raise SystemExit("Mixed mode explicit test authorization is capped at USD 0.20")
 key=os.getenv("OPENROUTER_API_KEY")
 if not key:raise SystemExit("Missing GitHub secret")
 cases={r["id"]:r["prompt"] for line in get(CASES_URL).decode().splitlines() if line.strip()
        for r in [json.loads(line)] if r.get("metadata",{}).get("open") and r.get("metadata",{}).get("perturb_id") is None}
 if len(cases)!=30 or any(i not in cases for i in CASE_IDS):
  raise SystemExit("Original MAST case SHA/IDs changed, no calls")
 catalog={x["id"]:x for x in json.loads(get(CATALOG_URL))["data"]}
 mapping=ROLE_MODELS[a.profile]
 prices={role:rate(catalog,model,a.profile) for role,model in mapping.items()}
 dst=OUTPUT/a.profile/f"shard-{a.start:02d}";dst.mkdir(parents=True,exist_ok=True)
 manifest={
   "model_profile":a.profile,"case_ids":CASE_IDS[a.start:a.start+a.limit],"shard_start":a.start,"original_mast_sha":SHA,
   "source":"public MAST Do NOHARM originals","role_models":mapping,"roles":ROLE_PROMPTS,
   "max_output_tokens":TOKEN_CAPS,"actual_live_model_rates":prices,
   "independent_first_four":True,"final_receives_prior_raw_voices":True,
   "rubrics_not_sent_to_model":True,"no_patient_data":True,
   "max_new_paid_usd":a.budget_usd,"production_or_prescriptions":False,
   "architecture_caveat":"Same one Haiku model in five distinct functional roles, NOT independent-model clinical evidence",
 }
 (dst/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
 if any(v is None for v in prices.values()):
  missing=[mapping[k] for k,v in prices.items() if v is None]
  (dst/"summary.json").write_text(json.dumps({"status":"catalog_model_unavailable",
   "missing_models":missing,"billed_usd":0,"clinical_score":None},indent=2))
  raise SystemExit("Model unavailable/changed price; stopped before spending. "+str(missing))

 archived={}
 if a.profile=="free":
  prior=Path("benchmark/internal-results/academy-free-prior/free/responses.jsonl")
  if prior.exists():
   old=[json.loads(line) for line in prior.read_text().splitlines() if line.strip()]
   for cid in CASE_IDS:
    rows=[v for v in old if v.get("case")==cid]
    if len(rows)==5 and {v.get("role") for v in rows}==set(ROLE_IDS) and all(float(v.get("usd",0))==0 for v in rows):
     archived[cid]=rows
 print("REUSED_ARCHIVED_FREE",list(archived),flush=True)
 results=[];spent=0.0
 for cid in CASE_IDS[a.start:a.start+a.limit]:
  if cid in archived:
   for x in archived[cid]:
    row=dict(x);row["archive_reused"]="2026-11-19 original free two-case pilot"
    results.append(row)
    with (dst/"responses.jsonl").open("a",encoding="utf-8") as w:w.write(json.dumps(row,ensure_ascii=False)+"\n")
   print("CASE_ARCHIVE_REUSE",cid,flush=True)
   continue
  voices=[]
  for role in ROLE_IDS:
   model=mapping[role];ri,ro=prices[role];max_tokens=TOKEN_CAPS[role]
   original=cases[cid]
   context=original
   if role=="checklist":
    opinions="\n\n".join(
      f"{v['role']} | {v['model']} | status={v['status']}:\n"+
      (v.get("answer") or "[NO COMPLETED CONTENT — NOT AN APPROVAL]")
      for v in voices)
    context=original+"\n\nFOUR INDEPENDENT UNVERIFIED ROLE OPINIONS; " + (
      "DO NOT treat them as facts, do not conceal missing/unfinished voices:\n"+opinions)
   system=("Research-only Doctor Opus Academy synthetic clinical simulation. "+
     ROLE_PROMPTS[role]+
     "\nNever invent drug doses, tests, patient findings, lab units, allergies, sources or guideline quotes. "
     "If uncertain, preserve uncertainty and identify the critical verification required. "
     "Do not silently convert an incomplete independent opinion into consensus. "
     "No real patient data. Draft in English only; never claim a signed clinical order. "
     "Make clinically useful conditional recommendations when evidence permits; do not evade reasonable action merely because some data are missing.")
   # Two-tier input reservation: preliminary roles see only the question;
   # synthesis sees all generated prior voices, which is larger.
   reserved_input=15000 if role=="checklist" else 4500
   reserve=reserved_input*ri+max_tokens*ro
   if spent+reserve>a.budget_usd+1e-10:
    results.append({"case":cid,"role":role,"model":model,"status":"budget_guard","usd":0.0})
    print("BUDGET_STOP",cid,role,spent,flush=True)
    break
   row={"case":cid,"role":role,"model":model,"status":"failed","usd":0.0}
   started=time.monotonic()
   payload={"model":model,"messages":[{"role":"system","content":system},
      {"role":"user","content":context}],"temperature":0,"max_tokens":max_tokens,
      "reasoning":{"effort":"low"},"stream":False}
   for attempt in range(2):
    try:
     req=request.Request(CHAT_URL,data=json.dumps(payload).encode(),method="POST",
       headers={"Authorization":"Bearer "+key,"Content-Type":"application/json",
        "X-Title":"Doctor Opus Academy public MAST 12 research"})
     with request.urlopen(req,timeout=190) as resp:data=json.loads(resp.read(10000000))
     usage=data.get("usage") or {}
     if usage.get("cost") is None:raise RuntimeError("unpriced_provider_response")
     cost=float(usage["cost"]);spent+=cost;row["usd"]=cost
     if cost<0 or cost>reserve+1e-7 or spent>a.budget_usd+1e-7:
      row["status"]="unexpected_charge"
      break
     if data.get("model") not in (None,model):
      row["status"]="unexpected_model_substitution"
      break
     choice=(data.get("choices") or [{}])[0]
     answer=(choice.get("message") or {}).get("content") or ""
     if isinstance(answer,list):answer="\n".join(x.get("text","") for x in answer if isinstance(x,dict))
     reason=choice.get("finish_reason")
     row.update({"answer":str(answer).strip(),"usage":usage,"finish_reason":reason,
       "status":"ok" if reason=="stop" and len(str(answer).strip())>=80 else "incomplete"})
     break
    except error.HTTPError as e:
     row["error"]="http_"+str(e.code)
     row["status"]="rate_limited" if e.code==429 else "provider_unavailable"
     if e.code==429 and attempt==0:
      time.sleep(25);continue
     break
    except Exception as e:
     row["error"]=type(e).__name__
     row["status"]="inference_or_usage_failure"
     break
   row["seconds"]=round(time.monotonic()-started,2)
   results.append(row);voices.append(row)
   with (dst/"responses.jsonl").open("a",encoding="utf-8") as w:
    w.write(json.dumps(row,ensure_ascii=False)+"\n")
   print("ACADEMY12_ROLE",json.dumps({"case":cid,"role":role,"model":model,
      "status":row["status"],"usd":round(row["usd"],8),
      "seconds":row["seconds"]}),flush=True)
   if row["status"] in ("unexpected_charge","unexpected_model_substitution","budget_guard"):
    break
   time.sleep(2)
  # If a provider is down, the final synthesis is permitted to say no conclusion,
  # but clinical comparison will classify the study as incomplete.
  print("ACADEMY12_CASE",json.dumps({"case":cid,"role_rows":len(voices),
    "successful":sum(r["status"]=="ok" for r in voices)}),flush=True)
  if results and results[-1]["status"] in ("unexpected_charge","unexpected_model_substitution","budget_guard"):
   break

 with (dst/"responses.jsonl").open("a") as f:pass
 reports={}
 for cid in CASE_IDS[a.start:a.start+a.limit]:
  items=[r for r in results if r.get("case")==cid]
  final=next((r for r in items if r.get("role")=="checklist"),None)
  reports[cid]={"voices":len(items),"ok_voices":sum(r.get("status")=="ok" for r in items),
    "complete_final":bool(final and final.get("status")=="ok"),
    "fully_complete":len(items)==5 and all(r.get("status")=="ok" for r in items),
    "incomplete_roles":[r.get("role") for r in items if r.get("status")!="ok"],
    "usd":round(sum(float(r.get("usd") or 0) for r in items if not r.get("archive_reused")),7),
    "archived":cid in archived}
 summary={"profile":a.profile,"planned_cases":a.limit,"shard_start":a.start,"actual_cases_with_final":sum(x["complete_final"] for x in reports.values()),
   "all_five_roles_complete":sum(x["fully_complete"] for x in reports.values()),
   "case_results":reports,"billed_new_usd":round(spent,8),"hard_cap_new_usd":a.budget_usd,
   "archived_free_reused":len(archived),"model_errors_are_not_clinical_zero_scores":True,
   "clinical_score":"NOT AUTOMATICALLY SCORED; compare exact rubrics and clinician adjudication",
   "training_only":True}
 (dst/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
 print("ACADEMY12_SUMMARY",json.dumps({k:v for k,v in summary.items() if k!="case_results"}),flush=True)
 if summary["actual_cases_with_final"]<a.limit:
  raise SystemExit("Some clinical cases have no completed final; preserve partial artifact, not a model accuracy score")
if __name__=="__main__":main()
