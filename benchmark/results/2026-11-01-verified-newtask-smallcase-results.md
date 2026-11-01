# Doctor Opus Global — verified 2–5 case tests on previously untested tracks
Date: 2026-11-01. Independent contest branch `feat/mast-consilium-adapter`; no merge to `main`.

## Execution verified, not merely queued
All three existing GitHub Actions jobs were re-run with the newly attached benchmark tests. Each finished with conclusion `success`. Full public-model artifacts (not original Redivis images) are available from the runs.

| Job | Authenticated GH Actions run | Distinct new example count | Status |
| --- | --- | ---: | --- |
| Redivis sample index + up to five label rows | [41317866757](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41317866757) | Up to 5 rows/dataset | SUCCESS; no LLM calls |
| Official public PhysicianBench instructions + full consilium | [41304279185](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41304279185) | 2 tasks | SUCCESS; public instructions only, original FHIR inaccessible in this run |
| 3 Wikimedia thyroid sonograms + independent vision and reporting | [41294018180](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41294018180) | 3 images, A/B rerun | SUCCESS; original source JPEGs, not Stanford cine-clip |

## Redivis: what was actually fetched
Limited sample row reader (up to 5 rows, label columns only, values immediately discarded):
- CheXpert Plus: 5 original label rows accessed (one selected label column).
- INSPECT: APIError on table access; 0 label rows.
- DDI-2: APIError on table access; 0 label rows.
- Thyroid Cine-clip: one file-index entry with 36,418,794,716 bytes (~36.4 GB); **bytes not downloaded**.
- PhysicianBench: two file-index entries totaling 898,463,368 bytes (~898 MB); **bytes not downloaded**.
- No private Redivis images or patient text sent to external LLM. Authenticated data access is distinct from license authorization for third-party cloud inference.

## Actual public licensed ultrasound: baseline and anatomy-context A/B
Source: Nevit Dilmen, Wikimedia Commons, CC BY-SA 3.0. Source descriptive captions were withheld from models.
- `Thyroid_ultrasound_110314142256_1423520.jpg` (transverse thyroid).
- `Thyroid_ultrasound_110321165224_1657430.jpg` (thyroid nodule example A).
- `Thyroid_ultrasound_110322095404_0959360.jpg` (thyroid nodule example B).

### Baseline, no organ metadata
- 3/3 structured reports; 0 provider failures; $0.06860 total.
- Transverse: described poorly defined thyroid parenchyma, no discrete nodule.
- Nodule A: **incorrect organ localization**. Recast as superficial musculoskeletal / soft tissue echogenic interface, recommended radiography/CT.
- Nodule B: described solid hypoechoic nodule, irregular borders and punctate foci as suspicious, recommended full ultrasound/size-dependent FNA consideration.

### Anatomy-aware: only `examRegion='thyroid'`, never lesion label
- 3/3 structured reports; 0 provider failures; $0.07773 total.
- Transverse: reported **thyroid parenchyma not visualized**, hypothesized prior thyroidectomy/agenesis/atrophy without clinical history; significant potential overinterpretation.
- Nodule A: correctly constrained location to anterior neck/thyroid bed, but still did **not** establish a thyroid nodule; called curvilinear calcified structure of uncertain thyroid vs extra-thyroid origin.
- Nodule B: suspicious thyroid nodule described, two vision reads disagreed on laterality; reported that disagreement.
- Improvement in anatomical localization DOES NOT prove improved diagnosis accuracy. No pathology or expert per-image reference annotations, only source captions.
- Never interpret a simple occurrence of the string "nodule" as evidence that a nodule was detected: descriptions such as "no nodule" or "known nodules" are not positive findings.
- Keep both A/B reports for physician visual adjudication before defaulting to exam-region prompts.

Original A/B model output artifacts:
- [Baseline full reports in 41304279185? No; thyroid artifact is 41294018180](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41294018180) 
- `doctor-opus-public-dermoscopy-two` artifact latest attempts include folder `thyroid-ultrasound-public-three/`.
- Baseline no-region run artifact id `13091781340`; anatomy-context rerun artifact id `13092070426`.

## Actual published PhysicianBench tasks, full consilium (no FHIR dataset)
Source: `HealthRex/PhysicianBench@c7efa8fd5b1e4744ada50668efe4b7e84023cbb0`.
Tasks: `urinary_retention_workup` and `aortic_aneurysm_cad`, original instructions with MRN/staff fields redacted. No original clinical records or actual FHIR tools, no generated EHR orders.

Two full runs:
- First: 2/2 completed, 0 provider failures, $0.61446.
- Repeat with full answer artifact: 2/2 completed, 0 provider failures, $0.61982. Urology 134.04 seconds/$0.44054; cardiology 64.72 seconds/$0.17929.
- Both reports contain all five *keyword concepts* checked for each task. **This is heuristic topic coverage, not medical accuracy or official PhysicianBench pass@1.**
- Urology report appropriately states that the patient chart was not accessed; supplies conditional Foley/clot retention stabilization, CBI considerations, gross hematuria malignancy evaluation and follow-up.
- Cardiology report appropriately states source values are missing, BUT then asserts `CAC-positive subclinical atherosclerosis (CAC >0)` and recommends starting/intensifying statin therapy, even though the prompt contains no measured CAC or LDL values. This is an **unsupported clinical assumption** requiring correction.
- Clinical report artifacts: [PhysicianBench Actions 41304279185](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41304279185), artifact `doctor-opus-physician-style-two-fictitious`, attempt artifact id `13091656326`, folder `physicianbench-public-two-consilium/`.

## Next testable corrective actions
1. Add and unit-test a **known vs missing data** gate for lab/imaging quantities (CAC, aortic diameters, LDL, previous surgeries), and distinguish measured results from a mention that a test exists; test the SAME two physician tasks after correction.
2. Run independent ultrasound exam-region context as part of both Gemini reads, but treat unsupported surgical absence / thyroid atrophy conclusions as red flags requiring a confirming image/clinical history. Do not equate model confidence to morphologic accuracy.
3. Request physician image adjudication for the three source sonograms, with separate anatomy identification / lesion localization / finding correctness scores.
4. For Stanford original samples, preserve access/license enforcement. If third-party inference is not expressly permitted, use a different clearly licensed public image source instead of violating provider restrictions.
5. For real PhysicianBench pass@1, load the original ~898 MB gated FHIR container only in an authorized environment, use the authors' runner and original checkpoint evaluator.

This document deliberately distinguishes **completed inference**, **clinical interpretation quality**, and **official benchmark validation**. No `main` modifications.
