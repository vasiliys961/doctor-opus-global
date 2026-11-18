#!/usr/bin/env python3
"""Public-only free Nemotron 3.5 Super VL vision self-assessment.
10 matched ECG images from the historical PTB-XL pilot; 10 ORIGINAL
pediatric chest X-rays: 5 NORMAL and 5 PNEUMONIA image-level labels.
NO MAST judge, no paid models, no patient uploads, no forced JSON.
Image interpretation labels are limited proxy tasks, not diagnosis accuracy.
"""
import base64, hashlib, json, os, pathlib, re, time
from urllib import request, error

ECGROOT=pathlib.Path("benchmark/internal-results/ecg-ptbxl-20261118")
OUT=pathlib.Path("benchmark/internal-results/nemotron-free-ecg-xray-20261119")
IMAGES=OUT/"images"
IMAGES.mkdir(parents=True,exist_ok=True)
MODEL="nvidia/nemotron-3.5-super-vl:free"
KEY=os.getenv("OPENROUTER_API_KEY","")
if not KEY:raise SystemExit("Missing GitHub OpenRouter secret")
def grab(url,headers=None,max_bytes=8000000):
    with request.urlopen(request.Request(url,headers=headers or {"User-Agent":"DoctorOpusPublicVision/1.0"}),timeout=45) as r:
        b=r.read(max_bytes+1)
    if not b or len(b)>max_bytes:raise RuntimeError("public source unavailable or too large")
    return b
catalog={x["id"]:x for x in json.loads(grab("https://openrouter.ai/api/v1/models"))["data"]}
item=catalog.get(MODEL,{})
p=item.get("pricing") or {}
caps=(item.get("architecture") or {}).get("input_modalities") or []
if not item or "image" not in caps or float(p.get("prompt","nan"))!=0 or float(p.get("completion","nan"))!=0:
    raise SystemExit("Model missing, not image-capable or not free; no calls made")
manifest=json.loads((ECGROOT/"manifest.json").read_text())
ecg=manifest["cases"][:10]
if len(manifest["cases"])!=20 or len(ecg)!=10:raise SystemExit("Source ECG manifest incorrect")
for i,c in enumerate(ecg,1):
    image=(ECGROOT/c["image"]).read_bytes()
    assert c["id"]==f"ecg-{i:02d}"
    if hashlib.sha256(image).hexdigest()!=c["imageSha256"]:raise SystemExit("Image hash mismatch")
    (IMAGES/(c["id"]+".jpg")).write_bytes(image)
# Pinned public pediatric chest-X-ray test files with dataset labels.
XRAY_COMMIT="551b993d5dcaec27a1f1bbbcbca2ff4968a28e07"
XRAY_ROOT="https://raw.githubusercontent.com/probml/chest_xray_kaggle/"+XRAY_COMMIT+"/test/"
XRAYS=[
    ("xray-n01","NORMAL/IM-0001-0001.jpeg","NORMAL"),
    ("xray-n02","NORMAL/IM-0003-0001.jpeg","NORMAL"),
    ("xray-n03","NORMAL/IM-0005-0001.jpeg","NORMAL"),
    ("xray-n04","NORMAL/IM-0006-0001.jpeg","NORMAL"),
    ("xray-n05","NORMAL/IM-0007-0001.jpeg","NORMAL"),
    ("xray-p01","PNEUMONIA/person100_bacteria_475.jpeg","OPACITY"),
    ("xray-p02","PNEUMONIA/person101_bacteria_483.jpeg","OPACITY"),
    ("xray-p03","PNEUMONIA/person102_bacteria_487.jpeg","OPACITY"),
    ("xray-p04","PNEUMONIA/person103_bacteria_488.jpeg","OPACITY"),
    ("xray-p05","PNEUMONIA/person104_bacteria_491.jpeg","OPACITY"),
]
ecg_prompt=(
    "Read the supplied original PUBLIC 12-lead ECG image, independently. "
    "Provide a very concise clinical ECG interpretation (rhythm, rate, QRS/conduction, "
    "ST/T changes, major abnormalities). No fabricated numeric intervals. "
    "Then finish with a line in exactly this format: PRIMARY: CODE. "
    "CODE must be one of NORM, AFIB, CRBBB, CLBBB, 1AVB, LVH, MI, OTHER, UNCERTAIN. "
    "Choose the most supported PRIMARY feature; do not assume the reference is known. "
    "NORM=normal, AFIB=atrial fibrillation, CRBBB=complete RBBB, CLBBB=complete LBBB, "
    "1AVB=first degree AV block, LVH=left ventricular hypertrophy, "
    "MI=infarction pattern on ECG (not necessarily acute MI), "
    "OTHER=other abnormalities, UNCERTAIN=not interpretable. "
    "Maximum 170 words; do not return JSON. Distinguish uncertainty."
)
xray_prompt=(
    "Interpret ONLY the supplied pediatric single frontal chest X-ray image as a "
    "radiographic visual reading. Describe visible lungs, focal or diffuse airspace "
    "opacities, and important limitations without inferring a clinical cause. "
    "Never state bacterial or viral etiology as if proven by image alone. "
    "End with a line EXACTLY: CATEGORY: CODE where CODE is NORMAL, OPACITY, "
    "or UNCERTAIN. NORMAL means no definite airspace opacity, OPACITY means "
    "visible airspace opacity compatible with infection but nonspecific, "
    "UNCERTAIN means non-diagnostic or too ambiguous. "
    "Maximum 140 words; do not return JSON."
)
def call(prompt, pixels):
    payload={"model":MODEL,"messages":[{"role":"system","content":prompt},
      {"role":"user","content":[{"type":"text","text":"Assess the attached public image independently, without external context."},
      {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+base64.b64encode(pixels).decode()}}]}],
      "temperature":0,"reasoning":{"enabled":False},"max_tokens":2200,"stream":False}
    t=time.monotonic()
    try:
        req=request.Request("https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(payload).encode(),method="POST",
            headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json",
                "X-Title":"Doctor Opus free ECG chest Xray self evaluation"})
        with request.urlopen(req,timeout=180) as res:data=json.loads(res.read(12000000))
        choice=(data.get("choices") or [{}])[0]
        msg=choice.get("message") or {}
        content=msg.get("content") or ""
        if isinstance(content,list): content="\n".join(v.get("text","") for v in content if isinstance(v,dict))
        usage=data.get("usage") or {}
        if usage.get("cost") is None or float(usage["cost"])!=0:
            raise RuntimeError("Missing or nonzero billing reported; stop")
        return {"status":"ok" if len(str(content).strip())>=30 else "empty_content",
                "answer":str(content).strip(),"usage":{"cost":0,"prompt_tokens":usage.get("prompt_tokens"),
                        "completion_tokens":usage.get("completion_tokens")},
                "finish_reason":choice.get("finish_reason"),
                "seconds":round(time.monotonic()-t,2)}
    except error.HTTPError as exc:return {"status":"error","error":"HTTP_"+str(exc.code),"seconds":round(time.monotonic()-t,2)}
    except Exception as exc:return {"status":"error","error":type(exc).__name__,"seconds":round(time.monotonic()-t,2)}

