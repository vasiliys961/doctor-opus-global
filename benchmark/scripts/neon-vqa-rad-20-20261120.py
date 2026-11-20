#!/usr/bin/env python3
"""Public VQA-RAD standalone Neon test. New fixed 20 images (NOT matched Argon).
Four independent shards, each hard planned limit of USD 0.125, no retries.
"""
import base64, hashlib, io, json, os, pathlib, re, time, urllib.request
import pyarrow.parquet as pq
from PIL import Image
MODEL="google/gemini-4-neon"
REV="bcf91e7654fb9d51c8ab6a5b82cacf3fafd2fae9"
URL="https://huggingface.co/datasets/flaviagiammarino/vqa-rad/resolve/"+REV+"/data/test-00000-of-00001-e5bc3d208bb4deeb.parquet"
DATA_SHA="eb520bdab1116dd4f420120da19049d2315389fa126d031f65ec42e153264ea7"
SYSTEM=('You are comparing image interpretation on public radiology teaching images. '
'Use only the supplied pixels. Do not assume a full study, clinical history or findings outside the frame. '
'Give a concise factual description in Russian (80–150 words), separating visible findings from uncertainty. '
'Answer the supplied English control question with a short English answer; '
'for yes/no questions use exactly yes, no, or uncertain. Do not guess invisible findings. '
'Return only a JSON object: {"description_ru":"...","answer":"...",'
'"confidence":"high|medium|low","limitations_ru":"..."}. No markdown fences.')
OUT=pathlib.Path("benchmark/internal-results/neon-vqa-rad-20261120")
OUT.mkdir(parents=True,exist_ok=True)
SHARD=int(os.environ.get("NEON_SHARD","0"))
CAP=0.125
MAX_OUTPUT=1300
def save(p,x):
    pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n")
def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"DoctorOpusPublicResearch/1.0"})
    with urllib.request.urlopen(req,timeout=100) as r:return r.read(60_000_000)
def pixels(row):
    obj=row["image"]
    raw=obj.get("bytes") if isinstance(obj,dict) else obj
    if not isinstance(raw,bytes):raise RuntimeError("Source image bytes missing")
    with Image.open(io.BytesIO(raw)) as im: im.verify()
    if raw.startswith(bytes.fromhex("ffd8ff")):return raw
    with Image.open(io.BytesIO(raw)) as im:
        b=io.BytesIO();im.convert("RGB").save(b,format="JPEG",quality=95)
    return b.getvalue()
def panel(rows):
    pools=[[],[]];seen=set()
    for i,r in enumerate(rows):
        q=str(r.get("question") or "").strip()
        a=str(r.get("answer") or "").strip()
        if not q or not a:continue
        img=pixels(r)
        sha=hashlib.sha256(img).hexdigest()
        if sha in seen:continue
        k=0 if a.lower() in ("yes","no") else 1
        if len(pools[k])>=10:continue
        seen.add(sha)
        pools[k].append(dict(rowIndex=i,question=q,reference=a,imageSha256=sha,pixels=img))
        if len(pools[0])==len(pools[1])==10:break
    if len(pools[0])!=10 or len(pools[1])!=10:raise RuntimeError("Panel incomplete")
    result=[]
    for i in range(10):result.extend([pools[0][i],pools[1][i]])
    for i,c in enumerate(result):c["id"]="vqa-neon-%02d"%(i+1)
    return result
def norm(x):
    return re.sub(r"\s+"," ",re.sub(r"""[“”"'.,:;!?]""","",str(x or "").lower())).strip()
