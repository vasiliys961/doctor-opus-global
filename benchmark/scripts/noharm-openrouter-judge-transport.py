"""OpenRouter transport for original MAST NOHARM judge prompts, schemas and metrics.

IMPORTANT: This is NOT the official direct google-genai judge transport. The
model IDs and judge prompts match MAST, but routing/structured-output behavior
may differ; results are for INTERNAL SELF-EVALUATION only.
Drop-in replacement for MAST's judge/gemini_sdk.py inside an ephemeral CI clone.
"""
import json
import os
import time
from pathlib import Path
from threading import Lock

import requests

_COST_LOCK = Lock()
_TOTAL = 0.0
_COUNT = 0


def is_gemini(model_id):
    return model_id.startswith("gemini/")


def _format_schema(schema):
    # OpenRouter supports JSON Schema constrained output for Gemini.
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "mast_noharm_judge",
            "strict": True,
            "schema": schema,
        },
    }


def sync_call_raw(model_id, prompt, schema, *, thinking_level="LOW",
                  max_output_tokens=32768, temperature=0.0,
                  retry_on_rate_limit=True):
    global _TOTAL, _COUNT
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY required for OpenRouter judge transport")
    model = "google/" + model_id.split("/",1)[1]
    cap = float(os.environ.get("MAST_OPENROUTER_JUDGE_CAP_USD","2.0"))
    with _COST_LOCK:
        if _TOTAL >= cap * 0.9:
            raise RuntimeError("Judge spending reached 90% of configured cap")
    payload = {
        "model":model,
        "messages":[{"role":"user","content":prompt}],
        "temperature":temperature,
        "max_tokens":max_output_tokens,
        "response_format":_format_schema(schema),
        "reasoning":{"effort":str(thinking_level).lower()},
    }
    started=time.monotonic()
    data=None
    for attempt in range(3):
        try:
            result=requests.post("https://openrouter.ai/api/v1/chat/completions",
                 headers={"Authorization":"Bearer "+key,
                          "Content-Type":"application/json"},
                 json=payload,timeout=200)
            if result.status_code in (429,502,503,504) and retry_on_rate_limit and attempt<2:
                time.sleep(5*(attempt+1))
                continue
            if not result.ok:
                raise RuntimeError("OpenRouter judge failed HTTP "+
                    str(result.status_code)+" "+
                    result.text[:200].replace(key,"[REDACTED]"))
            data=result.json()
            break
        except requests.RequestException:
            if attempt==2:
                raise
            time.sleep(4*(attempt+1))
    if not isinstance(data,dict):
        raise RuntimeError("Judge returned no valid JSON response")
    raw=data.get("choices",[{}])[0].get("message",{}).get("content","")
    if isinstance(raw,list):
        raw="".join(str(p.get("text","")) for p in raw if isinstance(p,dict))
    usage=data.get("usage") or {}
    cost=usage.get("cost")
    if cost is None:
        raise RuntimeError("OpenRouter did not return actual usage.cost; cannot budget judge")
    try:
        usd=float(cost)
    except (ValueError,TypeError) as exc:
        raise RuntimeError("Invalid measured cost") from exc
    with _COST_LOCK:
        _TOTAL += usd
        _COUNT += 1
        record={"model":model,"costUsd":usd,"totalUsd":round(_TOTAL,6),"calls":_COUNT}
        ledger=Path(os.environ.get("MAST_JUDGE_LEDGER","openrouter-judge-cost.jsonl"))
        ledger.parent.mkdir(parents=True,exist_ok=True)
        with ledger.open("a") as file:
            file.write(json.dumps(record)+"\n")
        print("NOHARM_OPENROUTER_JUDGE_COST "+json.dumps(record),flush=True)
    return str(raw),time.monotonic()-started,{
        "prompt_tokens":usage.get("prompt_tokens") or 0,
        "completion_tokens":usage.get("completion_tokens") or 0,
        "thinking_tokens":usage.get("completion_tokens_details",{}).get("reasoning_tokens",0) or 0,
    }


def sync_call(model_id,prompt,schema,**kwargs):
    raw,runtime,usage=sync_call_raw(model_id,prompt,schema,**kwargs)
    return json.loads(raw),runtime,usage
