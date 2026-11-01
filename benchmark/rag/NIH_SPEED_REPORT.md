# Opus Benchmark — public clinical RAG, legal sources and measured embedding performance

Date: **2026-11-01**. All new work is confined to `feat/mast-consilium-adapter`.
Do not merge or archive these test results into `main` without an explicit request.

## Evidence
- [NIH source indexing GitHub Actions](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41278510617), completed successfully.
- [Independent NIH retrieval probes](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41278681017), 5/5 source-selection tests successful.
- [Earlier six-drug openFDA corpus](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41277447526), 97 embeddings with source dates and product references.
- [FDA RAG full-consilium versus no-RAG paired clinical pilot](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41277871937), clinical results must be graded before claiming any F1 or safety improvement.

## Actual CPU benchmark: 6 open federal guideline chapters
- Sources: six NIH ClinicalInfo guidelines: Pneumocystis pneumonia, OI introduction,
  guideline changes, community acquired bacterial pneumonia, toxoplasmosis, disseminated MAC.
- `CDC` guidelines were attempted but **CDC returned HTTP 403** to GitHub Actions,
  so those sources are explicitly disabled, not mirrored or silently substituted.
- HTML stripped of figures, embedded images and third-party tables.
- 22 substantial chapters/sections, **324,022 text characters**.
- E5-small (parent Doctor Opus `Xenova/multilingual-e5-small`, 384D Int8):
  **354 fragments embedded on 2-core GitHub CPU in 30 wall-clock seconds**,
  approximately **11.8 fragments/second**, including index writing.
- Second pass: **354/354 reused**, zero model inference, under one second in workflow timing.
- Effective text per chunk including overlap: about `324022/354 ≈ 915 chars`.
- Source and index SHA-256 are in the attached original GitHub Actions artifact.

## Book-sized text estimates (extrapolations, not measured full textbooks)

At ~11.8 chunks/s on same runner and comparable English textbook text:

| Reference | Approx pages | Assumption: 2–3.5k chars/page, 915 new chars/chunk | CPU embedding only |
|---|---:|---:|---:|
| Davidson 25e | 1,424 | 3,100–5,450 chunks | 4.4–7.7 min |
| Goldman-Cecil 27e | 3,040 | 6,650–11,650 chunks | 9.4–16.5 min |
| Harrison 22e | ~4,000 | 8,750–15,300 chunks | 12.4–21.6 min |

**Practical contingency:** allow 2–3x longer for slower runners, setup, PDF
extraction, OCR if required and document preprocessing. Visual atlas indexing
with CLIP is a separate, more expensive step.

## Rights and source restrictions

- Harrison 22e: McGraw Hill ©2025, explicitly disallows storage in a retrieval
  database without permission:
  https://accessmedicine.mhmedical.com/content.aspx?bookid=3541&sectionid=291971486
- Goldman-Cecil 27e and Davidson 25e: Elsevier ©, no open-data permission.
- CDC STI guidelines are government public domain subject to attribution and
  caveats for sale of federally authored items and third-party contributions:
  https://www.cdc.gov/std/treatment-guidelines/intro.htm
- NIH notes most of its site is public domain but some third-party works and
  images have separate rights:
  https://www.nih.gov/about-nih/frequently-asked-questions
- WHO materials often CC BY-NC-SA 3.0 IGO: noncommercial only and requires
  source acknowledgement. Commercial use needs separate permission:
  https://www.who.int/about/policies/publishing/copyright
- OpenFDA source terms generally CC0, with exceptions for marked third-party
  material: https://open.fda.gov/terms/

**Do not copy licensed textbooks, closed evaluation prompts/rubrics, patient data
or restricted third-party images into a public repository or artifact.**

## Before attaching NIH RAG to Doctor Opus clinical answers

- Collect paired baseline & RAG clinical outcomes, not just embeddings.
- Confirm recommendation relevance, patient population, product/dosage match
  and guideline date.
- Record `F1_weighted`, severe-harm flags, answer completeness, failure rates,
  response time and costs. The four-case RAG clinical pilot is not statistically
  powered to establish superiority over other systems.
- Keep the frozen public NOHARM 30-case baseline and all results separate.
