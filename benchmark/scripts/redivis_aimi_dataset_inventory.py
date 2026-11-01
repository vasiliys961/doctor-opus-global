"""Enumerate Stanford AIMI datasets and limited table/usage metadata only.

Uses only official Redivis read methods: list_datasets, Dataset.get and
Dataset.list_tables. Does not fetch tables, rows, sample records, files, PHI,
or send anything to external LLMs. No private user account data logged.
"""
from __future__ import annotations
import json
import os
import re
import redivis

PRIORITY = (
    "PhysicianBench", "DDI - Diverse Dermatology Images",
    "DDI2: Diverse Dermatology Images- 2",
    "MRA-MIDAS: Multimodal Image Dataset for AI-based Skin Cancer",
    "CheXpert Plus", "Merlin Abdominal CT Dataset",
    "INSPECT: A Multimodal Dataset for Pulmonary Embolism Diagnosis and Prognosis",
    "MURA: MSK Xrays", "MRNet: Knee MRI's",
    "Thyroid Ultrasound Cine-clip", "RadFusion: Multimodal Pulmonary Embolism Dataset",
)
TERMS = ("sharing", "redistribution", "third-party", "third party", "cloud",
         "export", "model", "research use agreement", "license", "commercial",
         "privacy", "prohibit", "non-commercial", "storage")
def safe_text(v,maxlen=125):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:maxlen]

def get_notice_snippets(props):
    notices=[]
    for key in ("usageMarkdown","methodologyMarkdown"):
        txt=props.get(key)
        if not isinstance(txt,str):
            continue
        # Only sentences containing specific usage and processing constraints.
        plain=re.sub(r"\[([^\]]+)\]\([^\)]+\)",r"\1",txt)
        chunks=re.split(r"[\n\r]+|(?<=\.)\s+(?=[A-Z])",plain)
        for line in chunks:
            if any(term in line.lower() for term in TERMS):
                if len(line.strip())>=18:
                    notices.append(safe_text(line,220))
            if len(notices)>=8:
                break
        if len(notices)>=8:
            break
    return notices[:8]

def main():
    if not os.getenv("REDIVIS_API_TOKEN"):
        raise SystemExit("REDIVIS_SECRET_MISSING")
    aimi=redivis.organization("AIMI")
    ds=aimi.list_datasets(max_results=100)
    inventory=[]
    levels={}
    detailed=[]
    for d in ds:
        p=d.properties or {}
        name=safe_text(p.get("name"),150)
        level=str(p.get("accessLevel") or "unknown").lower()
        levels[level]=levels.get(level,0)+1
        inventory.append({"name":name,"access":level,
           "publicAccess":p.get("publicAccessLevel"),
           "tableCount":p.get("tableCount") if isinstance(p.get("tableCount"),int) else None})
        if name not in PRIORITY:
            continue
        meta={"name":name,"access":level,"reference":p.get("qualifiedReference"),
              "url":p.get("url")}
        try:
            d.get()
            detail=d.properties or {}
            meta["notices"]=get_notice_snippets(detail)
            meta["hasUsageDoc"]=bool(detail.get("usageMarkdown"))
            meta["termsLinks"]=[
                {"title":safe_text(link.get("title"),90),"url":safe_text(link.get("url"),220)}
                for link in (detail.get("links") or [])
                if isinstance(link,dict) and isinstance(link.get("url"),str)
            ][:8]
        except Exception as exc:
            meta["metadataStatus"]=type(exc).__name__
        try:
            tables=d.list_tables(max_results=15)
            meta["tables"]=[
                {"name":safe_text(t.properties.get("name"),110),
                 "isFileIndex":t.properties.get("isFileIndex"),
                 "rows":t.properties.get("numRows"),
                 "columns":t.properties.get("variableCount")}
                for t in tables if isinstance(t.properties,dict)
            ]
        except Exception as exc:
            meta["tablesStatus"]=type(exc).__name__
        detailed.append(meta)
    report={"org":"AIMI","totalVisible":len(ds),
            "levels":levels,"datasets":inventory,"priorityMetadata":detailed,
            "dataRetrieved":False,
            "caveat":"Dataset access levels do not establish export/third-party LLM rights. Never assume cloud API transfer is permitted by data access alone."}
    print("REDIVIS_AIMI_COMPLETE_METADATA "+json.dumps(report,ensure_ascii=False))
if __name__=="__main__":
    main()
