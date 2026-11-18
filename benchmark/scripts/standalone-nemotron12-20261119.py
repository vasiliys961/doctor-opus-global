#!/usr/bin/env python3
"""Standalone FREE Nemotron on exactly the same public 12 MAST cases and exact
SYSTEM prompt as the paired Opus 2026-11-19 benchmark.
No clinical scores are claimed without the separate MAST judge job.
"""
import ast
import json
import os
import pathlib
import time
from urllib import request, error

HERE=pathlib.Path("benchmark/scripts")
PAIR=HERE/"opus-nemotron-paired-20261119.py"
SRC=ast.parse(PAIR.read_text())
def frozen_literal(var):
    for node in SRC.body:
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id==var for t in node.targets):
            return ast.literal_eval(node.value)
    raise RuntimeError("Cannot load frozen experiment setting: "+var)
CASES=frozen_literal("CASES")
SYSTEM=frozen_literal("SYSTEM")
AUDITOR=frozen_literal("AUDITOR")
MAST_SHA=frozen_literal("MAST_SHA")
MAST_CASES="https://raw.githubusercontent.com/ARISENetwork/mast/"+MAST_SHA+"/benchmarks/donoharm/dataset/items.jsonl"
OUT=pathlib.Path("benchmark/internal-results/standalone-nemotron12-20261119")
OUT.mkdir(parents=True,exist_ok=True)
KEY=os.environ.get("OPENROUTER_API_KEY","")
if not KEY:raise SystemExit("GitHub secret OPENROUTER_API_KEY unavailable")
def public_get(url):
    with request.urlopen(request.Request(url,headers={"User-Agent":"DoctorOpusMASTComparison/1.0"}),timeout=35) as r:
        return r.read(9000000)
catalog={m["id"]:m for m in json.loads(public_get("https://openrouter.ai/api/v1/models"))["data"]}
info=catalog.get(AUDITOR)
if not info:raise SystemExit("Pinned free Nemotron no longer exists")
try:
    free=float(info["pricing"]["prompt"])==float(info["pricing"]["completion"])==0
except (ValueError,TypeError,KeyError):free=False
if not free:raise SystemExit("Stopped before calls: Nemotron no longer free")
rows=[json.loads(l) for l in public_get(MAST_CASES).decode().splitlines() if l.strip()]
data={row["id"]:row for row in rows if row.get("metadata",{}).get("open") and row.get("metadata",{}).get("perturb_id") is None}
if len(data)!=30 or any(cid not in data for cid in CASES):raise SystemExit("Pinned MAST dataset incompatible")
(OUT/"protocol.json").write_text(json.dumps({"comparison":"same frozen original questions, system prompt, temperature=0 and 12 cases as Opus A/B 2026-11-19",
    "model":AUDITOR,"cases":CASES,"source_sha":MAST_SHA,
    "temperature":0,"max_tokens":3200,"reasoning_effort":"low",
    "original_rubrics_not_sent_to_model":True,
    "non_patient_data":True,
    "cost":"0 tokens paid for :free, judge is separate and paid",
    "not_full_consilium":True},ensure_ascii=False,indent=2)+"\n")

records=[]
for cid in CASES:
    started=time.monotonic()
    rec={"id":cid,"trial":1,"model":AUDITOR,"status":"started"}
    try:
        payload=json.dumps({"model":AUDITOR,"messages":[{"role":"system","content":SYSTEM},
            {"role":"user","content":data[cid]["prompt"]}],
            "max_tokens":3200,"temperature":0,"reasoning":{"effort":"low"},"stream":False}).encode()
        req=request.Request("https://openrouter.ai/api/v1/chat/completions",
              data=payload,method="POST",headers={"Authorization":"Bearer "+KEY,
                "Content-Type":"application/json","X-Title":"Doctor Opus Standalone Nemotron MAST 12"})
        with request.urlopen(req,timeout=190) as res: raw=json.loads(res.read(9000000))
        choice=(raw.get("choices") or [{}])[0]
        content=(choice.get("message") or {}).get("content") or ""
        if isinstance(content,list):content="\n".join(s.get("text","") for s in content if isinstance(s,dict))
        usage=raw.get("usage") or {}
        cost=usage.get("cost")
        if cost is None or float(cost)!=0:raise RuntimeError("Unexpected missing/nonzero cost")
        if raw.get("model") and raw["model"]!=AUDITOR:raise RuntimeError("Model substitution")
        if not isinstance(content,str) or len(content.strip())<180:raise RuntimeError("Blank or short model answer")
        rec.update({"status":"ok" if choice.get("finish_reason")=="stop" else "truncated",
            "response":content.strip(),"finish_reason":choice.get("finish_reason"),
            "usage":{"cost":0,"prompt_tokens":usage.get("prompt_tokens"),"completion_tokens":usage.get("completion_tokens")}})
    except error.HTTPError as e:rec.update({"status":"error","error":"HTTP_"+str(e.code)})
    except Exception as e:rec.update({"status":"error","error":type(e).__name__})
    rec["duration_s"]=round(time.monotonic()-started,2)
    records.append(rec)
    with (OUT/"ledger.jsonl").open("a") as fp:
        fp.write(json.dumps({k:v for k,v in rec.items() if k!="response"},ensure_ascii=False)+"\n")
    if rec["status"]=="ok":
        with (OUT/"nemotron-standalone12.jsonl").open("a") as fp:
            fp.write(json.dumps({k:rec[k] for k in ("id","trial","response","usage")},ensure_ascii=False)+"\n")
    print("STANDALONE_NEMOTRON "+json.dumps({k:v for k,v in rec.items() if k!="response"},ensure_ascii=False),flush=True)
    time.sleep(2)
summary={"planned":len(CASES),"complete":sum(r["status"]=="ok" for r in records),
    "truncated":sum(r["status"]=="truncated" for r in records),
    "errored":sum(r["status"]=="error" for r in records),
    "inference_cost_usd":0,
    "not_yet_scored":True}
(OUT/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print("STANDALONE_SUMMARY "+json.dumps(summary),flush=True)
if summary["complete"]<10:raise SystemExit("Insufficient complete answers for clinical score")
