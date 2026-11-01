"""Genuine ECG Opus NeuroKit tracing measurements (3 original source signals).
No ECGFounder weights are claimed/used. Per-lead units are original CSV units,
NOT mV; report only summary numbers and availability, no patient content.
"""
import csv
import json
import sys
from pathlib import Path

CASES=[
 ("00001_норма.csv","case-00001","normal-rhythm"),
 ("00351_фибрилляция.csv","case-00351","atrial-fibrillation"),
 ("01541_инфаркт.csv","case-01541","myocardial-infarction"),
]
LEADS=("I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6")
def main(src,out):
 import numpy as np
 from ecg_engine.delineation import measure_tracing
 out.mkdir(parents=True,exist_ok=True)
 records=[]
 for filename,case,reference in CASES:
  with (src/filename).open(encoding="utf-8-sig",newline="") as fh:
   rd=csv.DictReader(fh)
   if rd.fieldnames!=list(LEADS):raise RuntimeError("Lead schema differs from ECG Opus")
   arr=[[float(row[lead]) for lead in LEADS] for row in rd]
  signals=np.asarray(arr,dtype=float)
  if signals.shape!=(5000,12) or not np.isfinite(signals).all():
   raise RuntimeError("Signal invalid, cannot claim numerical measurements")
  report=measure_tracing(signals.T,500.0)
  if report.get("available") is not True:
   # The upstream ECG Opus helper intentionally suppresses exceptions.
   # For these public contest fixtures, surface only the exception type for
   # debugging; never silently claim 3/3 quantitative measurements.
   import ecg_engine.delineation as outline
   try:
    outline._measure(signals.T,500.0)
   except Exception as exc:
    print("ECG_OPUS_MEASUREMENT_EXCEPTION",case,type(exc).__name__,str(exc)[:180])
  row={ "case":case,"reference":reference,"method":"ECG Opus NeuroKit measured original digital signal",
   "available":report.get("available") is True,"beats":report.get("beats"),
   "heart_rate_bpm":report.get("heart_rate_bpm"),"rr_ms":report.get("rr_ms"),
   "rr_min_ms":report.get("rr_min_ms"),"rr_max_ms":report.get("rr_max_ms"),
   "pq_ms":report.get("pq_ms"),"qrs_ms":report.get("qrs_ms"),
   "qt_ms":report.get("qt_ms"),"qtc_bazett_ms":report.get("qtc_bazett_ms"),
   "premature_beats":report.get("premature_beats"),
   "ecgfounder_executed":False,
   "source_units_uncalibrated":True}
  records.append(row)
  print("ECG_OPUS_DIGITAL_MEASUREMENT "+json.dumps(row,ensure_ascii=False))
 (out/"summary.json").write_text(json.dumps({
  "cases":records,"total":len(records),"measured":sum(x["available"] for x in records),
  "notes":"Quantitative NeuroKit delineation, no ML weight inference; no diagnosis accuracy claimed"
 },ensure_ascii=False,indent=2))
 if not any(row["available"] for row in records):
  raise RuntimeError("No measurable ECG signals; test must fail until digital extraction works")
if __name__=="__main__":
 main(Path(sys.argv[1]),Path(sys.argv[2]))
