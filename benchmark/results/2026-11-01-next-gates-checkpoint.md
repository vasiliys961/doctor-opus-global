# Doctor Opus — benchmark continuation checkpoint (2026-11-01)

**Branch:** `feat/mast-consilium-adapter`. **Parent `main` remains read-only.**
This document is an evidence-based execution checkpoint, **not** a new benchmark score.

## Current verified coverage and reproducibility

| Domain | Verified pilot | Important limit | Next evaluation gate |
|---|---|---|---|
| NOHARM | Previous 30 public cases k=1: weighted F1 0.8555, 2 judge-flagged severe. New Opus 5.5: one known All001 case, weighted F1 0.9697, severe 0 | Different candidate and sample; not comparable | Prespecified new public cases and original rubric; clinician review of grade-3 nivolumab reactions |
| SCT | Fast 174 items: 0.77319. Four paired full-consilium cases tied at 0.675. Prompt V2 on 20 overlapping cases: 0.740 vs 0.770 | Neither improvement nor full-system score established | Holdout stratified by diagnosis/test/treatment; paired original scoring |
| CPC | SDBench synthetic 4/4 leading diagnoses; Opus and Sonnet tied on one selected case | Not NEJM CPC-Bench | Legitimately licensed cases; blinded top1/top3 and management adjudication |
| ReXrank | 2 actual IU-Xray reports, one vs independent second read, lexical F1 improved on both | Lexical overlap is not radiology accuracy | Original ReXrank metric + radiologist verification of lesion claims |
| Dermatology | 2 genuine licensed images through full image-to-report | Not DDI/MIDAS or pathology-graded accuracy | Source-permitted pathology-anchored ISIC cases |
| MedAgentBench v2 | 6/6 selected public tasks; 4 author-grader checks, genuine disposable FHIR server | Tiny selected subset, not full 300 | New task categories, unmodified grader, idempotent writes |
| PhysicianBench | 2/2 notes saved on fictional EHR after tool schema fix; 12/12 heuristic checklist items | Not original Stanford EHR/checkpoints | Licensed source acquisition and original checkpoint grader |

## Immediate evaluation protocol

1. **Freeze candidate identity.** For every next run, log exact benchmark commit, branch SHA, model IDs, prompt hashes, case IDs, source revision, grader revision, costs and API errors. Do not interpret historical metrics as current Opus scores.
2. **Safety first, before optimizing F1.** Evaluate contraindicated drug-condition combinations, route/dose, explicit avoidance vs conditional action and omitted future obligations. Track individual unsafe recommendations. Clinical adjudication takes priority over an automatic zero-Severe judgment.
3. **Test action conditionality explicitly.** Separate recommended-now, only-if, avoid, defer and informational statements. Example failure classes from old public NOHARM: Derm001 (tretinoin and IIH), Endo007 (conditional cabergoline interpreted as prescription), Card002 (future anticoagulation with cardioversion). Treat these as development cases, never heldout tests.
4. **Budget the full-consilium run.** Record p50/p95/end-to-end deadlines and failures at 5 and 10 simultaneous requests, separately for SCT fast and slow NOHARM/CPC. Prior fast SCT HTTP run achieved 10/10; that does **not** validate full consilium at 10 concurrent.
5. **Preserve independent radiology observations.** Image reader A and B should each see original pixels without the other reader's diagnosis. Log disagreement, final report and image-specific clinical adjudication before considering a metric improvement.
6. **Evidence retrieval A/B.** On fresh cases, test source-grounded FDA/NIH RAG vs the same prompt without retrieval. Evaluate harmful recommendations, important omissions and unsupported sources; do not infer improvement from the prior four-case FDA result.
7. **No private MAST retention.** Save only public permitted source data and derived artifacts. Keep original private organizer test inputs/outputs out of persistent logs/artifacts.

## Explicit non-promotion criteria

- No promotion of SCT V2: paired decrease 0.030 on prior 20-case overlap.
- No automatic global switch to costly Opus: single matched SDBench case had no accuracy gain vs Sonnet, with greater latency/cost.
- No headline performance from two radiology reports or two synthetic PhysicianBench charts.
- No auto-merge to `main` until a newly evaluated intervention demonstrates reproducible benefit and clears safety and latency review.

## Evidence links

- [Prior 30-case NOHARM baseline](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41302393853) (note: this link is the **new single-case inference**, not the old 30-case run; see baseline roadmap for old evidence).
- [SCT 174 items](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41235634053).
- [SCT V2 20-case comparison](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41288111699).
- [ReXrank independent read](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301345527).
- [MedAgentBench v2 author-graded clinical actions](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301962769).
- [PhysicianBench fictional note fix](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41304279185).
- [10 concurrent fast SCT HTTP calls](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41301851356).
- [Opus 5.5 All001 original-rubric judge](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41302687551).
