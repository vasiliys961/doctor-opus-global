#!/usr/bin/env python3
"""Recovery experiment: direct short-answer VQA Neon, public pinned dataset.
Previous long JSON report consumed $0.138075 (2/20 completed); NO identical
retries in that failed workflow. New design answers control question only.
Two independent 10-case shards; additional max budget $0.350; total <= $0.488075.
Not comparable to historical Argon 20 cases (manifest unavailable).
"""
import base64, hashlib, io, json, os, pathlib, re, time, urllib.error, urllib.request
import importlib.util
P=pathlib.Path("benchmark/scripts/neon-vqa-rad-20-20261120.py")
spec=importlib.util.spec_from_file_location("original_neon_source",P)
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
OUT=pathlib.Path("benchmark/internal-results/neon-vqa-rad-short-20261120")
OUT.mkdir(parents=True,exist_ok=True)
MODEL="google/gemini-4-neon"
SHARD=int(os.environ.get("NEON_SHORT_SHARD","0"))
CAP=0.175
MAX_OUT=1600
SYSTEM=("You are evaluating public teaching radiology images on VQA-RAD. "
"Look directly at the provided pixels. Answer the provided single English question "
"with ONLY the shortest factual English answer (one word or a short noun phrase). "
"Do not give a description, any explanation, justification, or a JSON object. "
"If the image does not support an answer, answer uncertain. "
"No invented findings, diagnosis, or details outside the image.")
def dump(file,obj):pathlib.Path(file).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n")
def main():
    key=os.getenv("OPENROUTER_API_KEY")
    if not key:raise SystemExit("API key unavailable, no paid requests")
    if SHARD not in (0,1):raise SystemExit("Invalid shard")
    data=source.fetch(source.URL)
    if hashlib.sha256(data).hexdigest()!=source.DATA_SHA:
        raise SystemExit("Pinned data SHA mismatch")
    import pyarrow.parquet as pq
    rows=pq.read_table(io.BytesIO(data)).to_pylist()
    if len(rows)!=451:raise SystemExit("Source row count changed")
    panel=source.panel(rows)
    catalogue=json.loads(source.fetch("https://openrouter.ai/api/v1/models"))
    model=next((z for z in catalogue.get("data",[]) if z.get("id")==MODEL),None)
    if not model or "image" not in (model.get("architecture") or {}).get("input_modalities",[]):
        raise SystemExit("Model inaccessible or non-image")
    p=model.get("pricing") or {}
    inp,out=float(p["prompt"]),float(p["completion"])
    if not (0<inp<=.000003001 and 0<out<=.000015001):
        raise SystemExit("Unexpected model price")
    dump(OUT/"protocol.json",{"model":MODEL,"newProtocol":"single concise answer, no JSON",
      "reasoning":"low","maxTokens":MAX_OUT,"shard":SHARD,
      "shardPaidCapUsd":CAP,"pricePerToken":{"input":inp,"output":out},
      "sourceSha":source.DATA_SHA,"sourceRevision":source.REV,
      "notMatchedToOldArgon":True,"historicalBadJsonUsageUsd":.138075})
    billed=0.;accounted=0.;n=0
    reserve=1800*inp+MAX_OUT*out
    for c in panel[SHARD*10:(SHARD+1)*10]:
        if accounted+reserve>CAP:
            print("SHORT_BUDGET_STOP",json.dumps({"shard":SHARD,"billed":billed,"reserve":reserve}),flush=True)
            break
        image=c["pixels"]
        payload={"model":MODEL,"temperature":0,"max_tokens":MAX_OUT,
         "reasoning":{"effort":"low"},
         "messages":[{"role":"system","content":SYSTEM},{"role":"user","content":[
           {"type":"text","text":c["question"]},
           {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+base64.b64encode(image).decode()}}
         ]}]}
        rec={k:v for k,v in c.items() if k!="pixels"}
        rec.update(status="in_flight",model=MODEL,shard=SHARD)
        dump(OUT/(c["id"]+".json"),rec)
        t=time.monotonic()
        try:
            req=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
              method="POST",data=json.dumps(payload).encode(),
              headers={"Authorization":"Bearer "+key,"Content-Type":"application/json",
                      "X-Title":"Doctor Opus short VQA-RAD Neon clinical research"})
            with urllib.request.urlopen(req,timeout=170) as response:
                raw=json.loads(response.read(8000000))
            usage=raw.get("usage") or {}
            cost=usage.get("cost")
            if cost is None:raise ValueError("Missing actual provider cost")
            cost=float(cost)
            if not (0<=cost<CAP):raise ValueError("Unexpected cost")
            billed+=cost;accounted+=cost
            choice=(raw.get("choices") or [{}])[0]
            text=(choice.get("message") or {}).get("content") or ""
            if isinstance(text,list):text=" ".join(x.get("text","") for x in text if isinstance(x,dict))
            text=str(text).strip()
            ok=(raw.get("model")==MODEL and choice.get("finish_reason")=="stop" and len(text)>0)
            rec.update(status="ok" if ok else "incomplete",answer=text,
                strictMatch=source.norm(text)==source.norm(c["reference"]),
                costUsd=cost,returnedModel=raw.get("model"),finishReason=choice.get("finish_reason"),
                usage=usage,responseId=raw.get("id"),
                durationSec=round(time.monotonic()-t,3))
            dump(OUT/(c["id"]+".json"),rec)
            n+=int(ok)
            print("NEON_SHORT_CASE",json.dumps({"id":c["id"],"status":rec["status"],
              "answer":text[:80],"correct":rec["strictMatch"],
              "spent":round(billed,8),"cost":cost}),flush=True)
            if not ok:break
        except Exception as e:
            accounted+=reserve
            rec.update(status="unknown_billing_or_failure",
               errorType=type(e).__name__,reservedUsd=reserve,
               elapsedSec=round(time.monotonic()-t,2))
            dump(OUT/(c["id"]+".json"),rec)
            print("NEON_SHORT_ERROR",json.dumps({"id":c["id"],
                  "errorType":type(e).__name__,"spent":billed}),flush=True)
            break
    dump(OUT/"summary.json",{"shard":SHARD,"completed":n,"planned":10,
            "billedUsd":billed,"accountedUsd":accounted,"capUsd":CAP})
    if n!=10:raise RuntimeError("Short-answer shard incomplete: see artifact")
    print("NEON_SHORT_SHARD_DONE",json.dumps({"shard":SHARD,"completed":n,
                                            "usd":round(billed,8)}),flush=True)
if __name__=="__main__":main()
