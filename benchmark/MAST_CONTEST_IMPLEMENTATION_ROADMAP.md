# MAST CONTEST — independent Doctor Opus implementation roadmap
**Created 2026-11-01. Owner branch:** `vasiliys961/doctor-opus-global@feat/mast-consilium-adapter`. **Permanent independent competition branch. NO merging into main.** Other repositories are read-only sources. No production / Vercel changes.

## Principles

- Reuse the *contracts and verified mechanisms*, not arbitrary copies of full apps or competitor weights.
- No claim of official leaderboards without same source set, pinned evaluator, judge and k/n.
- Never pass benchmark labels or expert diagnoses into the model prompt; log version, source, sampled IDs, original reference only in local adjudicator.
- Clear separation between `clinical_input`, `source_provenance`, `machine_observation`, `independently_validated_evidence`, `working_diagnosis`, `action`, `not_assessed`.
- Any `normal` or `no finding` must refer to anatomical and temporal coverage actually reviewed; missing frames do not mean no pathology.
- Keep free-text reports independent from actual FHIR actions. Original graded tool calls and clinically verified outcomes define agentic success.
- Prioritize physician review for critical failures (harm, missed malignancy, hallucinated tests); do not optimize F1 alone.
- For any cloud data: access-level != AI transfer rights. For restricted Redivis sources run only authorized code; do not upload images to OpenRouter/Claude/Gemini absent permissions.
- Budgets: per-example usage, global spend guard, p50/p95 latency, failed/unpriced calls, 300s hard deadline with margin.
- Any borrowed competitor design is reimplemented from public descriptions or properly licensed source, never copied from inaccessible proprietary code.

## Seven MAST lines — reproducible pilots, stop conditions and acceptance

| Track | Current real evidence | Next 2–5 cases | Main comparison metrics / release gate |
|---|---|---|---|
| First Do NOHARM v2 | Old consilium: 30 base k=1 F1w 0.8555; two serious harm judge flags. New Opus 5.5 1 known case only, label-grounded reviewer positive there | 3–5 distinct *new* open harm/control cases with original scorer, then full 30 x k=11 | F1weighted, severe rate, missing safety action, over-treatment, extra cost; evaluate revised outputs, DO NOT assign old score to new Opus |
| SCT | 174/174 public fast route, 0.77319; 20-case prompt V2 degraded 0.770 to 0.740 | 4–5 new open examples fast vs bounded evidence routing | Expert-distribution SCT score; do not change baseline unless paired improvement |
| CPC | 4 synthetic SDBench leading diagnoses correct | 2–3 true rights-cleared NEJM/official CPC if accessible; otherwise synthetic *technical only* | Top1/Top3, urgent next step, differential omissions, 300s deadline; original CPC scorer required |
| MedAgentBench v2 | 6/6 selected real FHIR tasks, 4 author-graded | 3–5 new tool-action categories, reset FHIR state | Original pass@1/action state, no repeated writes, EHR audit, cost |
| PhysicianBench | 2 original public task instructions via consilium; no authentic FHIR execution | 2–5 original tasks on authorized Stanford ~898MB FHIR Docker and original checkpoints | Pass@1 per checkpoint; instructions-only NOT success |
| ReXrank Mini | 2 original IU Xray studies with four real views; lexical F1 ~0.14–0.19 | 3–5 unused licensed image+reference pairs | GREEN/RadGraph/physician adjudication, correct side/view, source evidence, hallucinations |
| Multimodal dermatology DDI/MIDAS | 10 ISIC, 7/10 binary, 2 malignant false benign; 2 public Commons images | 3–5 distinct pathology-anchored images (DDI/MIDAS only when cloud license grants) | Malignancy sensitivity, specificity, calibration, subgroup fairness, source masks |

## Additional cross-track image/electrophysiology coverage

