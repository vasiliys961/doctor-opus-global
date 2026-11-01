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
| Multimodal Derm | 2 CC BY-SA 4.0 Wikimedia dermoscopy cases workflow submitted | **Workflow run 41294018180 must be checked**, not an official DDI/MIDAS score | Authorized individual DDI/MIDAS access, comply with noncommercial research terms |
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
1. Finish/check two-case public dermoscopic source smoke; do not conflate Commons examples with DDI/MIDAS. Research terms for DDI require **individual registration**; do not share restricted patient images/artifacts or upload without authorization.
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
