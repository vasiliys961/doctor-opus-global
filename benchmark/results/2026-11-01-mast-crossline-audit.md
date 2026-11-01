# Doctor Opus MAST — cross-line pilot audit (2026-11-01)

Branch: `feat/mast-consilium-adapter` only. Do not merge into `main`.

## Verified baseline
- NOHARM original open 30 k=1 cases: weighted F1=0.8555; weighted precision=0.8865; weighted recall=0.8620; judge severe=2/30. Original reports saved externally as `doctor-opus-consilium-v1-autoscore.csv` and `error-audit.md`. These are NOT directly comparable with leaderboard k=11.
- SCT paired 4 open questions, full consilium versus fast:
  - Fast=0.675, consilium=0.675; four ties, zero wins/losses.
  - Cost: fast $0.02986 / consilium $1.74733; average latency 4.17s / 106.23s.
  - [GitHub Actions 41284175472](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41284175472).
  - Implication: do not use full consilium by default for SCT.
- Prior progress report: SCT fast 174/174=0.7732 at $1.36 and SCT fast 8/8=0.675 at $0.056. These figures were recovered from the earlier work history; their original full-run artifact is not independently re-read in this audit.
- FDA RAG paired full-consilium 4 perturbations: F1 mean 0.85478 -> 0.90366, severe harm 1/4 -> 0/4; small exploratory sample only. [Source report](../rag/FDA_PAIRED_CLINICAL_RESULT.md).
- NIH guideline E5-small index: 354 chunks, ~30s, retrieval probes 5/5. [Source report](../rag/NIH_SPEED_REPORT.md).
- Three vision providers connected successfully on synthetic non-medical diagram (NOT radiology accuracy). [Source report](./2026-11-01-vision-provider-smoke.md).

## Fresh smoke tests requested this turn
1. Existing 8-case SCT fast pilot re-triggered by workflow-only commit `86f277b2` (before recovering prior result). Cost guard: $2 configured, enforced BETWEEN cases, not strict ledger cap. Results unverified; do not treat commit as a completed run.
2. Two CPC-like initial-presentation cases using openly redistributable Microsoft SDBench **synthetic** dataset; created test `benchmark/lib/benchmark/mast.cpc.synthetic.smoke.live.test.ts` and workflow `.github/workflows/mast-cpc-synthetic-smoke.yml` (commit `5225b980`). Cost guard: $1.50 checked BETWEEN cases. Results unverified. Only case_summary is sent to Doctor Opus: never full_text, case_title or final_diagnosis. Saved output includes offline reference diagnosis for physician review. This is NOT CPC-Bench, not an official score, and synthetic cases cannot be used for comparative clinical performance claims.

## Remaining true MAST lines
- CPC-Bench: licensed NEJM CPC case material and task-specific scoring needed. Official comparator cannot be inferred from synthetic case responses.
- PhysicianBench: requires a FHIR clinical record server, EHR read/write tools and checkpoint validation. A text answer alone is not an agentic pass.
- MedAgentBench v2: requires external EHR tool harness, not simple management answer.
- ReXrank Mini: requires medical chest X-ray images under dataset access terms and image input path; synthetic diagram connectivity is not accuracy.
- Multimodal dermatology: requires licensed/eligible DDI or MIDAS images, multi-image adapter and expert reference.
- NOHARM: completed initial internal baseline; open perturbation sweep and external independent evaluation remain.

## Next engineering steps
- Verify workflow runs/artifacts from commits `86f277b2` and `5225b980`; keep costs and completion statuses explicit.
- Recover 174-case SCT original artifact and pin provider/model configuration.
- Build image adapter for legitimate ReXrank/DDI public samples in the contest branch; measure actual medical image performance.
- Build sandbox-only FHIR tool adapter for agentic smoke; do not connect any live clinical database.
- Verify the official MAST API endpoint schema and 300s deadline before submission.
- Do not modify mother Doctor Opus `main` or clinical production configuration.

Official references: https://github.com/ARISENetwork/mast ; https://cpcbench.com/ ; https://github.com/HealthRex/PhysicianBench ; https://github.com/rajpurkarlab/ReXrank .
