#!/usr/bin/env python3
"""Targeted repair of only truncated Academy Mixed role responses, no re-billing
of originally completed individual roles. Re-synthesize ONLY when an upstream
voice changed or original checklist was truncated. Keep original records intact.
Total entire experiment plus aborted duplicate must be <= USD 0.20.
"""
import importlib.util,json,os,pathlib,time
from urllib import request,error
SRC=pathlib.Path("benchmark/internal-results/academy12-mixed-original/mixed/responses.jsonl")
OUT=pathlib.Path("benchmark/internal-results/academy12-mixed-repaired")
OUT.mkdir(parents=True,exist_ok=True)
ORIGINAL=[json.loads(x) for x in SRC.read_text().splitlines() if x.strip()]
assert len(ORIGINAL)==60
spec=importlib.util.spec_from_file_location("academy12","benchmark/scripts/academy-12-headtohead-20261119.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CASE_IDS=m.CASE_IDS
ROLES=m.ROLE_IDS
MODELS=m.ROLE_MODELS["mixed"]
DATA={r["id"]:r["prompt"] for line in m.get(m.CASES_URL).decode().splitlines() if line.strip()
 for r in [json.loads(line)] if r.get("metadata",{}).get("open") and r.get("metadata",{}).get("perturb_id") is None}
catalog={x["id"]:x for x in json.loads(m.get(m.CATALOG_URL))["data"]}
prices={r:m.rate(catalog,model,"mixed") for r,model in MODELS.items()}
if any(v is None for v in prices.values()):raise SystemExit("Repricing / model unavailable, no calls")
KEY=os.environ.get("OPENROUTER_API_KEY","")
if not KEY:raise SystemExit("No GitHub secret")
ALREADY=sum(float(x.get("usd") or 0) for x in ORIGINAL)
CANCELLED_DUPLICATE_USD=0.01824315
assert abs(ALREADY-0.0892215)<0.0000002
TOTAL_CAP_USD=0.20
ADDITIONAL_HARD_CAP_USD=TOTAL_CAP_USD-ALREADY-CANCELLED_DUPLICATE_USD
assert 0.08<ADDITIONAL_HARD_CAP_USD<0.10
RETRY_CAPS={"hypothesis":3800,"testChooser":3800,"challenger":6000,"stewardship":4000,"checklist":7700}
revisions=[];extra=0
def api_call(cid,role,context):
 global extra
 model=MODELS[role];ri,ro=prices[role];max_tokens=RETRY_CAPS[role]
 reserved_input=15000 if role=="checklist" else 4500
 reservation=reserved_input*ri+max_tokens*ro
 if ALREADY+CANCELLED_DUPLICATE_USD+extra+reservation>TOTAL_CAP_USD:
  return {"case":cid,"role":role,"model":model,"status":"cumulative_budget_guard","usd":0}
 sys=("Research-only Doctor Opus Academy synthetic clinical simulation. "+m.ROLE_PROMPTS[role]+
 "\nNever invent drug doses, tests, patient findings, lab units, allergies, sources or guideline quotes. "
 "If uncertain, preserve uncertainty and identify the critical verification required. "
 "Do not silently convert an incomplete independent opinion into consensus. "
 "No real patient data. Draft in English only; never claim a signed clinical order.")
 p={"model":model,"messages":[{"role":"system","content":sys},{"role":"user","content":context}],
 "temperature":0,"max_tokens":max_tokens,"reasoning":{"effort":"low"},"stream":False}
 row={"case":cid,"role":role,"model":model,"status":"error","usd":0.0}
 t=time.monotonic()
 try:
  req=request.Request(m.CHAT_URL,method="POST",data=json.dumps(p).encode(),
   headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json",
    "X-Title":"Doctor Opus Academy targeted incomplete-role repair"})
  with request.urlopen(req,timeout=220) as resp:data=json.loads(resp.read(12000000))
  usage=data.get("usage") or {}
  if usage.get("cost") is None:raise RuntimeError("missing_usage_cost")
  actual=float(usage["cost"]);extra+=actual
  if actual<0 or actual>reservation+0.0000001 or ALREADY+CANCELLED_DUPLICATE_USD+extra>TOTAL_CAP_USD:
   raise RuntimeError("budget_violation_STOP")
  if data.get("model") not in (None,model):raise RuntimeError("model_substitution_STOP")
  ch=(data.get("choices") or [{}])[0]
  answer=(ch.get("message") or {}).get("content") or ""
  if isinstance(answer,list):answer="\n".join(x.get("text","") for x in answer if isinstance(x,dict))
  row.update({"answer":str(answer).strip(),"usage":usage,"finish_reason":ch.get("finish_reason"),
   "status":"ok" if ch.get("finish_reason")=="stop" and len(str(answer).strip())>80 else "incomplete",
   "usd":actual})
 except error.HTTPError as e:row.update({"status":"provider_error","error":"HTTP_"+str(e.code)})
 except Exception as e:row.update({"status":"error","error":type(e).__name__})
 row["seconds"]=round(time.monotonic()-t,2)
 revisions.append(row)
 with (OUT/"revisions.jsonl").open("a") as f:f.write(json.dumps(row,ensure_ascii=False)+"\n")
 print("TARGETED_RETRY",json.dumps({"case":cid,"role":role,"status":row["status"],
   "new_paid":round(extra,7)}),flush=True)
 time.sleep(1)
 return row
