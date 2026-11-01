"""Read-only Redivis metadata check. No patient data or images are fetched."""
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

token=os.environ.get("REDIVIS_API_TOKEN")
if not token:
    raise SystemExit("Redivis secret is missing")
base="https://redivis.com/api/v1/organizations/"
owners=["demo","stanfordaimi","stanford","StanfordPHS"]
terms=["physicianbench","ddi","midas","merlin","chexpert","echo","radgraph","mrnet","mura","pocus"]
for owner in owners:
    req=Request(base+owner+"/datasets?maxResults=1000",
        headers={"Authorization":"Bearer "+token,"Accept":"application/json"})
    try:
        with urlopen(req,timeout=25) as response:
            data=json.load(response)
            status=response.status
    except HTTPError as error:
        status=error.code
        data={}
    except URLError:
        status="network_error"
        data={}
    print("REDIVIS_ORG_STATUS",json.dumps({"organization":owner,"httpStatus":status}))
    if status==401:
        raise SystemExit("Redivis token rejected; check token validity")
    if status!=200 or owner=="demo":
        continue
    matches=[]
    for row in data.get("results",[]):
        name=str(row.get("name",""))
        if any(t in name.lower().replace(" ","") for t in terms):
            matches.append({"name":name,"access":row.get("accessLevel","unknown")})
    print("REDIVIS_DATASETS",json.dumps({"organization":owner,"matches":matches},ensure_ascii=False))
