#!/usr/bin/env python3
"""Additional licensed public dermoscopy and thyroid sonogram Haiku vision probes.
Same source images as archived Doctor Opus visual pilots, but NOT a matched
system-architecture comparison: prior runs used a multi-model image pipeline.
Total OpenRouter spend across three workflows must stay within $0.50.
"""
import base64,hashlib,json,os,pathlib,re,time
from urllib import request,error

ROOT=pathlib.Path("benchmark/internal-results")
o=json.loads((ROOT/"haiku-all-archive-20261119/summary.json").read_text())
s=json.loads((ROOT/"haiku-specialist-resumed-20261119/summary.json").read_text())
previous=float(s["total_haiku_paid_usd"])
assert abs(previous-(float(o["total_billed_usd"])+float(s["additional_paid_usd"])))<0.000001
MODEL="anthropic/claude-haiku-5.5"; KEY=os.getenv("OPENROUTER_API_KEY","")
if not KEY:raise SystemExit("No key, no calls")
OUT=ROOT/"haiku-extra-public-visual-20261119";OUT.mkdir(parents=True,exist_ok=True)

def commons(file):
 digest=hashlib.md5(file.encode()).hexdigest()
 return f"https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/{file}"
cases=[
 {"id":"derm-nevus-example","modality":"dermatoscopy","source":"https://upload.wikimedia.org/wikipedia/commons/9/9f/Dermatoscopy_Nevus_Reticular.jpg","reference":"melanocytic nevus","license":"CC BY-SA 4.0","author":"Philipp Tschandl"},
 {"id":"derm-melanoma-example","modality":"dermatoscopy","source":"https://upload.wikimedia.org/wikipedia/commons/0/0b/Malignant_Melanoma_Left_Mid_Back_Dermatoscope.jpg","reference":"melanoma","license":"CC BY-SA 4.0","author":"Dermanonymous"},
 {"id":"thyroid-transverse","modality":"thyroid_ultrasound","source":commons("Thyroid_ultrasound_110314142256_1423520.jpg"),"reference":"transverse thyroid view","license":"CC BY-SA 3.0","author":"Nevit Dilmen"},
 {"id":"thyroid-nodule-a","modality":"thyroid_ultrasound","source":commons("Thyroid_ultrasound_110321165224_1657430.jpg"),"reference":"thyroid nodule source caption","license":"CC BY-SA 3.0","author":"Nevit Dilmen"},
 {"id":"thyroid-nodule-b","modality":"thyroid_ultrasound","source":commons("Thyroid_ultrasound_110322095404_0959360.jpg"),"reference":"thyroid nodule source caption","license":"CC BY-SA 3.0","author":"Nevit Dilmen"},
]
(OUT/"manifest.json").write_text(json.dumps({"cases":cases,"previous_usd":previous,
 "note":"Original source images match old Doctor Opus pilots. Architecture differs: this is single Haiku direct vision, NOT original Gemini/Consilium observer pipeline. Source captions are not independent clinical truth."},indent=2)+"\n")
def fetch(url,limit=4500000):
 with request.urlopen(request.Request(url,headers={"User-Agent":"DoctorOpusPublicVisionCompare/1.0 (research Wikimedia attribution preserved)"}),timeout=50) as r:
  data=r.read(limit+1)
  if len(data)<15000 or len(data)>limit or data[:2]!=b"\xff\xd8":raise RuntimeError("Invalid source image")
  return data
