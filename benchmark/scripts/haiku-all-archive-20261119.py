#!/usr/bin/env python3
"""Haiku 5.5 replay on frozen public Doctor Opus/Mast clinical and image cases.
NO application changes, no real patients, no model-rubric leakage. $0.50 hard ceiling.
Two matched experimental arms and a separately labelled specialist probe.
"""
import ast
import base64
import hashlib
import json
import os
import pathlib
import re
import time
from urllib import request, error

API = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "anthropic/claude-haiku-5.5"
MAX_USD = 0.50
OUT = pathlib.Path("benchmark/internal-results/haiku-all-archive-20261119")
OUT.mkdir(parents=True, exist_ok=True)
KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not KEY:
    raise SystemExit("Missing OPENROUTER_API_KEY in GitHub Actions; no inference")
PAIR = ast.parse(pathlib.Path("benchmark/scripts/opus-nemotron-paired-20261119.py").read_text())
VISION = ast.parse(pathlib.Path("benchmark/scripts/nemotron-free-ecg-xray-self-eval-20261119.py").read_text())
def frozen(tree, name):
    for n in tree.body:
        if isinstance(n, ast.Assign) and any(isinstance(t,ast.Name) and t.id == name for t in n.targets):
            return ast.literal_eval(n.value)
    raise RuntimeError("Missing immutable prior variable: " + name)

CASES = frozen(PAIR, "CASES")
SOURCE_SHA = frozen(PAIR, "MAST_SHA")
SYSTEM = frozen(PAIR, "SYSTEM")
ECG_PROMPT = frozen(VISION, "ecg_prompt")
XRAY_PROMPT = frozen(VISION, "xray_prompt")
if len(CASES) != 12 or len(set(CASES)) != 12:
    raise SystemExit("Historical 12-case manifest changed")
def get(url):
    with request.urlopen(request.Request(url, headers={"User-Agent":"DoctorOpusHaikuFrozenArchive/1.0"}),timeout=60) as r:
        return r.read(12_000_000)
model_catalog = {x["id"]:x for x in json.loads(get("https://openrouter.ai/api/v1/models"))["data"]}
m = model_catalog.get(MODEL)
if not m:
    raise SystemExit("Required exact OpenRouter Haiku 5.5 ID not in current catalog")
price = m.get("pricing") or {}
rate_in = float(price["prompt"])
rate_out = float(price["completion"])
caps = (m.get("architecture") or {}).get("input_modalities") or []
# Per-token prices and conservative estimated input-token caps.
# Abort BEFORE calling if catalog cannot support the complete conservative spend model.
if not (0 < rate_in <= 0.00000015 and 0 < rate_out <= 0.00000075):
    raise SystemExit("Haiku current tariff outside approved conservative price envelope")
if "image" not in caps:
    raise SystemExit("Haiku 5.5 is not currently image-input capable; stop before any calls")
source = "https://raw.githubusercontent.com/ARISENetwork/mast/" + SOURCE_SHA + "/benchmarks/donoharm/dataset/items.jsonl"
items = [json.loads(x) for x in get(source).decode().splitlines() if x.strip()]
lookup = {c["id"]:c for c in items if c.get("metadata",{}).get("open") and c.get("metadata",{}).get("perturb_id") is None}
if len(lookup) != 30 or any(c not in lookup for c in CASES):
    raise SystemExit("Frozen public MAST version incompatible")
imgroot=pathlib.Path("benchmark/internal-results/nemotron-free-ecg-xray-20261119")
manifest=json.loads((imgroot/"manifest.json").read_text())
images=manifest["items"]
if len(images) != 20 or len({c["id"] for c in images}) != 20:
    raise SystemExit("Historical 20-image manifest incompatible")
for c in images:
    f=imgroot/"images"/c["file"]
    if hashlib.sha256(f.read_bytes()).hexdigest() != c["sha256"]:
        raise SystemExit("Historical image SHA-256 mismatch: " + c["id"])

