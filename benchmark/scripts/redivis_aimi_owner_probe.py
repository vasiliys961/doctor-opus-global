"""Resolve public Stanford AIMI organization owner from dataset references.
Zero table rows, files or images requested. Requires REDIVIS_API_TOKEN.
"""
import json
import os
from urllib.parse import quote
import requests
import redivis

if not os.getenv("REDIVIS_API_TOKEN"):
    raise SystemExit("missing_token")
# Stanford Redivis short IDs are from public canonical official links.
dataset_urls = {
  "DDI": "3r16-5mby7gfer",
  "MRA-MIDAS": "dpx2-44ejgtftb",
  "PhysicianBench": "a0ek-0ad8tjsw9",
  "CheXpert Plus": "5yyj-1a9f6ap0x",
}
results=[]
session=requests.Session()
session.headers["Authorization"]="Bearer "+os.environ["REDIVIS_API_TOKEN"]
session.headers["Accept"]="application/json"
for name, key in dataset_urls.items():
    for ref in (key, key.split("-",1)[0]):
        try:
            response=session.get("https://redivis.com/api/v1/datasets/"+quote(ref,safe=""),timeout=18,allow_redirects=False)
            record={"dataset":name,"referenceType":"url-id" if "-" in ref else "short-id","http":response.status_code}
            if response.status_code==200:
                item=response.json()
                owner=item.get("owner")
                if isinstance(owner,dict):
                    record["owner"]=owner.get("name") or owner.get("userName") or owner.get("username")
                record["name"]=item.get("name")
                record["accessLevel"]=item.get("accessLevel")
                record["qualifiedReference"]=item.get("qualifiedReference")
            results.append(record)
            if response.status_code==200:
                break
        except (requests.RequestException,ValueError):
            results.append({"dataset":name,"referenceType":"lookup","http":"network_or_json_error"})
# Also discover organizational handle variants without reading data.
for owner in ("AIMI","Stanford_AIMI","StanfordAIMI","Stanford_AIMI_Center","StanfordAI","AIMIStanford","StanfordAIMIData"):
    try:
        items=redivis.organization(owner).list_datasets(max_results=200)
        results.append({"organization":owner,"status":"ok","count":len(items),
          "names":[{"name":p.get("name"),"accessLevel":p.get("accessLevel")} for d in items
             if isinstance((p:=d.properties),dict) and any(q in str(p.get("name","")).lower() for q in ("ddi", "physician", "chexpert", "merlin"))]})
    except Exception as error:
        results.append({"organization":owner,"status":type(error).__name__})
print("REDIVIS_AIMI_OWNER_RESOLUTION "+json.dumps(results,ensure_ascii=False))
