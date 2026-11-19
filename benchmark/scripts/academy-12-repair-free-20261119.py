#!/usr/bin/env python3
"""Zero-dollar ONLY targeted repair of incomplete free 12-case ensemble roles.
Never retry already complete voices; never silently bill or substitute provider.
"""
import importlib.util,json,os,pathlib,time
from urllib import request,error
SRC=pathlib.Path("benchmark/internal-results/academy12-free-original/free/responses.jsonl")
OUT=pathlib.Path("benchmark/internal-results/academy12-free-repaired");OUT.mkdir(parents=True,exist_ok=True)
orig=[json.loads(s) for s in SRC.read_text().splitlines() if s.strip()]
assert len(orig)==60 and all(float(x.get("usd") or 0)==0 for x in orig)
spec=importlib.util.spec_from_file_location("academy12","benchmark/scripts/academy-12-headtohead-20261119.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ID=m.CASE_IDS;R=m.ROLE_IDS;MODELS=m.ROLE_MODELS["free"]
key=os.getenv("OPENROUTER_API_KEY","")
if not key:raise SystemExit("GitHub secret absent, no calls")
cat={x["id"]:x for x in json.loads(m.get(m.CATALOG_URL))["data"]}
if not all(m.rate(cat,model,"free")== (0,0) for model in MODELS.values()):
 raise SystemExit("Free pricing/model changed, NO calls")
source={x["id"]:x["prompt"] for line in m.get(m.CASES_URL).decode().splitlines() if line.strip()
 for x in [json.loads(line)] if x.get("metadata",{}).get("open") and x.get("metadata",{}).get("perturb_id") is None}
assert len(source)==30
caps={"hypothesis":6000,"testChooser":6000,"challenger":10000,"stewardship":6200,"checklist":10000}
revisions=[];merged=[];spent=0.0
def ask(cid,role,context):
 global spent
 model=MODELS[role]
 sys=("Research-only Doctor Opus Academy synthetic clinical simulation. "+m.ROLE_PROMPTS[role]+
 "\nNever invent findings, drug doses, laboratory results, guidelines, or sources. "
 "Keep unknown data unknown; distinguish an absent critic from agreement. "
 "English only. Do not sign a clinical order, this is public training.")
 p={"model":model,"messages":[{"role":"system","content":sys},{"role":"user","content":context}],
 "temperature":0,"reasoning":{"effort":"low"},"max_tokens":caps[role],"stream":False}
 row={"case":cid,"role":role,"model":model,"status":"error","usd":0.0}
 t=time.monotonic()
 for attempt in range(2):
  try:
   req=request.Request(m.CHAT_URL,data=json.dumps(p).encode(),method="POST",
     headers={"Authorization":"Bearer "+key,"Content-Type":"application/json",
       "X-Title":"Doctor Opus Academy free 12-case only-incomplete repair"})
   with request.urlopen(req,timeout=240) as rsp:data=json.loads(rsp.read(12000000))
   usage=data.get("usage") or {}
   if usage.get("cost") is None or float(usage["cost"])!=0:
    raise SystemExit("UNEXPECTED PAID CHARGE OR MISSING BILLING — STOP")
   if data.get("model") not in (None,model):
    raise SystemExit("MODEL SUBSTITUTION — STOP")
   choice=(data.get("choices") or [{}])[0]
   answer=(choice.get("message") or {}).get("content") or ""
   if isinstance(answer,list):answer="\n".join(x.get("text","") for x in answer if isinstance(x,dict))
   row.update({"answer":str(answer).strip(),"finish_reason":choice.get("finish_reason"),
    "usage":usage,"status":"ok" if choice.get("finish_reason")=="stop" and len(str(answer).strip())>=80 else "incomplete"})
   break
  except error.HTTPError as e:
   row.update({"status":"provider_http_"+str(e.code),"error":"provider_http_"+str(e.code)})
   if e.code==429 and attempt==0:
    time.sleep(30);continue
   break
  except Exception as e:
   row.update({"status":"other_provider_failure","error":type(e).__name__})
   break
 row["seconds"]=round(time.monotonic()-t,2)
 revisions.append(row)
 with (OUT/"revisions.jsonl").open("a",encoding="utf-8") as f:f.write(json.dumps(row,ensure_ascii=False)+"\n")
 print("FREE_TARGETED_RETRY",json.dumps({"case":cid,"role":role,"status":row["status"],"usd":row["usd"]}),flush=True)
 time.sleep(1)
 return row
for cid in ID:
 old={x["role"]:x for x in orig if x["case"]==cid}
 assert len(old)==5
 active=dict(old);changed=False
 for role in R[:-1]:
  if old[role]["status"]=="ok":continue
  new=ask(cid,role,source[cid])
  if new["status"]=="ok":active[role]=new;changed=True
 if changed or old["checklist"]["status"]!="ok":
  packet="\n\n".join(
   role+" | status="+active[role]["status"]+" | "+MODELS[role]+":\n"+
      (active[role].get("answer") or "[NO COMPLETED CONTENT]")
   for role in R[:-1])
  ctx=source[cid]+"\n\nFOUR INDEPENDENT UNVERIFIED VOICES, NOT FACTS; DO NOT HIDE FAILURES:\n"+packet
  fin=ask(cid,"checklist",ctx)
  if fin["status"]=="ok":active["checklist"]=fin
 for role in R:
  x=dict(active[role])
  x["selected_from"]="targeted_free_retry" if active[role] is not old[role] else "original_free_run"
  merged.append(x)
 with (OUT/"merged-latest.jsonl").open("a",encoding="utf-8") as f:
  for role in R:f.write(json.dumps(merged[-5+R.index(role)],ensure_ascii=False)+"\n")
summary={"cases":len(ID),"original_role_rows":len(orig),"targeted_zero_cost_retries":len(revisions),
 "final_answers_complete":sum(any(x["case"]==cid and x["role"]=="checklist" and x["status"]=="ok" for x in merged) for cid in ID),
 "all_five_roles_complete":sum(all(any(x["case"]==cid and x["role"]==role and x["status"]=="ok" for x in merged) for role in R) for cid in ID),
 "total_paid_usd":0.0,"source_case_rubric_not_sent":True,"clinical_validation":False}
(OUT/"summary.json").write_text(json.dumps(summary,indent=2)+"\n")
print("FREE_TARGETED_REPAIR_SUMMARY",json.dumps(summary),flush=True)
if summary["final_answers_complete"]<12:
 raise SystemExit("Some free final answers remain incomplete, no clinical zero score")