# Persist all cases and parameters, without modifying prior tests.
(OUT/"protocol.json").write_text(json.dumps({
    "name":"Haiku 5.5 against all available frozen Doctor Opus public archives",
    "model_requested":MODEL,"source_ma st_sha".replace(" ",""):SOURCE_SHA,
    "text_case_ids":CASES,
    "image_case_ids":[x["id"] for x in images],
    "image_hashes":{x["id"]:x["sha256"] for x in images},
    "text_system":"IDENTICAL to paired Opus and standalone Nemotron",
    "image_system":"IDENTICAL to previous independent Nemotron VL 20-image evaluation",
    "arms":["standalone_12_matched","vision_20_matched","specialist_12_supplemental_unmatched"],
    "specialist_arm":"Uses same source case verbatim with specialty role; no matched prior specialist prompts",
    "spend_cap_usd":MAX_USD,"temperature":0,
    "reference_rubrics_not_shared_with_model":True,"real_patient_data":False,
    "pricing_per_token":{"input":rate_in,"output":rate_out}
},indent=2,ensure_ascii=False)+"\n")
spent=0.0
counts={}
stop=False

def append(obj):
    with (OUT/"responses.jsonl").open("a",encoding="utf-8") as f:
        f.write(json.dumps(obj,ensure_ascii=False)+"\n")

def infer(arm,cid,sys_prompt,question,max_tokens=3200,image=None,reference=None,sha=None):
    global spent,stop
    # Catalog rate * deliberately very large input-token allowance, e.g. 50k for each image.
    conservative_in=50000 if image is not None else 20000
    reserve=rate_in*conservative_in + rate_out*max_tokens
    if spent + reserve > MAX_USD + 1e-12:
        stop=True
        print("BUDGET_GUARD_STOP",json.dumps({"spent_usd":round(spent,7),"reserve_usd":round(reserve,7),"arm":arm,"case":cid}),flush=True)
        return
    if image is None:
        content=question
    else:
        content=[{"type":"text","text":question},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+base64.b64encode(image).decode("ascii")}}]
    payload={"model":MODEL,"messages":[{"role":"system","content":sys_prompt},{"role":"user","content":content}],
             "temperature":0,"reasoning":{"effort":"low"},"max_tokens":max_tokens,"stream":False}
    start=time.monotonic()
    rec={"arm":arm,"id":cid,"status":"error","model_requested":MODEL,"reference":reference,"sha256":sha}
    try:
        req=request.Request(API,data=json.dumps(payload).encode(),headers={
            "Authorization":"Bearer "+KEY,"Content-Type":"application/json",
            "X-Title":"Doctor Opus Haiku Historical Replay"},method="POST")
        with request.urlopen(req,timeout=185) as r: answer=json.loads(r.read(12_000_000))
        if answer.get("error"):
            raise RuntimeError("provider_reported_error")
        usage=answer.get("usage") or {}
        if usage.get("cost") is None:
            raise RuntimeError("provider_did_not_report_actual_cost")
        billed=float(usage["cost"])
        spent += billed
        if billed < 0 or billed > reserve + 1e-6 or spent > MAX_USD + 1e-9:
            stop=True
            raise RuntimeError("actual_cost_over_conservative_bound_stop")
        used_model=answer.get("model") or MODEL
        if used_model != MODEL:
            stop=True
            raise RuntimeError("provider_model_substitution_stop")
        choices=answer.get("choices") or [{}]
        msg=choices[0].get("message") or {}
        result=msg.get("content") or ""
        if isinstance(result,list):
            result="\n".join(x.get("text","") for x in result if isinstance(x,dict))
        rec.update({"status":"ok" if isinstance(result,str) and len(result.strip())>50 else "incomplete",
                    "answer":result.strip() if isinstance(result,str) else "",
                    "model_reported":used_model,"usd":billed,"usage":usage,
                    "finish_reason":choices[0].get("finish_reason")})
        if choices[0].get("finish_reason") not in ("stop",):
            rec["status"]="incomplete"
    except error.HTTPError as ex:
        rec["error"]="provider_http_"+str(ex.code)
        try:
            body=json.loads(ex.read(2048).decode("utf-8", errors="replace"))
            detail=body.get("error") or {}
            message=str(detail.get("message") or "")
            message=re.sub(r"sk-or-[A-Za-z0-9_-]+","[REDACTED]",message)
            rec["provider_error_detail"]=message[:250]
        except Exception:
            rec["provider_error_detail"]="not_parseable"
        # Access/permission/provider restrictions: stop immediately, never retry.
        if ex.code in (401,402,403,404):stop=True
    except Exception as ex:
        rec["error"]=type(ex).__name__ + ": " + str(ex)
        if "cost" in str(ex) or "substitution" in str(ex):stop=True
    rec["seconds"]=round(time.monotonic()-start,2)
    if arm=="vision_20_matched":
        p=(r"\bPRIMARY\s*:\s*(NORM|AFIB|CRBBB|CLBBB|1AVB|LVH|MI|OTHER|UNCERTAIN)\b"
           if cid.startswith("ecg") else r"\bCATEGORY\s*:\s*(NORMAL|OPACITY|UNCERTAIN)\b")
        matching=re.search(p,rec.get("answer",""),re.IGNORECASE)
        rec["prediction"]=matching.group(1).upper() if matching else None
        rec["label_match"]=rec["prediction"]==reference if rec["prediction"] else None
    append(rec)
    counts[arm]=counts.get(arm,0)+int(rec["status"]=="ok")
    print("HAIKU_CASE",json.dumps({"arm":arm,"id":cid,"status":rec["status"],
           "usd":round(rec.get("usd",0),7),"spent":round(spent,7),
           "label_match":rec.get("label_match")}),flush=True)
    time.sleep(1)

