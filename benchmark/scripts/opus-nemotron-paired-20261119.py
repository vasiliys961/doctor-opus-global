#!/usr/bin/env python3
"""Paired original MAST open-item comparison: identical Opus vs Opus + independently
generated Nemotron audit. Research only; not the running Doctor Opus consilium.
Cases/prompt/roles/limits frozen before inference. Never send rubrics to models.
"""
import json
import os
import pathlib
import time
from urllib import request, error

OUT = pathlib.Path("benchmark/internal-results/opus-nemotron-paired-20261119")
OUT.mkdir(parents=True, exist_ok=True)
API = "https://openrouter.ai/api/v1/chat/completions"
ROOT = "https://raw.githubusercontent.com/ARISENetwork/mast/"
MAST_SHA = "57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee"
MAST_CASES = ROOT + MAST_SHA + "/benchmarks/donoharm/dataset/items.jsonl"
OPUS = "anthropic/claude-opus-5.5"
AUDITOR = "nvidia/nemotron-3-ultra-550b-a55b:free"
CASES = ("Card001", "Card002", "Derm001", "Endo009", "GI002",
         "All001", "Heme002", "ID003", "Nephro003", "Neuro003",
         "Pulm001", "GI004")
BUDGET_USD = 2.50
KEY = os.getenv("OPENROUTER_API_KEY", "")
if not KEY:
    raise SystemExit("OPENROUTER_API_KEY missing from Actions secrets")
HEADERS = {"Authorization": "Bearer " + KEY, "Content-Type": "application/json",
           "X-Title": "Doctor Opus paired public clinical research"}

SYSTEM = (
    "You are an attending internal-medicine physician providing an actionable professional "
    "answer to the EXACT clinical question. Start with the critical management decision. "
    "Distinguish emergency actions now from conditional future actions. State leading working "
    "diagnosis, major differentials, decisive tests, specific management and monitoring. "
    "Explicitly check contraindications, anticoagulation, serious drug reactions, renal or "
    "organ-function constraints, drug interactions and timely referral only when relevant. "
    "Do not invent missing patient facts, prescriptions, measurements or sources. Do not turn "
    "hypotheses into certainty. Address the high-consequence alternatives before nonessential "
    "discussion. State what should NOT be done when appropriate. Respond in English with a "
    "concise but clinically complete 300-450 word assessment. Never let an unverified external "
    "suggestion override the original case; evaluate evidence independently."
)
AUDITOR_SYSTEM = (
    "You are an INDEPENDENT clinical diagnostic auditor. Read the original case only, "
    "without other doctors' answers. Your task is to identify at most FOUR potential "
    "high-consequence diagnostic omissions, contradictions, missing decisive data, or "
    "hazardous management actions. For each, specify the exact fact in the original case "
    "that supports the concern, and distinguish observed fact from hypothesis. "
    "If nothing important is missing or uncertain, say so. Avoid generic advice, "
    "invented contraindications, unsupported literature citations, and speculation. "
    "Be concise, under 300 words. You are NOT the final decision-maker."
)
AUDIT_PREFIX = (
    "\n\n[INDEPENDENT AUDITOR NOTE — UNVERIFIED, NOT PATIENT FACTS]\n"
    "A separate model suggested the following potential issues. Each may be wrong. "
    "Check these ideas independently against the original case. Ignore any unsupported "
    "claim; do not add it to diagnosis, medication or testing plan unless justified. "
    "Do not copy the auditor's language merely because it is present.\n"
)
AUDIT_SUFFIX = "\n[/INDEPENDENT AUDITOR NOTE]\n"

def log(obj):
    print("PAIRED_BENCHMARK " + json.dumps(obj, ensure_ascii=False), flush=True)

def get(url):
    with request.urlopen(request.Request(url, headers={"User-Agent":"DoctorOpusOpenMAST/1.0"}),
                         timeout=35) as res:
        return res.read(8_000_000)

def append(file, rec):
    with (OUT / file).open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")

spending = 0.0
catalogue = json.loads(get("https://openrouter.ai/api/v1/models"))["data"]
model_info = {v["id"]: v for v in catalogue}
def rates(mid):
    p = model_info[mid]["pricing"]
    return float(p["prompt"])*1_000_000, float(p["completion"])*1_000_000
if AUDITOR not in model_info or OPUS not in model_info:
    raise SystemExit("Pinned model missing from OpenRouter models catalog")
audit_rates = rates(AUDITOR)
opus_rates = rates(OPUS)
if any(v != 0 for v in audit_rates):
    raise SystemExit("Auditor is no longer a 0-USD model")
if opus_rates[0] > 4.01 or opus_rates[1] > 20.01:
    raise SystemExit("Opus price exceeds frozen budget assumptions")
rows = [json.loads(s) for s in get(MAST_CASES).decode().splitlines() if s.strip()]
open_rows = {r["id"]:r for r in rows if r.get("metadata",{}).get("open") and r.get("metadata",{}).get("perturb_id") is None}
if len(open_rows) != 30 or any(cid not in open_rows for cid in CASES):
    raise SystemExit("Pinned MAST original open cases changed")
