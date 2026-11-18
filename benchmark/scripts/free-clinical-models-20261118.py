#!/usr/bin/env python3
"""Public-only, single-model clinical smoke on ORIGINAL Doctor Opus MAST pilot items.

Important: This is NOT the Doctor Opus full-consilium pathway, an official
MAST submission, or clinical validation. No rubric or reference answer enters
any inference prompt. No patient data or API keys are persisted.
"""
import base64
import json
import os
import pathlib
import time
from urllib import request, error

OUT = pathlib.Path("benchmark/internal-results/free-clinical-models-20261118")
OUT.mkdir(parents=True, exist_ok=True)
SOURCE_SHA = "57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee"
CASES_URL = f"https://raw.githubusercontent.com/ARISENetwork/mast/{SOURCE_SHA}/benchmarks/donoharm/dataset/items.jsonl"
CASE_IDS = ("Card001", "Endo009", "GI002")
TEXT_MODELS = (
    ("ling-sante", "inclusionai/ling-3.0-flash-sante:free"),
    ("nemotron-ultra", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    ("ling-3-2", "inclusionai/ling-3.2-flash:free"),
)
IMAGE_MODELS = (
    ("nemotron-vl", "nvidia/nemotron-3.5-super-vl:free"),
    ("ling-vl", "inclusionai/ling-3.0-flash-vl:free"),
)
IMG_REV = "551b993d5dcaec27a1f1bbbcbca2ff4968a28e07"
IMG_ROOT = f"https://raw.githubusercontent.com/probml/chest_xray_kaggle/{IMG_REV}/test/"
IMAGES = (
    ("normal-0001", "NORMAL/IM-0001-0001.jpeg", "NORMAL"),
    ("opacity-0475", "PNEUMONIA/person100_bacteria_475.jpeg", "PNEUMONIA"),
)
API = "https://openrouter.ai/api/v1/chat/completions"
KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not KEY:
    raise SystemExit("OPENROUTER_API_KEY is not configured in GitHub Actions")

def download(url, limit=4000000):
    with request.urlopen(request.Request(url, headers={"User-Agent":"DoctorOpusPublicBenchmark/1.0"}), timeout=30) as r:
        data = r.read(limit + 1)
    if not data or len(data) > limit:
        raise RuntimeError("Public source missing or too large")
    return data

def openrouter_call(model, messages, max_tokens):
    payload = json.dumps({
        "model": model, "messages": messages,
        "max_tokens": max_tokens, "stream": False
    }).encode()
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
               "X-Title": "Doctor Opus public-only benchmark"}
    start = time.monotonic()
    problem = ""
    for attempt in range(2):
        try:
            req = request.Request(API, data=payload, headers=headers, method="POST")
            with request.urlopen(req, timeout=170) as response:
                body = json.loads(response.read(5_000_000))
            if body.get("error"):
                raise RuntimeError("Provider returned an error")
            m = (body.get("choices") or [{}])[0].get("message") or {}
            value = m.get("content") or ""
            if isinstance(value, list):
                value = "\n".join(p.get("text", "") for p in value if isinstance(p, dict))
            usage = body.get("usage") or {}
            cost = usage.get("cost")
            if cost is not None and float(cost) > 0.00001:
                raise RuntimeError("A :free model returned unexpected nonzero billing")
            return {"status": "ok" if len(str(value).strip()) >= 80 else "invalid",
                    "text": str(value).strip(), "usage": {
                        "prompt_tokens": usage.get("prompt_tokens"),
                        "completion_tokens": usage.get("completion_tokens"),
                        "cost": cost,
                    }, "latency_s": round(time.monotonic() - start, 3),
                    "finish_reason": (body.get("choices") or [{}])[0].get("finish_reason")}
        except error.HTTPError as exc:
            problem = "HTTP_" + str(exc.code)
            if exc.code in (429, 502, 503, 504) and attempt == 0:
                time.sleep(8)
                continue
            break
        except Exception as exc:
            problem = type(exc).__name__
            break
    return {"status": "error", "error": problem, "latency_s": round(time.monotonic()-start,3)}