1. **ECG Opus (preferred, not ecgdeli):** source `vasiliys961/ecg-opus-global`. Image/PDF/text -> Gemini 3.8 Flash -> Opus 5.5 report. Raw 8–12s 12-lead -> **ECGFounder 150 model scores** + NeuroKit measurements -> independent cardiology summary. Raw samples stay local. Original published ECGFounder weights are NOT in GitHub; must be explicitly provided/verified before real digital model inference. Preserve signal units. The 531 feature model is a separate deprecated research path, **NOT** a default bridge. Test 2–5 source ECG images + 2–5 digital PTB-XL signals if source weights/permissions available; report separate method accuracy vs error classes. ECG is not an eighth official MAST track, it contributes to images, clinical reasoning and safety.
2. **Parent comparative mode:** `app/comparative/page.tsx`, `app/comparative/video/page.tsx`, `app/api/analyze/video-comparison/route.ts`, `app/api/analyze/comparative-triage/route.ts`, `lib/video.ts`, `lib/openrouter.ts`. Distinguish `temporal` (repeat date), `position` (different position), `projection` (AP/PA/lateral etc) and `general`. Every image must actually reach vision, no comparator-only text; source image roles/dates remain explicitly linked. Do not infer progression from two different projections or artefact changes. Refuse to claim quantitative change without scale, registration or equivalent acquisition protocol.
3. **Sono:** `vasiliys961/ultrasound-scanner` Brain1 evidence IDs, Brain2 proposals + deterministic arbiter, quality gate, confirmed body region. Thyroid's previously tested A/B 3/3 generated but incorrect organ/lesion conclusions remain a known failure. 2–5 new licensed ultrasound examples with expert frames.
4. **Radiology:** `vasiliys961/opus-radiology-ai` genuine detector outputs + source-bound native DICOM/CT/MR frames, Gemini batch review + Opus reconciliation. Existing single CLN original tumor Dice ~0.814 is a **detector** result, not MAST image score. 2–5 public CT + 2–5 MRI cases with expert labels; compare independent observer, model detector and synthesis. Never assume sampled 4 frames cover full scan.
5. Add new tests for MURA MSK xray, EchoNet ultrasound video, retinal/OCT, histology when licensed; both critical positives and negatives. Do not confuse repeated views of one subject with independent cases.

## Integration architecture (contest only)

```
image / DICOM / video / original 12-lead / document / EHR
  → intake / known modality + organ + view/date/position + source hash
  → technical quality + coverage gate
  → specialist source model (Sono, ECGFounder, actual Radiology detector) [optional]
  → independent structured Gemini image observations with frame IDs
  → evidence ledger (observed / inferred / unknown / conflicting / not_assessed)
  → organ arbiter: reject claim with no observed source / record uncertainty
  → clinical consilium (specialty route + challenger + safety reviewer + verifiable RAG)
  → conditional plan / clinical report / FHIR tool action as applicable
  → original benchmark grader + physician review + provenance & spend summary
```

Do NOT migrate proprietary competitor internals; imitate broad patterns: evidence-backed retrieval (AMBOSS LiSA/OpenEvidence), prioritized differential (Glass), medication contraindication and dose-action reviewers; independently test all ideas.

## Ordered implementation milestones

- **M1** — pure typed `evidence-ledger` covering modality, source, coverage and abstention, unit tests; import Sono arbiter principle.
- **M2** — contest comparative adapter for 2–3 images by date/view/position: independent originals, no label leakage, metadata- and coverage-aware comparison, with regression on parent historical 'only first image sent' bug.
- **M3** — ECG Opus bridge for source image + actual 12-lead digital structured report; verify required 150-class weights and signal measurement units; forbid raw→531 claim; 2–5 public images, 2–5 digital where ready.
- **M4** — CT/MRI specialist bridge from Opus Radiology original source-bound evidence, isolated worker; test masked positives and negatives.
- **M5** — clinical fact inventory of known/unknown numbers, pharmacy source RAG + drug–disease constraints, re-evaluate NOHARM/PhysicianBench.
- **M6** — authentic FHIR PhysicianBench gated runner + broaden MedAgentBench categories; maintain independent harness.
- **M7** — 2–5 examples per seven original tracks, then 30/174/300 and MAST live endpoint at 5/10 concurrency; record performance, failures, cost, case-wise error categories.