tasks=[]
for c in ecg:
    tasks.append({"id":c["id"],"modality":"ecg","reference":c["referencePrimary"],
                  "source":c["sourceStem"],"sha256":c["imageSha256"],
                  "file":c["id"]+".jpg","prompt":ecg_prompt})
for cid,rel,label in XRAYS:
    pixels=grab(XRAY_ROOT+rel,max_bytes=9000000)
    if pixels[:2]!=b"\xff\xd8":raise SystemExit("Bad public JPEG "+cid)
    (IMAGES/(cid+".jpg")).write_bytes(pixels)
    tasks.append({"id":cid,"modality":"xray","reference":label,"source":rel,
                  "sha256":hashlib.sha256(pixels).hexdigest(),
                  "file":cid+".jpg","prompt":xray_prompt})
(OUT/"manifest.json").write_text(json.dumps({"model":MODEL,
    "ECG":"20-case historical PTB-XL public manifest; first ten exact generated ECG frames",
    "XRAY":"probml/chest_xray_kaggle original public pediatric 5+5; NOT identical to historical VQA-RAD nine X-rays",
    "XRAY_COMMIT":XRAY_COMMIT,
    "truth_caveats":"ECG reference is one primary PTB-XL code only; chest X-ray normal/pneumonia dataset labels imperfect and do not establish image-confirmed etiology.",
    "method":"no paid judge, no forced JSON, 20 zero-priced calls, independent reference-only posthoc scoring",
    "questions_never_include_references":True,
    "items":[{k:v for k,v in z.items() if k!="prompt"} for z in tasks]},
    ensure_ascii=False,indent=2)+"\n")

stats={}
for t in tasks:
    pix=(IMAGES/t["file"]).read_bytes()
    r=call(t["prompt"],pix)
    pat=r"\bPRIMARY\s*:\s*(NORM|AFIB|CRBBB|CLBBB|1AVB|LVH|MI|OTHER|UNCERTAIN)\b" if t["modality"]=="ecg" else r"\bCATEGORY\s*:\s*(NORMAL|OPACITY|UNCERTAIN)\b"
    m=re.search(pat,r.get("answer",""),re.IGNORECASE)
    pred=m.group(1).upper() if m else None
    correct=pred==t["reference"] if pred else None
    result={k:v for k,v in t.items() if k!="prompt"}|r|{"prediction":pred,"label_match":correct}
    with (OUT/"detailed.jsonl").open("a",encoding="utf-8") as f:
        f.write(json.dumps(result,ensure_ascii=False)+"\n")
    print("VISION_SELF_EVAL "+json.dumps({k:v for k,v in result.items() if k not in ("answer","source","sha256")}),flush=True)
    time.sleep(2)
rows=[json.loads(x) for x in (OUT/"detailed.jsonl").read_text().splitlines() if x.strip()]
for modality in ("ecg","xray"):
    z=[x for x in rows if x["modality"]==modality]
    stats[modality]={"total":len(z),"answers_received":sum(x.get("status")=="ok" for x in z),
      "parseable_categories":sum(x.get("prediction") is not None for x in z),
      "category_matches":sum(x.get("label_match") is True for x in z),
      "unparsable":sum(x.get("prediction") is None for x in z),
      "seconds_mean":round(sum(x.get("seconds",0) for x in z)/len(z),2),
      "note":"Proxy primary label only; cannot infer clinical accuracy or absence of dangerous misses."}
(OUT/"summary.json").write_text(json.dumps(stats,ensure_ascii=False,indent=2)+"\n")
print("VISION_SELF_EVAL_SUMMARY "+json.dumps(stats,ensure_ascii=False),flush=True)
if not any(x.get("status")=="ok" for x in rows):raise SystemExit("All free vision calls failed")