catalog={x["id"]:x for x in json.loads(fetch.__globals__["request"].urlopen("https://openrouter.ai/api/v1/models",timeout=45).read())["data"]}
info=catalog.get(MODEL)
if not info or "image" not in (info.get("architecture") or {}).get("input_modalities",[]):raise SystemExit("Current model not vision capable")
pi=float(info["pricing"]["prompt"]);po=float(info["pricing"]["completion"])
if not(0<pi<=0.00000015 and 0<po<=0.00000075):raise SystemExit("Tariff changed")
total_extra=0;records=[]
for case in cases:
 reserve=pi*50000+po*3500
 if previous+total_extra+reserve>0.50 or total_extra+reserve>0.05:
  print("EXTRA_BUDGET_STOP",case["id"]);break
 row={k:v for k,v in case.items() if k not in ("source",)}
 start=time.monotonic()
 try:
  pixels=fetch(case["source"])
  row["sha256"]=hashlib.sha256(pixels).hexdigest()
  if case["modality"]=="dermatoscopy":
   prompt=("Interpret ONLY this original public dermoscopic image, without any history or label. "
   "Describe visible pigment pattern, asymmetry, border, structure, colour, lesion-specific uncertainty, "
   "relevant differentials and what a dermatologist should verify before treatment or biopsy. "
   "Do not claim histopathology. End with 'CATEGORY: NEVUS', 'CATEGORY: MELANOMA', or 'CATEGORY: UNCERTAIN'.")
  else:
   prompt=("Interpret ONLY this original public grayscale thyroid-area ultrasound still, without any history or label. "
   "Describe clearly visible anatomy, plausible nodules or limitations, suspicious visual features if any, "
   "and what further full clinical ultrasound is needed before risk assessment. "
   "Do not invent measurements, orientation or biopsy-indications from an uncalibrated still. "
   "End with 'CATEGORY: NODULE', 'CATEGORY: NO-NODULE', or 'CATEGORY: UNCERTAIN'.")
  data_url="data:image/jpeg;base64,"+base64.b64encode(pixels).decode()
  payload={"model":MODEL,"messages":[{"role":"system","content":prompt},
      {"role":"user","content":[{"type":"text","text":"Independently describe the image without any dataset label."},
      {"type":"image_url","image_url":{"url":data_url}}]}],
      "temperature":0,"reasoning":{"effort":"low"},"max_tokens":3500,"stream":False}
  req=request.Request("https://openrouter.ai/api/v1/chat/completions",data=json.dumps(payload).encode(),method="POST",
   headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json","X-Title":"Doctor Opus public dermatology/thyroid Haiku single reader"})
  with request.urlopen(req,timeout=180) as rsp:resp=json.loads(rsp.read(14000000))
  u=resp.get("usage") or {}
  if u.get("cost") is None:raise RuntimeError("Provider omitted billing")
  cost=float(u["cost"]);total_extra+=cost
  if cost<0 or cost>reserve+1e-6 or previous+total_extra>0.5:raise RuntimeError("Budget stop")
  if resp.get("model") not in (None,MODEL):raise RuntimeError("Model substitution")
  c=(resp.get("choices") or [{}])[0];answer=(c.get("message") or {}).get("content") or ""
  if isinstance(answer,list):answer="\n".join(x.get("text","") for x in answer if isinstance(x,dict))
  expected=("NEVUS|MELANOMA|UNCERTAIN" if case["modality"]=="dermatoscopy" else "NODULE|NO-NODULE|UNCERTAIN")
  match=re.search(r"\bCATEGORY\s*:\s*("+expected+r")\b",str(answer),re.I)
  row.update({"status":"ok" if c.get("finish_reason")=="stop" and len(str(answer))>50 else "incomplete",
    "answer":answer,"usage":u,"usd":cost,"finish_reason":c.get("finish_reason"),
    "prediction":match.group(1).upper() if match else None})
 except error.HTTPError as e:
  row.update({"status":"error","error":"HTTP_"+str(e.code)})
  if e.code in (401,402,403,404):break
 except Exception as e:row.update({"status":"error","error":type(e).__name__})
 row["seconds"]=round(time.monotonic()-start,2)
 records.append(row)
 with (OUT/"responses.jsonl").open("a",encoding="utf-8") as f:f.write(json.dumps(row,ensure_ascii=False)+"\n")
 print("HAIKU_EXTRA_PUBLIC_IMAGE",json.dumps({"id":case["id"],"status":row["status"],"prediction":row.get("prediction"),"billed_usd":row.get("usd")}),flush=True)
 time.sleep(1)
summary={"attempted":len(records),"success":sum(x.get("status")=="ok" for x in records),"cost_extra_usd":round(total_extra,7),
 "total_spend_across_runs_usd":round(previous+total_extra,7),"max_total_usd":0.50,
 "image_source_label_not_gold":True,"not_paired_original_architecture":True}
(OUT/"summary.json").write_text(json.dumps(summary,indent=2)+"\n")
print("HAIKU_EXTRA_SUMMARY",json.dumps(summary),flush=True)
if not any(x.get("status")=="ok" for x in records):raise SystemExit("No valid extra visual answers")