### Release gates
- Unit/contract tests pass and no source metadata or labels leak into prompts.
- Genuine original inputs processed, artifacts and responses actually inspected.
- Do not equate CI success, keyword overlap or a single image with diagnosis accuracy.
- **Diagnosis presentation policy:** the mother Doctor Opus intentionally reasons in differential diagnoses and only selects a *most probable working diagnosis* when it generates the clinical protocol. Preserve this principle. For MAST CPC or an explicit single-best-label task, expose one leading *provisional* answer with its evidence and alternatives; for NOHARM/PhysicianBench retain the action-first question and uncertainty. Lack of an unequivocal assertion is NOT itself a model error; actual wrong ranking, absent critical differential or unsafe management must be judged against the task and ground truth.
- For any comparative item, source IDs, matching modality and study, ordered dates and projection differences must be explicit.
- No modification or merge to `main`. Competition branch is independent permanently.


## 2026-11-01 cost-first CPU-only policy and nonblocking detector handoff
**Contest only; NEVER change the independent parent Opus Radiology AI main.**
- Automatic GPU/GPU fallback = 0; no new original weights downloaded or cached in a Vercel function. Any CPU worker must already be authorized, available, model-SHA verified and able to cancel its own subprocess.
- Eligible **candidate** non-GPU specialists: original digital ECG Opus NeuroKit (no model weights); genuine original NIH XRV DenseNet121 CXR (~28 MB weights, original CPU process and RAM still need worker validation); preexisting real-HU CT measurements with already source-registered masks (not a pathology detector). CT/MR 3D segmentation and all high-memory workers are **disabled** by default. Source modules: \`benchmark/lib/benchmark/cpu-only-detector-policy.ts\`, \`lightweight-xray-cpu.ts\`.
- \`runNonBlockingCpuPair\`: start independent Gemini/Opus vision and optional original CPU inference *simultaneously*. Absolute CPU detector deadline **8 seconds**; after vision ready, at most **1.5 seconds extra** to wait for optional detector. On detector crash, timeout, missing weights or missing worker: abort pending worker call, mark detector UNASSESSED, proceed with actual source vision to existing parallel-specialist \`runConsilium\`. No costly substitute model or GPU work is triggered by detector timeout. Original worker must itself enforce child-process termination; HTTP abort is not a proof that external subprocess stopped.
- \`runUnifiedClinicalChat\` now accepts \`chest-xray\` studies and server-only injected original CPU worker, but in default Vercel API **no worker is configured**; therefore it runs Gemini/Opus + specialists only, without importing Torch/ONNX or model weights into Next.js. Original XRV output only admitted after published SHA + actual PNG pixel SHA + six-head schema validation, as **uncalibrated hypotheses**. No specific official MAST benchmark score from these additions.
- Tested hanging CPU, missing original CPU and fast original CPU fixtures plus GPU-disable policy: regression contract suite **31/31 success** at run [41334891882](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41334891882), Next standalone build **success** run [41334891904](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41334891904), both on commit \`4879e66f...\` (later minor grace-timeout cleanup requires new CI). Unit tests use synthetic worker outcomes; NO claim of real XRV inference in deployed Vercel.
- Remaining cost/performance gate: measure p50/p95 total MAST request end-to-end (including Gemini, Opus and original consilium) against **300-second** hard external benchmark; current sub-second/stuck-worker unit tests prove only detector nonblocking behavior, **not** total latency under concurrency. Limit 5–10 active requests with queue/admission control, no unlimited model escalation. No paid GPU.
