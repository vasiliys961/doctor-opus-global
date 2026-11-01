"""Render three original 12-lead ECG Opus example signals into blinded images.

Reads user-owned ecg-opus-global/examples2 CSV at pinned public revision.
Labels/reference diagnoses are NEVER printed onto pixels. No paper-speed,
amplitude calibration or clinically measured lead intervals are asserted.
Source samples are not submitted as separate ECGFounder inference.
"""
from __future__ import annotations
import csv
from pathlib import Path
import sys

CASES = (
    ("00001_норма.csv", "case-00001"),
    ("00351_фибрилляция.csv", "case-00351"),
    ("01541_инфаркт.csv", "case-01541"),
)
LEADS = ("I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6")
ORDER = ("I","aVR","V1","V4","II","aVL","V2","V5","III","aVF","V3","V6")
def main(source_dir:Path,out_dir:Path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    out_dir.mkdir(parents=True,exist_ok=True)
    for fname, caseid in CASES:
        with (source_dir/fname).open(encoding="utf-8-sig",newline="") as fh:
            reader=csv.DictReader(fh)
            if reader.fieldnames!=list(LEADS):raise ValueError("Unexpected lead schema")
            leads={key:[] for key in LEADS}
            for row in reader:
                for key in LEADS:leads[key].append(float(row[key]))
        count=len(leads["I"])
        if not 4000<=count<=6000:raise ValueError("Expected ~10 second 12-lead signal")
        duration=count/500 # public example data sampled at 500 Hz
        fig,axes=plt.subplots(3,4,figsize=(17,10.5))
        for ax,name in zip(axes.flat,ORDER):
            series=leads[name]
            stride=max(1,count//2000)
            ax.plot([i/500 for i in range(0,count,stride)],series[::stride],linewidth=0.65)
            ax.set_title("Lead "+name,fontsize=11)
            ax.grid(True,alpha=0.22)
            ax.set_xlim(0,duration)
            ax.tick_params(labelsize=7)
            ax.set_xlabel("Seconds",fontsize=8)
            ax.set_ylabel("Source units",fontsize=8)
        fig.suptitle("Original 12-lead research tracing — no supplied diagnosis or calibration",fontsize=13)
        fig.tight_layout()
        fig.savefig(out_dir/(caseid+".png"),dpi=120)
        plt.close(fig)
        print("ECG_RENDER_READY "+caseid+" "+str(count)+" samples (source labels withheld)")
if __name__=="__main__":
    main(Path(sys.argv[1]),Path(sys.argv[2]))
