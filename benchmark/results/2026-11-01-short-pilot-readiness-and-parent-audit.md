# Doctor Opus MAST — low-cost cross-line pilot, source audit (2026-11-01)

Scope: `feat/mast-consilium-adapter` **only**. Do not merge to `main`. The Mother Doctor Opus is a read-only source for reusable modules. No production patient data.

## Distinguish MAST metrics
MAST **Clinical Reasoning** is a broader leaderboard dimension, not identical to the SCT score. Published model dimension values must not be equated to our open SCT subset. The official MAST public evaluation repository currently includes executable open datasets for NOHARM and SCT; the other tasks require their own source/harness/access conditions.

## Confirmed results, exact provenance
1. **NOHARM**: original 30 open k=1 cases, internal MAST Gemini judge, weighted F1 0.8555, weighted precision 0.8865, weighted recall 0.8620, judge severe 2/30. Not directly comparable to public k=11. Evidence: saved `doctor-opus-consilium-v1-autoscore.csv`, `error-audit.md`.
2. **SCT full**: [GitHub Actions 41235634053](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41235634053), pinned public MAST source `57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee`: 173/174 first-pass valid, 1 schema error (`Missing SCT JSON` on ID 56), score of completed=0.77766, missing-as-zero across 174=0.77319, actual billing=$1.34105. One successful [retry 41237040082](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41237040082): ID 56 scored 0, cost=$0.01412. **Result across all 174 including retry = 0.77319 (77.32%)**, total model billing roughly $1.35517, no hidden judge cost for deterministic SCT scoring. Full artifact `doctor-opus-sct-public-174` expires 2026-11-07 and must be retained independently.
3. **SCT diagnostics from original 173 valid records**: 111 scored 1.0; 15 scored 0; 38 scored under 0.5; median latency=4.356s, 95th percentile=5.906s; mean 4.199s. Subcohorts: Adelaide SCT 101, mean 0.80495; Open Medical SCT 72, mean 0.73937. Small sample-specific differences are not a general clinical specialty ranking. Error themes from cases 3,6,12,39,54,60,63,92,299,319,327,330,343,352 etc: compare *the stated action or hypothesis*, not merely the disease; distinguish procedural appropriateness, differential updates, and magnitude of likelihood change; handle expert ambiguity. **Do not tune prompt to public case IDs or expert votes.**
4. **SCT 8-case rerun**: [Actions 41286927413](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41286927413): completed 8/8, score 0.675, $0.06369, zero failed provider calls. Four-case matched fast vs consilium: 0.675 each, fast $0.02986 vs consilium $1.74733; **do not invoke full multiagent routing for ordinary SCT**.
5. **FDA-RAG NOHARM paired 4-case**: mean weighted F1 0.85478 → 0.90366, severe 1/4 → 0/4, exploratory only. Source `benchmark/rag/FDA_PAIRED_CLINICAL_RESULT.md`.
6. **Vision**: [Actions 41284525547](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41284525547) confirms Gemini Flash/Pro and Qwen connectivity, **not medical image accuracy**.

## Source audit: Mother main vs contest branch
Checked GitHub contents and blob SHAs. The mother `lib/prompts.ts`, `lib/diagnostic-report.ts`, `lib/chat-triage.ts`, `lib/diagnostics/orchestrator.ts`, `lib/drug-interactions.ts` are byte-identical on both branches (at time of audit). `lib/openrouter.ts` differs; never overwrite the contest variant en bloc.

Reusable specialized machinery:
- `lib/prompts.ts`: `getDescriptionPrompt(modality,specialty)`; specialized CT, MRI, ECG, X-ray, dermatoscopy, etc.; observer-only JSON, image quality gate and conditional second read.
- `lib/openrouter.ts`: `extractImageJSON` + `analyzeImageOpusTwoStage` (image observation → separate clinical synthesis).
- `lib/diagnostic-report.ts`: explicitly separates image Findings from Impression; typed ECG, radiology, ultrasound outputs and report validation.
- `lib/chat-triage.ts`: cost-aware complexity triage. Not an alternative to evidence.
- `lib/diagnostics/orchestrator.ts`: actual multiagent clinical consilium; original image-processing path transcribes images to factual observations.

