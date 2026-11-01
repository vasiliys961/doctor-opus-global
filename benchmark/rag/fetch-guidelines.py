#!/usr/bin/env python3
"""Fetch six strictly allow-listed, government-origin public clinical guidance pages.

These downloads go only into ephemeral CI files/artifacts, never into the
benchmark test prompts/rubrics or automatic self-training. Source rights are
checked against curated, publisher-specific terms; do not accept user-provided
URLs or arbitrary sites. Exclude scripts, images, figures and third-party tables.
"""
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

ALLOW_HOSTS={"www.cdc.gov","clinicalinfo.hiv.gov"}
MIN_DOCUMENT_CHARS=500
MAX_SOURCE_CHARS=1_500_000

def clean(s):
    return re.sub(r"\s+"," ",s).strip()

def extract_page(html, source):
    soup=BeautifulSoup(html,"html.parser")
    for tag in soup(["script","style","nav","footer","aside","svg","figure","figcaption",
                      "img","form","iframe","video","noscript","table"]):
        tag.decompose()
    candidates=soup.select("main, article, [role=main], #content, #main-content, .body-content")
    if not candidates: raise ValueError("No main clinical content in "+source["id"])
    root=max(candidates,key=lambda z:len(z.get_text(" ",strip=True)))
    for tag in root.select(".related-pages, .related-articles, .share, .references, .citation, .feedback"):
        tag.decompose()
    title=root.find(["h1","h2"])
    if title is None or source["expectedKeyword"].lower() not in clean(title.get_text(" ",strip=True)).lower():
        # NIH sometimes has an overarching document title in H1, and the actual
        # chapter title in H2. Require the expected topic somewhere in a header.
        titles=[clean(x.get_text(" ",strip=True)) for x in root.find_all(["h1","h2","h3"],limit=40)]
        if not any(source["expectedKeyword"].lower() in s.lower() for s in titles):
            raise ValueError("Unexpected clinical article title "+source["id"]+": "+str(titles[:8]))
    result=[]
    section=source["title"]
    text=[]
    seen=set()
    def flush():
        nonlocal text
        combined=clean(" ".join(text))
        if len(combined)>=MIN_DOCUMENT_CHARS:
            result.append((section,combined))
        text=[]
    for node in root.find_all(["h2","h3","h4","p","li"]):
        if node.name=="li" and node.find_parent("li") is not None: continue
        if node.name in ("p","li") and node.find_parent(["p","li"]) is not None: continue
        txt=clean(node.get_text(" ",strip=True))
        if len(txt)<20: continue
        if txt in seen: continue
        seen.add(txt)
        if node.name in ("h2","h3"):
            flush()
            section=txt[:180]
        else:
            text.append(txt)
    flush()
    return result

def fetch_one(source,session):
    url=source["url"]
    host=urlparse(url).hostname
    if host not in ALLOW_HOSTS or urlparse(url).scheme!="https":
        raise ValueError("Rejected non-allowlisted URL "+url)
    if source.get("license")!="PUBLIC-DOMAIN":
        raise ValueError("Source license requires separate review")
    response=session.get(url,timeout=45,headers={"User-Agent":"DoctorOpusBenchmarkResearch/0.1 (public government texts)"})
    response.raise_for_status()
    redirected=urlparse(response.url)
    if redirected.hostname not in ALLOW_HOSTS or redirected.scheme!="https":
        raise ValueError("Redirected outside approved publisher")
    if "html" not in response.headers.get("Content-Type",""):
        raise ValueError("Unexpected content type: "+response.headers.get("Content-Type",""))
    if len(response.content)>6_000_000: raise ValueError("Page unexpectedly large")
    sections=extract_page(response.text,source)
    if not sections:raise ValueError("No substantial clinical sections found: "+source["id"])
    docs=[]
    for idx,(heading,clinical_text) in enumerate(sections):
        if len(clinical_text)>MAX_SOURCE_CHARS:
            raise ValueError("A section exceeded allowed size")
        docs.append({
          "id":source["id"]+"-"+str(idx).zfill(3),
          "title":source["title"],
          "license":"PUBLIC-DOMAIN",
          "privacy":"public",
          "url":response.url,
          "publisher":source["publisher"],
          "section":heading,
          "published":source.get("published",None),
          "domain":source["domain"],
          "text":clinical_text,
        })
    return docs,{"id":source["id"],"url":response.url,"sections":len(sections),
      "characters":sum(len(d["text"]) for d in docs),
      "html_sha256":hashlib.sha256(response.content).hexdigest(),
      "status":response.status_code}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--sources",default="benchmark/rag/guideline-sources.json")
    parser.add_argument("--output",default="benchmark/rag/data/guidelines-public.jsonl")
    args=parser.parse_args()
    conf=json.loads(Path(args.sources).read_text())
    selected=[doc for doc in conf["docs"] if doc.get("enabled",True)]
    assert len(selected)>=4, "At least four explicitly enabled sources required"
    ses=requests.Session()
    docs=[]
    provenance=[]
    for src in selected:
        item,details=fetch_one(src,ses)
        docs+=item
        provenance.append(details)
        print("GUIDELINE_FETCH "+json.dumps(details),flush=True)
        time.sleep(0.5)
    if len(docs)<10: raise RuntimeError("Too few usable clinical sections")
    if len({d["url"] for d in docs})<len(selected):
        raise RuntimeError("Duplicate/missing source URLs")
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    result="\n".join(json.dumps(x,ensure_ascii=False) for x in docs)+"\n"
    path.write_text(result)
    report={"documents":len(docs),"sources":len(selected),
        "totalChars":sum(len(d["text"]) for d in docs),
        "sha256":hashlib.sha256(result.encode()).hexdigest(),
        "retrievedUtc":datetime.now(timezone.utc).isoformat(),
        "publisherLicensing":"https://www.cdc.gov/std/treatment-guidelines/intro.htm ; https://www.nih.gov/about-nih/frequently-asked-questions",
        "notes":"Public domain federal clinical guidance texts, without images, third-party figures or tables. Not benchmark cases or rubrics.",
        "provenance":provenance}
    path.with_suffix(path.suffix+".provenance.json").write_text(json.dumps(report,indent=2)+"\n")
    print("GUIDELINE_CORPUS "+json.dumps(report),flush=True)

if __name__=="__main__":main()