# Matched baseline: same 12 original MAST user prompts and system instruction as Opus/Nemotron.
for cid in CASES:
    if stop:break
    infer("standalone_12_matched",cid,SYSTEM,lookup[cid]["prompt"],3200)

# Matched vision: exact original JPEG bytes and exact old Nemotron system prompts.
for c in images:
    if stop:break
    sys_prompt=ECG_PROMPT if c["modality"]=="ecg" else XRAY_PROMPT
    infer("vision_20_matched",c["id"],sys_prompt,
          "Assess the attached public image independently, without external context.",
          2200,(imgroot/"images"/c["file"]).read_bytes(),c["reference"],c["sha256"])

# Additional architecture probe, clearly NOT directly matched to historical specialist runs.
roles={"Card001":"cardiology","Card002":"cardiology","Derm001":"dermatology",
       "Endo009":"endocrinology","GI002":"gastroenterology","All001":"allergy and immunology",
       "Heme002":"hematology","ID003":"infectious diseases","Nephro003":"nephrology",
       "Neuro003":"neurology","Pulm001":"pulmonology","GI004":"gastroenterology"}
for cid in CASES:
    if stop:break
    role=roles[cid]
    specialty_system=("You are the "+role+" consultant in a synthetic physician-facing "
      "Doctor Opus research exercise. Answer only within the provided case evidence; "
      "assess specialty-specific differential, immediate danger, diagnostics, therapies, "
      "interactions, uncertainty and when to consult other specialists. "
      "Do not fabricate missing values or use external patient data. "
      "Reply in English, clinically actionable but cautious.")
    infer("specialist_12_supplemental_unmatched",cid,specialty_system,lookup[cid]["prompt"],2800)

records=[json.loads(x) for x in (OUT/"responses.jsonl").read_text().splitlines() if x.strip()] if (OUT/"responses.jsonl").exists() else []
summary={"model":MODEL,"total_billed_usd":round(spent,7),"max_budget_usd":MAX_USD,
         "planned":{"standalone_12_matched":12,"vision_20_matched":20,"specialist_12_supplemental_unmatched":12},
         "calls_attempted":len(records),"successful":sum(x["status"]=="ok" for x in records),
         "by_arm":{a:{"attempted":sum(x["arm"]==a for x in records),
                  "successful":sum(x["arm"]==a and x["status"]=="ok" for x in records)}
                   for a in ["standalone_12_matched","vision_20_matched","specialist_12_supplemental_unmatched"]},
         "vision_label_matches":{a:{"total":len([x for x in records if x["arm"]=="vision_20_matched" and x["id"].startswith(a)]),
                 "matches":sum(x.get("label_match") is True for x in records if x["arm"]=="vision_20_matched" and x["id"].startswith(a))}
                 for a in ["ecg","xray"]},
         "stop_guard":stop,
         "warning":"Label matches are not diagnostic accuracy. Specialist arm has no matched historical model role; no clinical validation."}
(OUT/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print("HAIKU_SUMMARY",json.dumps(summary,ensure_ascii=False),flush=True)
if not any(x["status"]=="ok" for x in records):
    raise SystemExit("No valid Haiku answers. Not score 0 clinical quality.")