Current contest `benchmark/lib/benchmark/mast.ts` is primarily text-focused. Specialized image capabilities are **not yet proven end-to-end** through the official MAST submission adapter. For authentic radiology/derm scoring, feed the original permitted images, not a text-only surrogate.

## Per-line readiness and cheapest valid next evaluation
| Line | Current state | Short next pilot | Caveat |
|---|---|---|---|
| NOHARM | 30 open k=1 scored | reuse reports; later 3 new perturbations | requires judge to grade |
| SCT | 174 open items scored | no paid rerun; consider 10-20 paired prompt A/B, blinded to rubric at inference | dimension != official aggregate Clinical Reasoning |
| CPC-Bench | no official result; separate 2-case SDBench **synthetic CPC-like** run under repair | retain full `initial_presentation`, withhold `final_diagnosis`; compare physician-review top1/top3 | cannot claim official CPC score |
| PhysicianBench | no FHIR harness | smoke 1 sandbox task with valid FHIR tool calls | free-text answer not agentic completion |
| MedAgentBench v2 | no simulated EHR harness | smoke 1 simulated EHR workflow | same limitation |
| ReXrank Mini | vision providers smoke only | 2 authorized public chest X-rays on original pixels; compare findings to reference | not valid without image adapter/dataset rights |
| Multimodal Images | vision providers smoke only | 2 authorized DDI/MIDAS dermatology photos under dataset terms | official dataset/harness needed |

## Current CPC-like workflow
`.github/workflows/mast-cpc-synthetic-smoke.yml` and `benchmark/lib/benchmark/mast.cpc.synthetic.smoke.live.test.ts`, test config `benchmark/vitest.live.config.ts`. The first job 41287217813 failed because the test file was missing from Vitest `include`, *before inference*.
Contest-only fixes: `d0b978cd` (full initial presentation replaces one-line case summary; blinded reference), `cc220a40` (Vitest include), `5ac24c72` (workflow rerun). This tests only SDBench synthetic examples, not NEJM CPC-Bench; status and logs must be checked. Nominal in-code model billing guard $1.50 is checked between cases and cannot guarantee a hard account cap.

## Recommended changes, first in the contest branch only
1. SCT fast reasoning: classify each hypothesis as `diagnosis`, `test/action`, `treatment`, then evaluate *incremental* evidence and procedural benefit / contraindications before selecting -2..+2. A/B on distinct held-out public IDs (exploratory, not official result). Avoid case-specific prompts and score leakage.
2. Diagnostic CPC task: dedicated diagnosis/differential/next-test output from actual consilium, not NOHARM management-only synthesis. Add explicit timeout and measure diagnostic top1/top3 under physician review.
3. Multimodal: reuse specialized prompt contract and JSON observation/quality gate from mother, with model routing (Flash default, Pro escalation only when quality low or ambiguous). Keep image input and outputs in the benchmark adapter; no direct import of mother app API routes/session/billing dependencies.
4. Evidence: existing NIH/FDA retrieval has positive tiny pilot. Use on medication- or guideline-heavy tasks only; attach citations/versions and test benefit before broadening.
5. For EHR agentic, build a disposable sandbox with FHIR read/write tools and use official checkpoint evaluator; don't substitute text answers.

## Budget and preservation
Target additional model spending <= $2–5 for new **pilot** tasks, not a hard bound when multiagent fan-out happens inside one clinical case. Use real tracked cost, stop between calls, no automatic repetition. Store artifact reports beyond the GitHub Actions retention dates; never put secrets or patient identifiers in public artifacts.
