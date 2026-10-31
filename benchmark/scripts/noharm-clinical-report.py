#!/usr/bin/env python3
"""Human-auditable NOHARM 30-case report from the ORIGINAL MAST judge outputs.
Never substitute this report for the official scorer's CSV. Judge evaluations
are candidate signals; every proposed clinical improvement needs physician review.
Usage:
 python scripts/noharm-clinical-report.py RESULTS_JUDGED.jsonl RUBRIC_DIR LEDGER.jsonl OUTPUT.md
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

def parse_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]

def main():
    judged_path, rubric_dir, ledger_path, output_path = map(Path, sys.argv[1:5])
    judged = parse_jsonl(judged_path)
    ledger = {x["id"]: x for x in parse_jsonl(ledger_path)}
    rubrics = {
        r["id"]: r for r in
        (json.loads(path.read_text()) for path in rubric_dir.glob("*.json"))
    }

    cases = []
    lines = [
        "# Doctor Opus Consilium — internal NOHARM clinical error audit",
        "",
        "This is a **full-system** result. Evaluation uses the official MAST two-stage"
        " Gemini judge; final clinical interpretation requires physician review.",
        "",
        "The cases are the 30 open **k=1 baseline** items; public MAST reference"
        " scores use k=11 (330 perturbations), so scores are not directly comparable.",
        "",
        "| Case | Weighted F1 | Severe harm | Duration, s | New API cost, $ | Agent errors |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for record in judged:
        case_id = record.get("id")
        if case_id not in rubrics:
            continue
        metric = record.get("metrics") or {}
        ledger_row = ledger.get(case_id, {})
        severe = metric.get("Severe_rate", 0)
        cases.append((float(metric.get("F1_weighted") or 0), case_id, severe, record, ledger_row))
        lines.append(
            f"| {case_id} | {float(metric.get('F1_weighted') or 0):.3f} | "
            f"{severe} | {ledger_row.get('elapsedSeconds', '—')} | "
            f"{ledger_row.get('costUsd', '—')} | "
            f"{ledger_row.get('agentApiFailures', '—')} |"
        )
    cases.sort()
    lines += ["", "## Lowest-scoring clinical cases", ""]
    category_count = Counter()
    for score, case_id, severe, record, ledger_row in cases[:12]:
        rubric = rubrics[case_id]
        opts = {x["id"]: x for x in rubric.get("options", [])}
        harmful = []
        to_review = []
        for matched in record.get("options", []):
            option = opts.get(matched.get("id"))
            if not option:
                continue
            grade = option.get("score")
            if not isinstance(grade,(int,float)):
                continue
            if matched.get("matched") and grade<=3:
                harmful.append(option.get("text",""))
                category_count[option.get("category","unknown")] += 1
            if not matched.get("matched") and grade>=7 and option.get("bestInGroup"):
                to_review.append(option.get("text",""))
        lines += [
            f"### {case_id}: F1={score:.3f}, severe={severe}",
            "",
            "**Harmful rubric-matched actions (require physician adjudication):**",
            "",
        ]
        lines += [f"- {x}" for x in harmful] if harmful else ["- None flagged as explicitly matched."]
        lines += ["", "**High-value rubric options to review (not necessarily omissions):**", ""]
        lines += [f"- {x}" for x in to_review[:6]] if to_review else ["- None among best-in-group options."]
        lines += ["", "**Original judge harm flags:**", ""]
        harms=record.get("harm",[])
        lines += [f"- {json.dumps(h,ensure_ascii=False)}" for h in harms[:8]] if harms else ["- None."]
        lines += [""]
    lines += [
        "## Aggregated hypotheses for improving the system",
        "",
        "These are candidate error locations, not validated changes. "
        "Compare on unseen cases after each modification.",
        "",
    ]
    for name,count in category_count.most_common():
        lines.append(f"- {name}: {count} potentially harmful matched actions among lowest-scoring cases")
    lines += ["", f"Cases scored: {len(cases)}. All names are public benchmark case IDs.", ""]
    output_path.parent.mkdir(parents=True,exist_ok=True)
    output_path.write_text("\n".join(lines),encoding="utf-8")
    print(json.dumps({"report":str(output_path),"judgedCases":len(cases),
      "lowestCases":[{"id":case_id,"score":round(score,3)}
           for score,case_id,*_ in cases[:10]],"categories":dict(category_count)},ensure_ascii=False))
if __name__=="__main__":
    if len(sys.argv)!=5:
        raise SystemExit("Usage: noharm-clinical-report.py JUDGED.jsonl RUBRIC_DIR LEDGER.jsonl REPORT.md")
    main()
