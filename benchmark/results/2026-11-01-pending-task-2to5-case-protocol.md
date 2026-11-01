# Doctor Opus MAST — small genuine examples from previously untested tasks
Date: 2026-11-01. Scope: **only** `feat/mast-consilium-adapter`.
Parent `main` and production app must remain untouched. PR #1 is draft and unmerged.

## What is implemented in this branch

| Source / new task | Cases | Actual evaluation channel | Current proof level |
| --- | ---: | --- | --- |
| Official published PhysicianBench instructions (urology and cardiology) | 2 | Original pinned `HealthRex/PhysicianBench` instructions -> FULL `answerMastCase` Doctor Opus consilium -> plan / missing-EHR checks | Workflow committed. Not official pass@1 because original FHIR patient data, tool execution, graders absent. |
| Thyroid ultrasound CC BY-SA 3.0, Nevit Dilmen, Wikimedia Commons | 3 JPEGs | Original images -> independent vision observer -> specialist radiology report -> source-caption comparison | Workflow committed. No histopathology ground truth or Stanford cine-clip data. |
| Stanford AIMI Redivis: CheXpert Plus, INSPECT, DDI2 | Max 5 narrow label rows/dataset | Official SDK row read with token and platform export restrictions, no values printed/stored | Workflow committed. No model transfer; not yet a diagnosis score. |
| Stanford AIMI Redivis: Thyroid cine-clips, PhysicianBench | Max 3 file index objects/dataset | Size / file index feasibility, no raw files | Workflow committed. Original FHIR docker / cine-clip inference pending. |

## GitHub Actions
- [Limited Redivis examples](https://github.com/vasiliys961/doctor-opus-global/actions/workflows/mast-redivis-five-pending-tasks.yml)
- [Two real published PhysicianBench task texts through Doctor Opus consilium](https://github.com/vasiliys961/doctor-opus-global/actions/workflows/mast-physicianbench-two-public-consilium.yml)
- [Three original thyroid ultrasound stills through Doctor Opus vision](https://github.com/vasiliys961/doctor-opus-global/actions/workflows/mast-thyroid-ultrasound-public-three.yml)
- [Schema check](https://github.com/vasiliys961/doctor-opus-global/actions/workflows/mast-redivis-label-schema.yml)

## Data provenance and measurement discipline
- PhysicianBench source pinned to `HealthRex/PhysicianBench@c7efa8fd5b1e4744ada50668efe4b7e84023cbb0`; actual task text is public, MRNs and practitioner identifiers redacted before LLM.
- Ultrasound: 
  - https://commons.wikimedia.org/wiki/File:Thyroid_ultrasound_110314142256_1423520.jpg
  - https://commons.wikimedia.org/wiki/File:Thyroid_ultrasound_110321165224_1657430.jpg
  - https://commons.wikimedia.org/wiki/File:Thyroid_ultrasound_110322095404_0959360.jpg
  - Creator: Nevit Dilmen; CC BY-SA 3.0; metadata captions withheld during model calls.
- Stanford AIMI data: authorized API access **does not imply** permission to send original images, full clinical records, or docker patient data to external LLMs. Data-export rules enforced by Redivis; never bypass 403, never log identifiable rows. Public workflow logs contain summary counts only.
- Output artifacts contain generated reports for public test inputs only. No Stanford pixel/record content is retained.

## Strictly pending, until workflow results are verified
1. Confirm GH Actions conclusions; do not call any of these new pipelines passed before they complete.
2. Read cost, error count, and 2/2 + 3/3 completeness; inspect original reports for hallucination and critical omissions.
3. If Redivis allows limited table rows, map expert labels to image identifiers without leaking identifiers; separately confirm use rights for outside AI service.
4. Evaluate two original Stanford PhysicianBench FHIR tasks using full released docker + checkpoint graders only if source access, size, and destination rights permit; otherwise report the true blocker.
5. Evaluate two-to-five Stanford licensed cine-clip / INSPECT image pairs only when original labels and processing rights are established.

**No official MAST, PhysicianBench, INSPECT, Stanford DDI2, or Thyroid Ultrasound Cine-clip scores are claimed here.**
