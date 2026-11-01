# Doctor Opus MAST — 10 real ISIC dermoscopy photographs, blinded pilot

Date: 2026-11-01. **Contest branch only**: `feat/mast-consilium-adapter`. Parent `main` unchanged.
Purpose: inexpensive end-to-end multimodal technical validation and root-cause identification, NOT a clinical sensitivity estimate, MAST score or Stanford DDI/MIDAS evaluation.

## Dataset and license
- Source: [ISIC 2016 Challenge Task 3 training](https://challenge.isic-archive.com/landing/2016/39/). The official challenge data page lists **CC0** for 2016; the ISIC v2 source API explicitly returned `CC-0` for each of the ten images. Original official 900-row training ground-truth CSV: `https://isic-archive.s3.amazonaws.com/challenges/2016/ISBI2016_ISIC_Part3_Training_GroundTruth.csv`.
- Deterministic SHA-256 seeded selection of five benign and five malignant labels, source image hashes, independent provenance and JPEG integrity verified in Python; **1,785,476 bytes total**. No full 600 MB archive, no registration, no DDI redistribution. No images uploaded with CI artifacts.
- The binary ground truth is ISIC 2016 public expert-consensus/pathology-supported `benign` vs `malignant`, not an individual histopathological record or a patient-level external validation set.
- All reference labels and ISIC IDs are withheld from Gemini and Claude during image interpretation.

## Trial 1: Original parent prompts, image-to-report chain, separate malignancy classification
[Completed GitHub Actions 41310069281](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41310069281), source preflight [41309884631](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41309884631).

Clinical pipeline: actual dermoscopic JPEG pixels → Gemini 3.8 Flash **independent visual observation JSON** → conditional Gemini 3.1 Pro second read when indicated → Sonnet 5.5 dermatology report using inherited parent prompts → Sonnet 5.5 explicit `benign|malignant|uncertain` class based on image-derived evidence alone.

| Metric | Value |
|---|---:|
| Processing completeness / API faults | 10/10, 0 API faults |
| Confirmed per-image license | 10/10 CC0 |
| Strictly correct (uncertain is NOT correct) | **7/10** |
| Malignant cases correctly classified | **3/5** |
| Benign cases correctly classified | **4/5** |
| False benign reassurance on malignant reference | **2/5** |
| Benign but uncertain | **1/5** |
| False-positive malignant class on benign reference | 0 |
| Conditional independent Gemini Pro reads | 4/10 |
| Total measured LLM cost | **$0.37659** |

Two incorrect malignant cases: `ISIC_0011125`, `ISIC_0001119`. In both, Flash described a symmetric globular/peripheral-rim lesion consistent with a benign nevus, was highly self-confident, and thus did **not** trigger Gemini Pro. Initial benign cases were not incorrectly classified malignant; one was explicitly uncertain.

## Trial 2: force independent Gemini Pro on exactly the two misses
[Completed GitHub Actions 41310685743](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41310685743): Original identical two source JPEG IDs, no diagnosis supplied to the models, forced independent Pro second visual read, same reporting/classification prompt.

| Missed malignant image | Original prediction | With forced Pro | Additional cost |
|---|---|---|---:|
| `ISIC_0011125` | benign | benign (still missed) | $0.04183 |
| `ISIC_0001119` | benign | benign (still missed) | $0.04602 |

**0/2 errors corrected** at an additional **$0.08786**. The failure is therefore not merely routing: two strong general-purpose VLM visual impressions remain misleading for these morphology patterns. Do not conclude the lesions are benign because two AI readers agreed.

## Trial 3: offline clinical triage on frozen ten observer JSON outputs
[Completed GitHub Actions 41311089385](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41311089385), **no additional model calls or costs**. Research-only `derm-risk-triage.ts` raises a specialist-review flag when a benign image prediction is accompanied by positive *peripheral globules/rim* findings with **no documented age or stability history**. The system does **not** change the observed benign class to a malignant diagnosis.

| Retrospective triage outcome | Value |
|---|---:|
| Reference malignant cases sent to clinician review | 5/5 |
| Reference benign cases sent to clinician review | 1/5 |
| Reference benign cases considered benign-appearing | 4/5 |
| Model diagnostic class accuracy | **still 7/10** |
| Additional model cost | $0 |

**CRITICAL:** This rule was developed *after seeing both errors*. The apparent 5/5 review sensitivity is **in-sample and optimistically biased**, not an independent validation or improvement to diagnosis accuracy. It needs a new, disjoint, patient/lesion-independent batch before any default activation.

## Mechanism and transferable lessons
1. The original parent `lib/prompts.ts` and two-stage imaging architecture reliably convert dermoscopic originals into structured evidence, but **high self-confidence cannot rule out malignant mimics**. Record explicit disagreements and false-negative classes; avoid unjustified reassuring language.
2. Both missed cases featured a regular peripheral globular/spitzoid-appearing morphology. Published clinical guidance notes that age, lesion evolution and anatomical context matter even with regular peripheral globules; [Lallas et al, 2017](https://pubmed.ncbi.nlm.nih.gov/28118479/) and [Melanocytic Lesions with Peripheral Globules, 2023](https://pubmed.ncbi.nlm.nih.gov/36892354/).
3. Conditional Gemini Pro escalation helps some abnormal X-ray cases but was **not sufficient** to resolve this dermoscopy failure. Better to compare a *dedicated dermoscopy model* trained on public CC0/CC-BY ISIC images against general vision models; no new default until independently tested.
4. A dermatologist should review high-risk/uncertain findings; image-only AI outputs should not be read as pathologic diagnosis or no-biopsy clearance.
5. Next experiment: **hold out a new ten-image selection** not used in tuning; preserve original prediction plus review triage, calculate class sensitivity, specialist-review sensitivity, false-referral rate, actual costs and 95% binomial uncertainty. Then expand to licensed DDI when authorized.

## Artifacts/code
- Source selection: `benchmark/scripts/fetch-isic-2016-ten.py`
- Baseline inference: `benchmark/lib/benchmark/mast.isic2016-ten.live.test.ts`
- Workflow: `.github/workflows/mast-isic2016-10-real-images.yml`
- Targeted A/B workflow: `.github/workflows/mast-isic2016-two-misses-second-read.yml`
- Experimental uncertainty gate: `benchmark/lib/benchmark/derm-risk-triage.ts`
- Offline replay workflow: `.github/workflows/mast-isic2016-risk-replay.yml`
- Exact raw observations/reports/class predictions/costs in run artifacts. Research-only, images not redistributed.

**Total measured LLM spend across ten-image baseline and targeted re-read: $0.46445.** Parent main remains untouched, no official MAST evaluation/registration, no private Stanford images.