merged=[]
for cid in CASE_IDS:
 original={r["role"]:r for r in ORIGINAL if r["case"]==cid}
 assert set(original)==set(ROLES)
 latest=dict(original);changed=False
 for role in ROLES[:-1]:
  if original[role]["status"]=="ok":continue
  ans=api_call(cid,role,DATA[cid])
  if ans["status"]=="ok":
   latest[role]=ans;changed=True
  if ans["status"]=="cumulative_budget_guard":break
 if changed or original["checklist"]["status"]!="ok":
  opinions="\n\n".join(
    f"{role} | {MODELS[role]} | status={latest[role]['status']}:\n"+
      (latest[role].get("answer") or "[NO COMPLETED CONTENT — NOT AN APPROVAL]")
    for role in ROLES[:-1])
  ctx=DATA[cid]+"\n\nFOUR INDEPENDENT UNVERIFIED ROLE OPINIONS; DO NOT treat them as facts, do not conceal missing/unfinished voices:\n"+opinions
  final=api_call(cid,"checklist",ctx)
  if final["status"]=="ok":latest["checklist"]=final
 for role in ROLES:
  rr=dict(latest[role])
  rr["selected_from"]="targeted_retry" if latest[role] is not original[role] else "original_paid_run"
  merged.append(rr)
 with (OUT/"merged-latest.jsonl").open("a",encoding="utf-8") as f:
  for role in ROLES:f.write(json.dumps(merged[-5+ROLES.index(role)],ensure_ascii=False)+"\n")
summary={
 "original_paid_usd":round(ALREADY,8),
 "cancelled_obsolete_job_usd":CANCELLED_DUPLICATE_USD,
 "additional_paid_usd":round(extra,8),
 "total_new_study_spend_including_cancelled":round(ALREADY+CANCELLED_DUPLICATE_USD+extra,8),
 "strict_total_cap_usd":TOTAL_CAP_USD,
 "case_count":12,
 "final_answers_complete":sum(any(x["case"]==cid and x["role"]=="checklist" and x["status"]=="ok" for x in merged) for cid in CASE_IDS),
 "all_five_roles_complete":sum(all(any(x["case"]==cid and x["role"]==role and x["status"]=="ok" for x in merged) for role in ROLES) for cid in CASE_IDS),
 "no_unchanged_valid_role_rebilled":True,
 "not_clinical_quality_score":True,
}
(OUT/"summary.json").write_text(json.dumps(summary,indent=2)+"\n")
print("ACADEMY_TARGETED_REPAIR_SUMMARY",json.dumps(summary),flush=True)
if summary["final_answers_complete"]!=12:raise SystemExit("Partial technical coverage remains; do not interpret as clinical failure")
