# Doctor Opus MAST — cross-line inexpensive pilot update (2026-11-01)

**Contest-only branch:** `feat/mast-consilium-adapter`. **Never merge to parent `main` automatically.** Working baseline frozen at `cf6065ca9b9a2f6d84d396fc027eb1f464b6fbed`.
All values are internal or research smoke, **not independent official MAST leaderboard scores**.
Reference: [official MAST benchmarks](https://www.arise-ai.org/mast/benchmarks) and parent [system roadmap](../DOCTOR_OPUS_MAST_SYSTEM_ROADMAP.md).

## Seven-line current capability matrix

| MAST line | Best CURRENT EVIDENCE | Data/status | Required for comparable MAST participation |
|---|---|---|---|
| NOHARM | 30 open k=1; weighted F1 0.8555, 2 judge-severe cases | Genuine public NOHARM scoring, internal protocol | Official equivalent k=11 and private independent evaluation |
| SCT | full public 174-item fast route, 0.77319, ~$1.355; V2 prompt A/B 20 cases 0.740 vs retained 0.770 | Genuine SCT public format; NOT whole consilium | Validate current *candidate* frozen routing; official evaluator |
| CPC | 4/4 leading diagnoses on distinct Microsoft SDBench SYNTHETIC presentations; direct Sonnet one-round: 96–124s and zero provider errors | Synthetic task format only, not official CPC/NEJM | Obtain licensed NEJM-CPC material or independent organizers' eval |
| ReXrank Mini | 2/2 genuine CC BY 4.0 pediatric chest radiographs processed; reports generated for both | Correct actual-pixels visual pipeline, source **not ReXrank** | Obtain actual ReXrank-allowed images, blinded clinical reporting, independent grading |
| Multimodal Derm | 2 CC BY-SA 4.0 real Wikimedia dermoscopy images analyzed for $0.05891 | Clinical smoke 2/2 reports, not DDI/MIDAS score | Authorized individual DDI/MIDAS access, comply with noncommercial research terms |
| MedAgentBench v2 | 2 synthetic FHIR-like multistep tasks; Sonnet 2/2, $0.03087; Gemini Flash 1/2, $0.01032 | In-memory FHIR-like sandbox, no actual hospital FHIR server | Official 300-task FHIR R4 simulated hospital harness and pass@1 scoring |
| PhysicianBench | Same generic synthetic FHIR-like tool loop is a preliminary tool-action smoke only | **Not tested on PhysicianBench at all** | EHR Docker image under permitted Stanford Redivis access + verified checkpoints |

## Exact source paths and performed experiments

### Radiology — actual images, not a text-only substitute
- Contest-only source: `benchmark/lib/benchmark/medical-vision.ts`, API: `benchmark/app/api/benchmark/vision/route.ts` (Bearer token, no request persistence). Reuses mother Doctor Opus modality-specific observers `lib/prompts.ts` and radiology structured report conventions.
- Two original JPEGS: `probml/chest_xray_kaggle` @ `551b993d5dcaec27a1f1bbbcbca2ff4968a28e07` (Kermany et al, Cell 2018, CC BY 4.0); one labeled NORMAL, one PNEUMONIA (category is never sent to the image model).
- [Run 41293399651](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41293399651): 2/2 successful image-to-report API calls, total $0.04123; 12.274 and 15.918s; zero unpriced calls.
- The PNEUMONIA-category original first-pass report emphasized marked cardiothymic enlargement / cardiomegaly and diffuse perihilar findings. That is a **potential clinical interpretation error** and cannot be called successful pneumonia detection.
- Add independent Gemini 3.1 Pro second read when structured `critical_flags` nonempty despite confident Flash; preserve independent JSON observations instead of hiding disagreement.
- [Run 41293790463](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41293790463): 2/2 reports generated, $0.05879; normal ~12.3s without second read; abnormal ~22.9s with second read, models Flash+Pro. Second read described bilateral granular / reticulonodular opacities with air bronchograms and pneumonia in its differential, but did **not** confirm the earlier severe cardiomegaly claim. **This is not a physician-verified accuracy score**, only improved handling of contradictory observations.
- The source is not ReXrank: **never report the above as a ReXrank score**. Reference labels are simplistic, not a full expert radiology report.

### Tool actions / FHIR
- `benchmark/lib/benchmark/synthetic-fhir-agent.ts`: isolated in-memory pseudo-FHIR Observation → draft ServiceRequest / urgent Flag tool-loop, using the real LLM tool-decision outputs, no production patient data or real orders.
- [Run 41293528418](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41293528418) Gemini 3.8 Flash: hyponatremia 3/3 draft orders, but malformed terminal action; hyperkalemia case failed due malformed output. 1/2 checkpoints, $0.01032, 2 format errors.
- [Run 41293733206](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41293733206) Sonnet 5.5: 2/2 tasks completed, no agent format errors, $0.03087; 9.02s and 8.56s. Case 1: serum osmolality, urine osmolality, urine sodium. Case 2: ECG, repeat potassium, urgent clinician flag.
- **Critical limitation:** This is synthetic, no HTTP-based FHIR R4 simulator yet; not MedAgentBench or PhysicianBench.

### CPC / candidate default
- Multiagent timeout root cause identified: `anthropic/claude-fable-5.1` timeout twice per case; 1-round direct Sonnet on 2 matched synthetic cases ~123.7 and 108.9s, 0 failed calls, $0.72494. Two further previously unused synthetic cases 114.2 and 96.7s, zero failed calls, $0.77389. All 4 leading diagnoses matched synthetic reference by manual response comparison; not official CPC score.
- By request, contest-only clinical debate default switched from Fable to **Claude Opus 5.5**, with Sonnet 5.5 fallback (`benchmark/lib/diagnostics/roles.ts`), and a regression test. The specific Opus 5.5 candidate has **not yet been clinically re-benchmarked**; preserve successful Sonnet candidate for comparison.
- The parent `main` is unchanged. Vercel production is older; GitHub Actions executes new branch tests irrespective of Vercel deploy quota.

## To-do — next economical and true-benchmark gates
1. Check clinical correctness and error categories of two-case public dermoscopic source smoke; do not conflate Commons examples with DDI/MIDAS. Research terms for DDI require **individual registration**; do not share restricted patient images/artifacts or upload without authorization.
2. Run ONE licensed dermatology case set and 2 genuine ReXrank cases once source access/rights are verified. Keep original source image, model JSON, final report, blinded expert scoring; avoid reference leakage.
3. Move from **in-memory pseudo-FHIR** to public MedAgentBench v2 actual FHIR R4 server/harness, and to PhysicianBench only when its separately licensed Docker image is accessible. Patient records must be authorized and outputs kept per license.
4. Official CPC samples need NEJM rights; Microsoft SDBench synthetic cases are training/dev smoke, not a clinical-performance measurement.
5. E2E MAST submission test: new candidate Opus 5.5, compatibility/format checks, concurrency 5–10, p95 <300s, test zero-retention for organizer private inputs.
6. Update public cost and quality dashboards only from completed, source-linked results.

## Licensing
- Pediatric chest radiographs: [Kermany dataset source](https://github.com/probml/chest_xray_kaggle) — CC BY 4.0 attribution.
- Wikimedia dermoscopy images: license CC BY-SA 4.0, credit Philipp Tschandl and Dermanonymous, linked in `benchmark/lib/benchmark/mast.derm-public2.live.test.ts`.
- Restricted DDI: [Stanford Research Use Agreement](https://ddi-dataset.github.io/). Re-distribution prohibited; do not use unregistered copies.
- NEJM CPC: source licensing for actual benchmark cases; Microsoft SDBench synthetic cases are openly redistributable and **not suitable for reported diagnostic-performance claims**.

### Public dermoscopy — completed research smoke
- [GitHub run 41294018180](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41294018180): CC BY-SA 4.0 photos, 2/2 image-to-report completed, cost **$0.0589065**. Benign nevus 13.396 s, Flash-only, report favored a benign melanocytic nevus. Melanoma-source photo 27.807 s, Flash + conditional Pro; report listed amelanotic/hypomelanotic melanoma as a crucial diagnosis not to miss, acknowledged limited image quality and suggested low threshold for biopsy. **No official histopathology-grade performance estimate**, no DDI/MIDAS access. Attributions: Philipp Tschandl and Dermanonymous (Wikimedia Commons).
- Candidate Claude Opus 5.5 replaced Fable only in contest debate configuration: live one-case SDBench synthetic diagnosis [workflow 41294260683](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41294260683). **Started; score, latency and cost must not be claimed until run is complete**.

## Verified genuine-source follow-up — 2026-11-01

This section supersedes earlier *"not yet official dataset"* notes where an authentic public source was subsequently obtained. **All measurements here are development pilots, not an independently submitted MAST score.**

### Claude Opus 5.5 vs Sonnet 5.5 (CPC-like)
- [Opus 5.5 run 41294260683](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41294260683) on public SDBench synthetic case 1: 128.767 seconds, $0.51606, 0 provider errors, correct top diagnosis: adrenal pheochromocytoma. The hereditary RET component was **not confirmed** from the vignette alone.
- The same synthetic case under [direct Sonnet 5.5 run 41290919053](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41290919053): 114.199 seconds, $0.38668, 0 provider errors, correct top diagnosis. **Do not claim an Opus accuracy advantage based on this single case.** Opus consumed ~$0.12938 more, with ~14.6s more latency.
- Original NEJM CPC-Bench clinical scoring still **unavailable** without appropriately licensed data; the Microsoft SDBench authors themselves state synthetic cases must not be used for true diagnostic performance reporting.

### AUTHENTIC ReXrank IU X-Ray dataset — first two original studies
- The actual test IDs `CXR3030_IM-1405` and `CXR3673_IM-1828` were selected from `rajpurkarlab/ReXrank` @ `0a18a41e580992ac7cd32a8a9463009654f0d390`, with original two-view images from IU Open-i noncommercial mirror `dz-osamu/IU-Xray` @ `ba02a24d9f206782c2b1ec8ae24e4009022ae1ff`. Reference reports were hidden during inference. No source image data was uploaded as an artifact.
- [Single-read test 41300901691](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41300901691): 2/2 reports, original 4 images, $0.04226, 13.804 and 16.207 seconds; both include Findings/Impression. Descriptive lexical token F1 vs original reports: 0.1429 and 0.1489; **this is NOT a clinical accuracy metric or official ReXrank score**.
- [Independent Gemini 3.1 Pro second-read 41301345527](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301345527): 2/2 reports, $0.06616, 15.132 and 21.245 seconds; descriptive lexical F1: 0.1719 and 0.1932. The second-read report on the left-midlung opacity explicitly discusses nodule/mass vs consolidation, viewer disagreement and follow-up CT; baseline emphasized infection, with tumor concern only implicit in follow-up.
- Watch the NORMAL reference: both passes also reported a right calcified hilar focus absent from the short reference. This is **a possible extra finding**, not automatically a hallucination without physician image adjudication. Do not label true-positive/false-positive on text alone.
- Formal clinical-radiology metrics GREEN, RadGraph, CRIMSON and separate radiologist adjudication remain outstanding.

### Genuine MedAgentBench v2 data AND authors' disposable FHIR test hospital
- Source: `ericoericochen/medagentbenchv2` @ `46c93f39bd8679af35790eaaa5dd41bc067024a0`, Docker `jyxsu6/medagentbench:latest` started on GitHub Actions (authentic FHIR R4 backend).
- [Basic 2-task pilot 41300632403](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41300632403), public `test_data_v2.json`: MRN lookup and age calculation, **2/2**, $0.00514, 2.59s / 2.25s. Exact-answer custom scorer (author data but not author scoring code).
- [Advanced 2-task pilot 41301246193](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301246193), newer `new_patient_tasks.json`: 6-hour/12-hour heart-rate averages on real FHIR Observations, **2/2** by UNMODIFIED `src.medagentbenchevals.new_refsol.task3`, $0.00508, no model failures.
- [Clinical action 2-task pilot 41301962769](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301962769), `new_patient_tasks.json`: EHR procedure retrieval and actual disposable FHIR `ServiceRequest` for CT abdomen/pelvis follow-up, **2/2** by UNMODIFIED `src.medagentbenchevals.new_refsol.task1`, $0.01481, 5.376s / 3.859s, no model failures.
- An earlier action-run [41301562564](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301562564) generated correct 2/2 FHIR orders but its grading step crashed due to an upstream `extract_posts` off-by-one bug (evaluating a final `POST request accepted` history item as a new POST). The workaround appends one empty boundary event to the scorer history in our own scoring wrapper, **without editing the official author grader or FHIR action payload**. Both tasks then passed in the verified rerun.
- **Aggregate narrow probe: 6/6 public tasks, four via authors' own per-category evaluator functions.** Not representative of 300-task MedAgentBench v2, no whole-benchmark pass rate, and not PhysicianBench.

### Official MAST endpoint — 10 parallel HTTP requests
- [GitHub Actions 41301851356](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301851356), `benchmark/scripts/mast-http-10-parallel.mjs`: 10 simultaneous authenticated `text/plain` SCT-style requests through the actual local Next.js `/api/benchmark/mast` endpoint.
- Result: 10/10 valid structured answers, 0 failures, 4.419 seconds wall time, p50=2.393 seconds, p95=4.397 seconds, max=4.397 seconds. The script does not surface API usage costs; **no USD amount is claimed** for this load test.
- This validates **fast SCT** HTTP concurrency *only*. It does not prove 5–10 concurrent **multiagent NOHARM/CPC** requests meet 300 seconds or establish that the Vercel deployment currently points to this latest branch. Vercel automatic deployments remained rate-limited and unchanged during these GitHub tests.

### Still outstanding / hard blockers
- **True CPC-Bench**: clinical NEJM inputs are licensed; the Microsoft SDBench public synthetic tasks explicitly cannot establish real diagnostic accuracy. Need permitted cases plus official diagnosis rubric.
- **PhysicianBench**: 100 long-horizon tasks / 670 verified checkpoints, but its original FHIR Docker archive is distributed through Stanford Redivis with dataset access rules. Our MedAgentBench FHIR Docker is NOT an equivalent substitute.
- **Multimodal DDI/MIDAS**: 2 genuine public dermoscopy examples have been smoke-tested but Stanford DDI registration and its official image grading are separate.
- **NOHARM current Opus candidate**: frozen 30-case 0.8555 is the PREVIOUS consilium version. The new Claude Opus 5.5 default has not been re-evaluated on a comparable NOHARM k=11 protocol. Those original scores cannot be assigned to the new model.
- **RAG**: FDA/NIH pilot positive only on tiny open subset; robust independent clinical improvement unproven.
- **Privacy**: all FHIR EHR test cases and source images are public/synthetic researcher-permitted samples. Do not cache or publish independent PRIVATE MAST input/output when submitted.

### Prioritized next actions
1. Test new Opus 5.5 candidate's clinical safety on independent NOHARM variants and adjudicate serious previous flags.
2. Add consistent radiology lesion differential and conditional second-reader triggers; independently adjudicate both images before treating textual similarities as clinical accuracy.
3. Expand MedAgentBench v2 to distinct clinical action categories using the AUTHORS' grader with a fixed, limited budget.
4. Acquire PhysicianBench and DDI access through their required research workflows and test true original data without copying restricted records into public GitHub artifacts.
5. Complete full-consilium 5–10 concurrency test and official MAST submission endpoint check once deployment is permitted.
