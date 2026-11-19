#!/usr/bin/env python3
"""Doctor Opus Academy: isolated research-only *actual* 5-role ensemble.

Mirrors the functional roles from consilium/lib/consilium.ts; DOES NOT import or
modify production runtime. Runs ORIGINAL pinned public MAST synthetic cases.
Profiles: free (strictly 0 USD checked in live OpenRouter catalog), light (paid
explicitly approved with independent total cap). No personal/clinical uploads.
No grading by self-congratulation; preserve every disagreement and failure.
"""
import argparse
import ast
import json
import os
from pathlib import Path
import re
import time
from urllib import request, error

ROOT = Path("benchmark/internal-results/academy-cheap-ensemble-20261119")
MODEL_URL = "https://openrouter.ai/api/v1/models"
CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
MAST_SHA = "57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee"
MAST_URL = f"https://raw.githubusercontent.com/ARISENetwork/mast/{MAST_SHA}/benchmarks/donoharm/dataset/items.jsonl"
# Three original cases (subset of the identical 12-case Opus/Haiku/Nemotron trial).
CASE_IDS = ("Card002", "Derm001", "GI002")
ROLE_ORDER = ("hypothesis", "testChooser", "challenger", "stewardship", "checklist")
ROLE_TASKS = {
 "hypothesis": "You list differential hypotheses only. Include one dangerous alternative. Do not prescribe treatment.",
 "testChooser": "You suggest which test would separate the hypotheses. You do not order tests.",
 "challenger": "You are the critic. Disagree where the hypothesis is weak. Name what is overestimated and what is underestimated. Do not agree by default.",
 "stewardship": "Review the proposed management for avoidable harm. Check documented medications, allergies, comorbidities and organ function, and state what is missing before choosing an option. Do not add diagnoses or invent contraindications.",
 "checklist": "Synthesize the four independent opinions for the physician. Resolve material disagreements against the supplied evidence. State the supported next step, a safety check, what would change the decision and any urgent escalation trigger. Distinguish unsupported options and absent votes. The draft stays unsigned.",
}
# Free models are never assumed to be free just because their ID has :free.
# All actual role IDs and prices must be re-verified from OpenRouter catalog.
PROFILES = {
 "free": {
   "hypothesis": "nvidia/nemotron-3-ultra-550b-a55b:free",
   "testChooser": "nvidia/nemotron-3.5-super-vl:free",
   "challenger": "inclusionai/ling-3.2-flash:free",
   "stewardship": "inclusionai/ling-3.0-flash-sante:free",
   "checklist": "nvidia/nemotron-3-ultra-550b-a55b:free",
 },
 "light": {
   "hypothesis": "anthropic/claude-haiku-5.5",
   "testChooser": "google/gemini-3.1-flash-lite",
   "challenger": "nvidia/nemotron-3-ultra-550b-a55b:free",
   "stewardship": "google/gemini-3.5-flash-lite",
   "checklist": "anthropic/claude-haiku-5.5",
 },
}
TOKEN_CAPS={"hypothesis":1100,"testChooser":1000,"challenger":1300,
            "stewardship":1150,"checklist":2000}
# Conservative input-token reservation per call, not merely count chars / 4.
RESERVED_INPUT_TOKENS=22000
HEADERS={"User-Agent":"DoctorOpusAcademyResearch/1.0"}

def public_get(url,timeout=45):
 with request.urlopen(request.Request(url,headers=HEADERS),timeout=timeout) as r:
  return r.read(9000000)

def parse_args():
 a=argparse.ArgumentParser()
 a.add_argument("--profile",choices=("free","light"),default="free")
 a.add_argument("--case-limit",type=int,default=3,choices=(1,2,3))
 a.add_argument("--max-total-usd",type=float,default=0.0)
 return a.parse_args()

def price_info(catalog, model, profile):
 entry=catalog.get(model)
 if not entry: return None
 caps=(entry.get("architecture") or {}).get("input_modalities") or []
 if "text" not in caps:return None
 price=entry.get("pricing") or {}
 try:
  rin=float(price["prompt"]);rout=float(price["completion"])
 except (ValueError,KeyError,TypeError):
  return None
 if not (0<=rin<=0.000001 and 0<=rout<=0.000005):return None
 if profile=="free" and (rin!=0 or rout!=0 or not model.endswith(":free")):return None
 return {"in":rin,"out":rout}

