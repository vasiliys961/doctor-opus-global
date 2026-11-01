#!/usr/bin/env python3
"""Ten source-bound HTTP requests to the actual ORIGINAL warm NIH CPU worker.
Same upstream public X-ray repeated for throughput ONLY, not 10 clinical cases.
No cloud LLM, GPU or paid worker. Logs only timing and response validity.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import time
from urllib.request import Request, urlopen

EXPECTED_SHA = "31a5475c6b1383a7edbfcaf96af9ce302eb9969cfe28b6b8b5859afc6f274fdf"
HEADS = {"Pneumothorax", "Cardiomegaly", "Effusion", "Pneumonia", "Edema", "Mass"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--png", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    png = args.png.read_bytes()
    sha = hashlib.sha256(png).hexdigest()
    token = os.environ["XRV_WORKER_TOKEN"]
    if len(token) < 24:
        raise ValueError("Missing CPU-only worker token")
    payload = json.dumps({
        "schema": "opus-xrv-cpu-request/v1", "sourceImageSha256": sha,
        "imagePngBase64": base64.b64encode(png).decode("ascii"),
    }).encode()
    def one(index):
        start = time.monotonic()
        try:
            request = Request("http://127.0.0.1:8765/infer", data=payload,
                headers={"Content-Type": "application/json",
                         "Authorization": "Bearer " + token},
                method="POST")
            with urlopen(request, timeout=8) as response:
                result = json.load(response)
            valid = (
                result.get("schema") == "opus-original-xrv-cxr-six-head/v1"
                and result.get("model") == "densenet121-res224-nih"
                and result.get("originalWeightSha256") == EXPECTED_SHA
                and result.get("sourceImageSha256") == sha
                and set(result.get("scores", {})) == HEADS
                and all(isinstance(v,(int,float)) and math.isfinite(v)
                        and 0 <= v <= 1 for v in result["scores"].values())
            )
            return {"request": index, "valid": valid, "elapsedSeconds":
                    round(time.monotonic() - start, 3),
                    "cpuElapsedMs": result.get("cpuElapsedMs")}
        except Exception as exc:
            return {"request": index, "valid": False, "elapsedSeconds":
                    round(time.monotonic() - start, 3),
                    "errorType": type(exc).__name__}
    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(one, range(1, 11)))
    latencies = sorted(x["elapsedSeconds"] for x in results)
    p = lambda q: latencies[math.ceil(q * len(latencies)) - 1]
    summary = {
        "type": "original_nih_cpu_http_capacity_not_clinical_accuracy",
        "concurrentRequests": 10, "independentClinicalCases": 1,
        "successfulOriginalInference": sum(x["valid"] for x in results),
        "failed": sum(not x["valid"] for x in results),
        "p50Seconds": p(0.5), "p95Seconds": p(0.95),
        "wallSeconds": round(time.monotonic() - start, 3),
        "allWithin8SecondClientDeadline":
            all(x["valid"] and x["elapsedSeconds"] < 8 for x in results),
        "gpuCalls": 0, "llmCalls": 0, "llmUsd": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"summary": summary, "requests": results},
                                      indent=2))
    print("ORIGINAL_NIH_CPU_10_HTTP " + json.dumps(summary))
    if not summary["allWithin8SecondClientDeadline"]:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
