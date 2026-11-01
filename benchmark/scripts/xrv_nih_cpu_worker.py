#!/usr/bin/env python3
"""Single-process, CPU-only *original* NIH XRV CXR worker (contest research).
No GPU, no weight downloads, no PHI logging. Only an operator-provisioned,
SHA256 verified model file is used. Separate subprocess is killed on timeout.
Expose behind an HTTPS reverse proxy; never publish this HTTP server directly.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
from io import BytesIO
import json
import multiprocessing as mp
import os
from pathlib import Path
import sys
import time

WEIGHT_NAME = "nih-densenet121-d121-tw-lr001-rot45-tr15-sc15-seed0-best.pt"
WEIGHT_SHA256 = "31a5475c6b1383a7edbfcaf96af9ce302eb9969cfe28b6b8b5859afc6f274fdf"
HEADS = ("Pneumothorax", "Cardiomegaly", "Effusion", "Pneumonia", "Edema", "Mass")
MAX_BODY = 15_000_000
CHILD_TIMEOUT_SECONDS = 6.5
MODEL = None
XRV = None
TORCH = None

def load_model(weights_file: Path) -> None:
    global MODEL, XRV, TORCH
    if weights_file.name != WEIGHT_NAME or not weights_file.is_file():
        raise RuntimeError("Provision original NIH weights under the canonical basename")
    digest = hashlib.sha256(weights_file.read_bytes()).hexdigest()
    if not hmac.compare_digest(digest, WEIGHT_SHA256):
        raise RuntimeError("Original NIH model weight digest mismatch")
    # Import libraries ONLY after the integrity and presence check. Cache is
    # pre-provisioned, therefore TorchXRayVision will never download weights.
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    os.environ["OMP_NUM_THREADS"] = "1"
    import torch
    import torchxrayvision as xrv
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    TORCH, XRV = torch, xrv
    MODEL = xrv.models.DenseNet(
        weights="densenet121-res224-nih",
        cache_dir=str(weights_file.parent),
        apply_sigmoid=True,
    )
    MODEL.eval()

def infer_png(png: bytes) -> dict:
    from PIL import Image
    import numpy as np
    import torchvision.transforms as transforms
    if not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) > 12_000_000:
        raise ValueError("Source must be an original PNG")
    Image.MAX_IMAGE_PIXELS = 16_000_000
    with Image.open(BytesIO(png)) as img:
        if img.format != "PNG":
            raise ValueError("Original PNG required")
        img.load()
        grey = np.asarray(img.convert("L"), dtype=np.float32)
    normalized = XRV.datasets.normalize(grey, 255)[None, ...]
    preprocess = transforms.Compose([
        XRV.datasets.XRayCenterCrop(),
        XRV.datasets.XRayResizer(224),
    ])
    matrix = TORCH.from_numpy(preprocess(normalized)).unsqueeze(0)
    with TORCH.no_grad():
        predictions = MODEL(matrix).detach().cpu().numpy().reshape(-1)
    if len(predictions) != len(MODEL.pathologies):
        raise ValueError("Original model output shape mismatch")
    scores = {}
    for name in HEADS:
        index = MODEL.pathologies.index(name)
        value = float(predictions[index])
        if not 0.0 <= value <= 1.0:
            raise ValueError("Unbounded original model score")
        scores[name] = value
    return {
        "schema": "opus-original-xrv-cxr-six-head/v1",
        "model": "densenet121-res224-nih",
        "originalWeightSha256": WEIGHT_SHA256,
        "sourceImageSha256": hashlib.sha256(png).hexdigest(),
        "scores": scores,
    }

def child_infer(png: bytes, pipe) -> None:
    try:
        pipe.send(("ok", infer_png(png)))
    except Exception:
        pipe.send(("error", None))
    finally:
        pipe.close()

def guarded_infer(png: bytes) -> dict:
    """A hard process deadline prevents runaway CPU inference."""
    context = mp.get_context("fork")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=child_infer, args=(png, sender))
    process.start()
    sender.close()
    try:
        if receiver.poll(CHILD_TIMEOUT_SECONDS):
            status, result = receiver.recv()
            if status == "ok":
                return result
            raise ValueError("CPU inference failed")
        raise TimeoutError("Original CPU detector exceeded its own deadline")
    finally:
        if process.is_alive():
            process.kill()
        process.join(timeout=1)
        receiver.close()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        # Never log source identifiers, bearer tokens or image contents.
        return

    def reply(self, status: int, data: dict) -> None:
        payload = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self) -> bool:
        expected = os.environ.get("XRV_WORKER_TOKEN", "")
        supplied = self.headers.get("Authorization", "")
        return (len(expected) >= 24
                and hmac.compare_digest(supplied, "Bearer " + expected))

    def do_GET(self):
        if self.path != "/healthz" or not self.authorized():
            self.reply(404, {"error": "Not available"})
            return
        self.reply(200, {"ready": MODEL is not None, "device": "cpu",
                         "originalWeightSha256": WEIGHT_SHA256})

    def do_POST(self):
        if self.path != "/infer" or not self.authorized():
            self.reply(403, {"error": "Forbidden"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= MAX_BODY:
                self.reply(413, {"error": "Invalid image size"})
                return
            raw = json.loads(self.rfile.read(length))
            if raw.get("schema") != "opus-xrv-cpu-request/v1":
                raise ValueError("Unexpected contract")
            encoded = raw["imagePngBase64"]
            if not isinstance(encoded, str) or len(encoded) > 16_000_000:
                raise ValueError("Unbounded image")
            png = base64.b64decode(encoded, validate=True)
            sha = hashlib.sha256(png).hexdigest()
            if not hmac.compare_digest(sha, str(raw.get("sourceImageSha256", ""))):
                raise ValueError("Image hash mismatch")
            begin = time.monotonic()
            result = guarded_infer(png)
            result["cpuElapsedMs"] = round((time.monotonic() - begin) * 1000)
            self.reply(200, result)
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            self.reply(422, {"error": "Invalid or unprocessable source image"})
        except TimeoutError:
            self.reply(503, {"error": "CPU deadline exceeded"})
        except Exception:
            self.reply(503, {"error": "CPU inference unavailable"})

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--serve", action="store_true")
    mode.add_argument("--oneshot-png", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    load_model(args.weights)
    if args.oneshot_png:
        begin = time.monotonic()
        report = guarded_infer(args.oneshot_png.read_bytes())
        report["cpuElapsedMs"] = round((time.monotonic() - begin) * 1000)
        print(json.dumps(report, indent=2))
        return 0
    if not os.environ.get("XRV_WORKER_TOKEN") or len(os.environ["XRV_WORKER_TOKEN"]) < 24:
        raise RuntimeError("Set a sufficiently long XRV_WORKER_TOKEN")
    with HTTPServer((args.host, args.port), Handler) as server:
        server.serve_forever()
    return 0

if __name__ == "__main__":
    sys.exit(main())