def main():
 a=parse_args()
 if a.profile=="free":
  if a.max_total_usd!=0:raise SystemExit("free profile forbids paid budget")
 else:
  if a.max_total_usd<=0 or a.max_total_usd>0.50 or os.getenv("ACADEMY_PAID_EXPLICIT_APPROVAL")!="YES":
   raise SystemExit("light profile requires explicit future approval and an independent <= $0.50 total cap; no calls")
 if not os.environ.get("OPENROUTER_API_KEY"):
  raise SystemExit("No OpenRouter GitHub secret. No calls made.")
 rows=[json.loads(s) for s in public_get(MAST_URL).decode().splitlines() if s.strip()]
 cases={x["id"]:x for x in rows if x.get("metadata",{}).get("open") and x.get("metadata",{}).get("perturb_id") is None}
 if len(cases)!=30 or any(cid not in cases for cid in CASE_IDS):
  raise SystemExit("Frozen source or historical case IDs changed; no calls")
 catalog={x["id"]:x for x in json.loads(public_get(MODEL_URL))["data"]}
 mapping=PROFILES[a.profile]
 rates={role:price_info(catalog,model,a.profile) for role,model in mapping.items()}
 ROOT.mkdir(parents=True,exist_ok=True)
 out=ROOT/a.profile
 out.mkdir(parents=True,exist_ok=True)
 manifest={"mode":"TRAINING-RESEARCH","profile":a.profile,"case_ids":list(CASE_IDS[:a.case_limit]),
  "mast_sha":MAST_SHA,"role_order":ROLE_ORDER,"models":mapping,"price_per_token":rates,
  "role_prompts":ROLE_TASKS,"max_tokens":TOKEN_CAPS,"budget_usd":a.max_total_usd,
  "architecture":"Four independent specialty/function voices; final synthesizer sees their exact outputs.",
  "not_production":True,"not_full_clinical_validation":True,
  "reference_not_sent":True,"no_real_patient_data":True,
  "disclaimer":"TRAINING ONLY — unsigned draft. Do not use to diagnose or prescribe."}
 (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
 if a.profile=="free" and not all(rates.values()):
  missing=[mapping[k] for k,v in rates.items() if v is None]
  (out/"summary.json").write_text(json.dumps({"status":"unavailable_free_models","models":missing,
   "spent_usd":0,"unavailable_is_not_clinical_failure":True},indent=2)+"\n")
  print("ACADEMY_FREE_UNAVAILABLE",json.dumps(missing),flush=True)
  raise SystemExit("One or more exact free models unavailable. No paid fallback or calls.")
 spent=0.0
 outputs=[]
 for cid in CASE_IDS[:a.case_limit]:
  first_four=[]
  for role in ROLE_ORDER:
   model=mapping[role];price=rates[role]
   max_tokens=TOKEN_CAPS[role]
   if price is None:
    outputs.append({"case":cid,"role":role,"model":model,"status":"model_unavailable","usd":0})
    break
   # Only final synthesis sees the independent voices. The first four do not see each other.
   context=cases[cid]["prompt"]
   if role=="checklist":
    context+="\n\nINDEPENDENT UNVERIFIED OPINIONS (not patient facts):\n"+(
      "\n\n".join(f"{x['role']} [{x['model']}]: {x['answer']}" for x in first_four if x.get("status")=="ok")
      or "(none available)")
   sys=("You are a functional participant in a research-only TRAINING simulation "
     "of a physician's multi-agent clinical workflow. "+ROLE_TASKS[role]+
     " Original data can be incomplete; do not fabricate observations, lab values, "
     "tests, medication doses, verified sources, radiology readings or orders. "
     "Clearly differentiate suspected, observed and unknown. "
     "Do not claim other model opinions are medical evidence. "
     "This is an unsigned educational draft for physician review. "
     "Answer in English, concise but sufficiently concrete.")
   reserve=RESERVED_INPUT_TOKENS*price["in"]+max_tokens*price["out"]
   if spent+reserve>a.max_total_usd+1e-10:
    outputs.append({"case":cid,"role":role,"model":model,"status":"hard_budget_stop","usd":0})
    print("ACADEMY_BUDGET_STOP",json.dumps({"case":cid,"role":role,"spent":spent}),flush=True)
    break
   start=time.monotonic()
   rec={"case":cid,"role":role,"model":model,"status":"error"}
   req=request.Request(CHAT_URL,method="POST",data=json.dumps({
    "model":model,"messages":[{"role":"system","content":sys},{"role":"user","content":context}],
    "max_tokens":max_tokens,"temperature":0,"stream":False,"reasoning":{"effort":"low"}}).encode(),
    headers={"Authorization":"Bearer "+os.environ["OPENROUTER_API_KEY"],
     "Content-Type":"application/json","X-Title":"Doctor Opus Academy synthetic free ensemble"})
   try:
    with request.urlopen(req,timeout=190) as rr:
     data=json.loads(rr.read(9000000))
    usage=data.get("usage") or {}
    if usage.get("cost") is None:raise RuntimeError("missing_actual_usage_cost")
    billed=float(usage["cost"]);spent+=billed
    if billed<0 or billed>reserve+1e-7 or spent>a.max_total_usd+1e-7:
     rec["status"]="unexpected_paid_billing";rec["usd"]=billed;outputs.append(rec)
     raise SystemExit("Stop: unexpected provider charge; no more calls.")
    if data.get("model") not in (None,model):
     raise SystemExit("Stop: unapproved model substitution.")
    choice=(data.get("choices") or [{}])[0];ans=(choice.get("message") or {}).get("content") or ""
    if isinstance(ans,list):ans="\n".join(v.get("text","") for v in ans if isinstance(v,dict))
    status="ok" if choice.get("finish_reason")=="stop" and len(str(ans).strip())>60 else "incomplete"
    rec.update({"status":status,"answer":str(ans).strip(),"usage":usage,
                "finish_reason":choice.get("finish_reason"),"usd":billed})
   except error.HTTPError as exc:
    rec.update({"error":"HTTP_"+str(exc.code),"usd":0})
    # Blocked or rate limited: do not pay for fallbacks or make repeated calls.
    if exc.code in (401,402,403,429):
     rec["status"]="provider_blocked"
   except (TimeoutError,ValueError,RuntimeError) as exc:
    rec.update({"error":type(exc).__name__,"usd":0})
   rec["seconds"]=round(time.monotonic()-start,2)
   outputs.append(rec)
   with (out/"responses.jsonl").open("a",encoding="utf-8") as f:
    f.write(json.dumps(rec,ensure_ascii=False)+"\n")
   print("ACADEMY_ROLE",json.dumps({"case":cid,"role":role,"model":model,
     "status":rec["status"],"usd":rec.get("usd",0)}),flush=True)
   if rec["status"]=="ok" and role!="checklist":first_four.append(rec)
   if rec["status"]=="provider_blocked":break
   time.sleep(2)
  else:
   continue
  if outputs and outputs[-1]["status"] in ("provider_blocked","hard_budget_stop","unexpected_paid_billing"):
   break
 summary={"profile":a.profile,"case_ids":list(CASE_IDS[:a.case_limit]),
   "completed_studies":sum(any(r["case"]==cid and r["role"]=="checklist" and r["status"]=="ok" for r in outputs) for cid in CASE_IDS[:a.case_limit]),
   "role_calls":len(outputs),"valid_role_responses":sum(x["status"]=="ok" for x in outputs),
   "spent_usd":round(spent,8),"hard_cap_usd":a.max_total_usd,
   "clinical_quality":"NOT SCORED; independent rubric-based physician review required",
   "missing_roles_are_not_zero_accuracy":True,"no_patient_data":True}
 (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
 print("ACADEMY_SUMMARY",json.dumps(summary,ensure_ascii=False),flush=True)
 # Technical no-response or free-provider blocking is a clear CI warning, not a clinical 0.
 if summary["completed_studies"]==0:raise SystemExit("No complete five-role study. Inspect provider/formatting: NOT a clinical quality score.")

if __name__=="__main__":main()
