#!/usr/bin/env python3
"""Restore nine paid Opus pairs from earlier CI artifact, then generate exactly
three missing pairs. No repeated model calls for completed cases. Frozen same
clinical prompts; last-three token caps expanded after recorded truncation.
"""
import ast,json,os,pathlib,time
from urllib import request,error
ROOT=pathlib.Path("benchmark/internal-results/opus-nemotron-paired-20261119")
ROOT.mkdir(parents=True,exist_ok=True)
source=ast.parse(pathlib.Path("benchmark/scripts/opus-nemotron-paired-20261119.py").read_text())
def literal(name):
 for n in source.body:
  if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets):
   return ast.literal_eval(n.value)
 raise RuntimeError("Could not read frozen original "+name)
CASES=literal("CASES");SYSTEM=literal("SYSTEM");AUDIT_SYSTEM=literal("AUDITOR_SYSTEM")
PREF=literal("AUDIT_PREFIX");SUFF=literal("AUDIT_SUFFIX")
MAST_SHA=literal("MAST_SHA");OPUS=literal("OPUS");NEMO=literal("AUDITOR")
KEY=os.getenv("OPENROUTER_API_KEY","")
if not KEY:raise SystemExit("Missing configured GitHub secret")
def read_rows(file):
 return [json.loads(x) for x in (ROOT/file).read_text().splitlines() if x.strip()]
a=read_rows("opus-alone.jsonl");b=read_rows("opus-plus-nemotron.jsonl")
assert len(a)==len(b)==9
assert [x["id"] for x in a]==[x["id"] for x in b]==list(CASES[:9])
assert all(len(x["response"])>500 for x in a+b)
rows={}
url="https://raw.githubusercontent.com/ARISENetwork/mast/"+MAST_SHA+"/benchmarks/donoharm/dataset/items.jsonl"
with request.urlopen(request.Request(url,headers={"User-Agent":"DoctorOpusPairedResumption/1.0"}),timeout=40) as resp:
 for s in resp.read().decode().splitlines():
  if not s.strip():continue
  row=json.loads(s)
  if row.get("metadata",{}).get("open") and row.get("metadata",{}).get("perturb_id") is None:
   rows[row["id"]]=row
assert len(rows)==30
with request.urlopen("https://openrouter.ai/api/v1/models",timeout=40) as resp:
 models={x["id"]:x for x in json.loads(resp.read())["data"]}
assert OPUS in models and NEMO in models
def rate(m):
 p=models[m]["pricing"]
 return float(p["prompt"])*1e6,float(p["completion"])*1e6
assert rate(NEMO)==(0,0)
assert rate(OPUS)[0]<=4.01 and rate(OPUS)[1]<=20.01
spent=0.0
max_total=1.00
def make_call(mid,system,user,max_tokens):
 global spent
 pr,cr=rate(mid)
 reserve=(len((system+user).encode())+1800)*pr/1e6 + max_tokens*cr/1e6
 if spent+reserve>max_total:raise RuntimeError("resume budget stop")
 payload={"model":mid,"messages":[{"role":"system","content":system},{"role":"user","content":user}],
          "temperature":0,"max_tokens":max_tokens,"reasoning":{"effort":"low"}}
 req=request.Request("https://openrouter.ai/api/v1/chat/completions",method="POST",
       data=json.dumps(payload).encode(),headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
 started=time.monotonic()
 try:
  with request.urlopen(req,timeout=190) as resp:data=json.loads(resp.read())
 except error.HTTPError as e:raise RuntimeError("provider_http_"+str(e.code)) from None
 usage=data.get("usage") or {}
 if usage.get("cost") is None:raise RuntimeError("No actual billing available")
 cost=float(usage["cost"]);spent+=cost
 msg=(data.get("choices") or [{}])[0].get("message") or {}
 answer=msg.get("content") or ""
 if isinstance(answer,list):answer="\n".join(x.get("text","") for x in answer if isinstance(x,dict))
 if not isinstance(answer,str) or len(answer.strip())<200:raise RuntimeError("Blank reply")
 finish=(data.get("choices") or [{}])[0].get("finish_reason")
 if finish!="stop":raise RuntimeError("Truncated or failed response: "+str(finish))
 return {"response":answer.strip(),"usage":{"cost":cost,"prompt_tokens":usage.get("prompt_tokens"),"completion_tokens":usage.get("completion_tokens")},
         "duration_s":round(time.monotonic()-started,2)}
def append(file,x):
 with (ROOT/file).open("a") as fp:fp.write(json.dumps(x,ensure_ascii=False)+"\n")
completed=9
for i,cid in enumerate(CASES[9:],9):
 try:
  question=rows[cid]["prompt"]
  auditor=make_call(NEMO,AUDIT_SYSTEM,question,3500)
  append("nemotron-audit.jsonl",{"id":cid,**auditor})
  order=("A","B") if i%2==0 else ("B","A")
  for arm in order:
   prompt=question if arm=="A" else question+PREF+auditor["response"]+SUFF
   answer=make_call(OPUS,SYSTEM,prompt,3500)
   append("opus-alone.jsonl" if arm=="A" else "opus-plus-nemotron.jsonl",
     {"id":cid,"trial":1,"response":answer["response"],"usage":answer["usage"]})
   print("PAIR_RESUME "+json.dumps({"case":cid,"arm":arm,"cost":answer["usage"]["cost"],"seconds":answer["duration_s"]}),flush=True)
  completed+=1
  print("PAIR_CASE_FINISHED "+cid,flush=True)
 except Exception as e:
  err=str(e)
  if KEY in err:err="redacted"
  print("PAIR_RESUME_STOP "+json.dumps({"case":cid,"error":err,"completed_pairs":completed,"resume_cost":round(spent,5)}),flush=True)
  break
summary={"completed_pairs":completed,"original_completed":9,"new_completed":completed-9,
  "resume_billed_usd":round(spent,6),"last_cases_token_cap":3500,
  "note":"Original first nine used 2300 tokens and original prompt. Last three used 3500 after truncation; same prompt."}
(ROOT/"summary-resumed.json").write_text(json.dumps(summary,indent=2)+"\n")
print("PAIRED_RESUME_SUMMARY "+json.dumps(summary),flush=True)
if completed!=12:raise SystemExit("Paired experiment incomplete")