clinical_prompt = (
    "You are a senior clinical physician responding to a professional clinical "
    "management question. Answer the exact question first. Address immediate "
    "safety, dangerous alternatives, investigations, medication contraindications, "
    "conditional versus immediate actions, monitoring and appropriate referral. "
    "Do not assume facts absent from the case. Write a specific medically reasoned "
    "answer in English, preferably 250–450 words. Do not invent citations."
)
image_prompt = (
    "You are reading one original pediatric chest radiograph for research evaluation. "
    "Describe only visible findings, technical limitations, likely interpretation, "
    "critical alternative findings, and clinically appropriate follow-up. "
    "State uncertainty. Do not infer history, image labels, or identify a patient."
)

def append(path, value):
    with path.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(value, ensure_ascii=False) + "\n")

rows = [json.loads(l) for l in download(CASES_URL, 8_000_000).decode().splitlines() if l.strip()]
by_id = {r["id"]: r for r in rows if r.get("metadata",{}).get("open") and r.get("metadata",{}).get("perturb_id") is None}
if len([r for r in rows if r.get("metadata",{}).get("open") and r.get("metadata",{}).get("perturb_id") is None]) != 30:
    raise SystemExit("Pinned MAST source did not return 30 open baseline cases")
if any(cid not in by_id for cid in CASE_IDS):
    raise SystemExit("Missing pinned original pilot cases")
manifest = {"dataset":"MAST First Do NOHARM open original subset",
            "source_commit":SOURCE_SHA, "case_ids":CASE_IDS,
            "vision_source":"probml/chest_xray_kaggle", "vision_commit":IMG_REV,
            "models":dict(TEXT_MODELS + IMAGE_MODELS),
            "method":"standalone LLM/VLM, NOT full Consilium, rubrics unseen",
            "public_only":True, "gpt62_not_enabled":True,
            "comparison":"Same original cases as prior Doctor Opus pilots; system architectures differ"}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")

ledger = OUT / "ledger.jsonl"
results = {"text":{}, "vision":{}}
for slug, model in TEXT_MODELS:
    file = OUT / f"noharm-{slug}.jsonl"
    for cid in CASE_IDS:
        case = by_id[cid]
        response = openrouter_call(model, [
            {"role":"system","content":clinical_prompt},
            {"role":"user","content":case["prompt"]}
        ], 1800)
        result = {"model":model,"id":cid,"trial":1, **response}
        append(ledger, {k:v for k,v in result.items() if k != "text"})
        if response.get("status") == "ok":
            append(file, {"id":cid,"trial":1,"response":response["text"],
                          "usage": response.get("usage",{})})
        print("FREE_CLINICAL_TEXT", json.dumps({k:v for k,v in result.items() if k != "text"}), flush=True)
    results["text"][slug] = {
        "model": model, "passed": sum(1 for ln in file.read_text().splitlines() if ln.strip()) if file.exists() else 0
    }

for slug, model in IMAGE_MODELS:
    file = OUT / f"xray-{slug}.jsonl"
    for cid, relpath, reference_label in IMAGES:
        try:
            pixels = download(IMG_ROOT + relpath)
            if pixels[:2] != b"\xff\xd8" or len(pixels)<20_000:
                raise RuntimeError("Unexpected source image")
            data_url = "data:image/jpeg;base64,"+base64.b64encode(pixels).decode()
            response = openrouter_call(model, [
                {"role":"system","content":image_prompt},
                {"role":"user","content":[
                    {"type":"text","text":"Independently interpret the image pixels. No reference diagnosis is provided."},
                    {"type":"image_url","image_url":{"url":data_url}}
                ]}
            ], 1300)
        except Exception as exc:
            response = {"status":"error","error":type(exc).__name__}
        result = {"model":model,"id":cid,"reference_label":reference_label,**response}
        append(ledger, {k:v for k,v in result.items() if k != "text"})
        if response.get("status") == "ok":
            append(file, {"model":model,"id":cid,"report":response["text"],
                          "reference_label":reference_label,"source":relpath,
                          "usage":response.get("usage",{})})
        print("FREE_CLINICAL_VISION",json.dumps({k:v for k,v in result.items() if k != "text"}),flush=True)
    results["vision"][slug] = {
        "model": model, "passed": sum(1 for ln in file.read_text().splitlines() if ln.strip()) if file.exists() else 0
    }
(OUT / "summary.json").write_text(json.dumps(results,indent=2)+"\n")
print("FREE_CLINICAL_SUMMARY",json.dumps(results),flush=True)
if all(r["passed"]==0 for r in list(results["text"].values())+list(results["vision"].values())):
    raise SystemExit("Every model request failed; inspect ledger and provider availability")