def main():
    if SHARD not in range(4):raise RuntimeError("Unexpected shard")
    key=os.environ.get("OPENROUTER_API_KEY")
    if not key:raise RuntimeError("Secret unavailable, no paid calls")
    blob=fetch(URL)
    if hashlib.sha256(blob).hexdigest()!=DATA_SHA:raise RuntimeError("Source checksum mismatch")
    rows=pq.read_table(io.BytesIO(blob)).to_pylist()
    if len(rows)!=451:raise RuntimeError("Source changed")
    cases=panel(rows)
    save(OUT/"manifest.json",{"dataset":"VQA-RAD public test","revision":REV,
      "parquet_sha256":DATA_SHA,"selection":"First 10 unique-image yes/no and first 10 unique-image open answers, interleaved",
      "historical_argon_matched":False,"reason":"Original 2026-11-12 manifest was local-only and cannot be recovered from GitHub",
      "cases":[{k:v for k,v in c.items() if k!="pixels"} for c in cases]})
    catalogue=json.loads(fetch("https://openrouter.ai/api/v1/models"))
    model=next((m for m in catalogue.get("data",[]) if m.get("id")==MODEL),None)
    if model is None or "image" not in ((model.get("architecture") or {}).get("input_modalities") or []):
        raise RuntimeError("Exact model unavailable for image input")
    pin=float(model["pricing"]["prompt"]);pout=float(model["pricing"]["completion"])
    if not (0<pin<=0.000003001 and 0<pout<=0.000015001):
        raise RuntimeError("Model token price exceeds approved $3/$15 per million")
    reserve=9000*pin+MAX_OUTPUT*pout
    save(OUT/"protocol.json",{"model":MODEL,"shard":SHARD,"capUsd":CAP,
      "maxTokens":MAX_OUTPUT,"temperature":0,"reasoningEffort":"low",
      "pricePerToken":{"input":pin,"output":pout},"systemPrompt":SYSTEM,
      "unpaired_with_2026_11_12_argon":True,"no_retries":True})
    billed=0.;accounted=0.;completed=0
    for c in cases[SHARD*5:(SHARD+1)*5]:
        if accounted+reserve>CAP:
            print("BUDGET_STOP",json.dumps({"shard":SHARD,"billed":billed,"reserved":reserve}),flush=True)
            break
        image=c["pixels"]
        if len(image)>5000000:raise RuntimeError("Image too large")
        payload={"model":MODEL,"temperature":0,"max_tokens":MAX_OUTPUT,
         "reasoning":{"effort":"low"},"response_format":{"type":"json_object"},
         "messages":[{"role":"system","content":SYSTEM},
          {"role":"user","content":[{"type":"text","text":"Опишите представленное изображение. Затем ответьте на контрольный вопрос: "+c["question"]},
             {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+base64.b64encode(image).decode()}}]}]}
        rec={k:v for k,v in c.items() if k!="pixels"}
        rec.update(model=MODEL,shard=SHARD,status="in_flight")
        save(OUT/(c["id"]+".json"),rec)
        t=time.monotonic()
        try:
            req=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
              data=json.dumps(payload,ensure_ascii=False).encode(),method="POST",
              headers={"Authorization":"Bearer "+key,"Content-Type":"application/json",
               "X-Title":"Doctor Opus public VQA-RAD Neon experiment"})
            with urllib.request.urlopen(req,timeout=180) as http:
                raw=json.loads(http.read(6000000))
            usage=raw.get("usage") or {}
            charged=usage.get("cost")
            if charged is None:raise RuntimeError("Unknown provider billed usage")
            charged=float(charged)
            if charged<0 or charged>CAP:raise RuntimeError("Invalid reported charge")
            billed+=charged;accounted+=charged
            choice=(raw.get("choices") or [{}])[0]
            content=(choice.get("message") or {}).get("content") or ""
            if isinstance(content,list):content=" ".join(z.get("text","") for z in content if isinstance(z,dict))
            cleaned=str(content).strip()
            if cleaned.startswith(chr(96)*3):
                cleaned=cleaned.split("\n",1)[-1].rsplit(chr(96)*3,1)[0].strip()
            parsed=json.loads(cleaned)
            ok=(raw.get("model")==MODEL and choice.get("finish_reason")=="stop"
              and isinstance(parsed.get("answer"),str) and bool(parsed["answer"].strip())
              and isinstance(parsed.get("description_ru"),str))
            rec.update(status="ok" if ok else "failed",returnedModel=raw.get("model"),
              finishReason=choice.get("finish_reason"),answer=parsed.get("answer"),
              description_ru=parsed.get("description_ru"),limitations_ru=parsed.get("limitations_ru"),
              confidence=parsed.get("confidence"),strictMatch=norm(parsed.get("answer"))==norm(c["reference"]),
              costUsd=charged,usage=usage,responseId=raw.get("id"),elapsedSec=round(time.monotonic()-t,2))
            save(OUT/(c["id"]+".json"),rec)
            completed+=int(ok)
            print("NEON_CASE",json.dumps({"id":c["id"],"status":rec["status"],
                "match":rec["strictMatch"],"usd":charged,"totalShardUsd":round(billed,7)}),flush=True)
            if not ok:break
        except Exception as error:
            # An API timeout is an uncertain charge; do not repeat that request.
            accounted+=reserve
            rec.update(status="error_or_uncertain_charge",errorType=type(error).__name__,
                       costUnknown=True,chargeReserveUsd=reserve,elapsedSec=round(time.monotonic()-t,2))
            save(OUT/(c["id"]+".json"),rec)
            print("NEON_ERROR",json.dumps({"id":c["id"],"type":type(error).__name__,
                "chargeConfirmedUsd":round(billed,8)}),flush=True)
            break
    save(OUT/"shard-summary.json",{"shard":SHARD,"completed":completed,"billedUsd":billed,
           "accountedUsd":accounted,"shardCapUsd":CAP,"casesExpected":5})
    if completed!=5:raise RuntimeError("Incomplete shard — retain artifacts for review")
    print("NEON_SHARD_DONE",json.dumps({"shard":SHARD,"completed":5,
          "billedUsd":round(billed,7)}),flush=True)
if __name__=="__main__":main()
