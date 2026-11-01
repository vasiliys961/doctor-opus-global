#!/usr/bin/env python3
"""Small non-clinical multimodal API smoke, not a medical imaging score.
Always uses a generated synthetic image; never patient data or MAST hidden cases.
"""
import base64, io, json, os, time
from pathlib import Path
import requests
from PIL import Image, ImageDraw

OUT=Path("internal-results/vision-model-smoke")
OUT.mkdir(parents=True,exist_ok=True)
im=Image.new("RGB",(420,260),"#e6e6e6")
d=ImageDraw.Draw(im)
d.text((12,13),"SYNTHETIC IMAGE TEST",fill="black")
for x,y in [(75,105),(210,155),(350,105)]:
    d.ellipse((x-24,y-24,x+24,y+24),outline="black",width=5,fill="#a2d7ea")
d.text((10,235),"NOT A PATIENT IMAGE",fill="black")
bio=io.BytesIO();im.save(bio,format="PNG")
image_url="data:image/png;base64,"+base64.b64encode(bio.getvalue()).decode()
im.save(OUT/"synthetic-test.png")
key=os.environ.get("OPENROUTER_API_KEY")
if not key:raise SystemExit("OPENROUTER_API_KEY unavailable")
models=["google/gemini-3.8-flash","google/gemini-3.1-pro-preview","qwen/qwen3.5-397b-a17b"]
results=[]
for model in models:
    payload={"model":model,
      "messages":[{"role":"user","content":[
         {"type":"text","text":"NON-CLINICAL VISION CHECK ONLY. Read the synthetic diagram: count the drawn blue circles and identify the large top label. Respond in a short JSON object with keys circles (integer), label (string), is_patient_image (boolean). No medical diagnosis."},
         {"type":"image_url","image_url":{"url":image_url}}
      ]}],"max_tokens":700,"temperature":0}
    began=time.monotonic()
    try:
       r=requests.post("https://openrouter.ai/api/v1/chat/completions",json=payload,
         headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"},
         timeout=120)
       if not r.ok:raise RuntimeError("HTTP "+str(r.status_code)+": "+r.text[:220])
       data=r.json()
       response=data.get("choices",[{}])[0].get("message",{}).get("content","")
       if isinstance(response,list):response=" ".join(str(x.get("text","")) for x in response if isinstance(x,dict))
       if not str(response).strip():raise RuntimeError("Empty model output")
       usage=data.get("usage",{})
       cost=usage.get("cost")
       results.append({"model":model,"status":"ok","text":str(response)[:2200],
         "costUsd":float(cost) if cost is not None else None,
         "seconds":round(time.monotonic()-began,2),
         "note":"Synthetic image sanity test only; not clinical accuracy"})
    except Exception as err:
       results.append({"model":model,"status":"error","error":str(err)[:300],
         "seconds":round(time.monotonic()-began,2)})
    print("VISION_SYNTHETIC_MODEL "+json.dumps({k:v for k,v in results[-1].items() if k!="text"}),flush=True)
    (OUT/"results.json").write_text(json.dumps({"models":results},indent=2)+"\n")
print("VISION_SYNTHETIC_SUMMARY "+json.dumps({
  "successful":sum(x["status"]=="ok" for x in results),
  "models":len(results),"spendUsd":round(sum(x.get("costUsd") or 0 for x in results),5)}))
if sum(x["status"]=="ok" for x in results)<2:raise SystemExit("Fewer than two vision providers succeeded")