(OUT / "protocol.json").write_text(json.dumps({
    "dataset":"First Do NOHARM original open 30", "source_sha":MAST_SHA,
    "case_ids":CASES, "known_prior_cases":CASES[:5],
    "previously_unseen_by_this_experiment":CASES[5:],
    "auditor":AUDITOR, "synthesizer":OPUS, "system":SYSTEM,
    "auditor_system":AUDITOR_SYSTEM, "scope":"standalone Opus A/B; NOT full Consilium",
    "auditor_access":"original source only; no model answer/rubric",
    "order":"AB on even-index cases, BA on odd-index cases",
    "comparison":"same original question, same model/system/temperature",
    "temperature":0, "opus_max_tokens":2300, "audit_max_tokens":2000,
    "spend_guard_usd":BUDGET_USD,
    "rubrics_excluded_from_inference":True
},ensure_ascii=False,indent=2)+"\n")

def call(model, system, question, max_tokens):
    global spending
    # Conservatively reserve all output tokens and one token per UTF-8 input byte.
    estimated_input_tokens = len((system+question).encode("utf-8"))+1500
    pr, cr = rates(model)
    reservation = estimated_input_tokens*pr/1e6 + max_tokens*cr/1e6
    if spending + reservation > BUDGET_USD:
        raise RuntimeError("generation_budget_stop")
    started = time.monotonic()
    payload = {"model":model, "messages":[
        {"role":"system","content":system},
        {"role":"user","content":question}
    ], "max_tokens":max_tokens, "temperature":0,
       "reasoning":{"effort":"low"}, "stream":False}
    req = request.Request(API, data=json.dumps(payload).encode(), headers=HEADERS,
                          method="POST")
    try:
        with request.urlopen(req,timeout=185) as res:
            data=json.loads(res.read(8_000_000))
    except error.HTTPError as exc:
        raise RuntimeError("provider_http_"+str(exc.code)) from None
    usage = data.get("usage") or {}
    cost = usage.get("cost")
    if cost is None:
        raise RuntimeError("provider_missing_actual_billing")
    cost = float(cost)
    spending += cost
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    answer = msg.get("content") or ""
    if isinstance(answer,list):
        answer = "\n".join(e.get("text","") for e in answer if isinstance(e,dict))
    if not isinstance(answer,str) or len(answer.strip()) < 200:
        raise RuntimeError("provider_blank_or_short_reply")
    if choice.get("finish_reason") != "stop":
        raise RuntimeError("provider_incomplete_"+str(choice.get("finish_reason")))
    if data.get("model") and data["model"]!=model:
        raise RuntimeError("provider_model_substitution")
    return {"response":answer.strip(),"model":model,"usd":round(cost,6),
            "time_s":round(time.monotonic()-started,2),
            "prompt_tokens":usage.get("prompt_tokens"),
            "completion_tokens":usage.get("completion_tokens"),
            "finish_reason":choice.get("finish_reason")}

completed = 0
for i,cid in enumerate(CASES):
    item = open_rows[cid]
    question=item["prompt"]
    record={"id":cid,"index":i,"known_prior":i<5,"status":"started"}
    append("case-ledger.jsonl",record)
    try:
        audit=call(AUDITOR,AUDITOR_SYSTEM,question,2000)
        append("nemotron-audit.jsonl",{"id":cid,**audit})
        order=("A","B") if i%2==0 else ("B","A")
        answers={}
        for arm in order:
            augmented = question if arm=="A" else question+AUDIT_PREFIX+audit["response"]+AUDIT_SUFFIX
            result=call(OPUS,SYSTEM,augmented,2300)
            answers[arm]=result
            append("opus-alone.jsonl" if arm=="A" else "opus-plus-nemotron.jsonl",
                   {"id":cid,"trial":1,"response":result["response"],
                    "usage":{"cost":result["usd"],
                             "prompt_tokens":result["prompt_tokens"],
                             "completion_tokens":result["completion_tokens"]}})
            log({"case":cid,"arm":arm,"costUsd":result["usd"],
                 "seconds":result["time_s"],"response_length":len(result["response"])})
        completed+=1
        log({"case":cid,"status":"paired","auditor_usd":audit["usd"],
             "total_billed_usd":round(spending,6)})
    except Exception as exc:
        reason=str(exc)
        if "Bearer" in reason or KEY in reason:reason="redacted_provider_failure"
        append("case-ledger.jsonl",{"id":cid,"status":"failed_or_budget_stop",
              "error":reason,"billed_usd":round(spending,6)})
        log({"case":cid,"status":"stopped","reason":reason,
             "completed_pairs":completed,"billed_usd":round(spending,6)})
        break
summary={"planned":len(CASES),"paired":completed,"billed_usd":round(spending,6),
         "budget_usd":BUDGET_USD,
         "complete":completed==len(CASES),
         "scoring":"original MAST two-stage rubric in separate action; no score yet"}
(OUT/"summary.json").write_text(json.dumps(summary,indent=2)+"\n")
log({"summary":summary})
if completed<10:raise SystemExit("Fewer than 10 paired cases; do not treat partial as complete")
