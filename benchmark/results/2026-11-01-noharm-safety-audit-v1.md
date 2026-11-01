# Doctor Opus MAST — independent medication safety audit v1 (contest-only)

**Date:** 2026-11-01. **Branch:** `feat/mast-consilium-adapter`. No changes to parent `main`.
**Status:** working proof-of-mechanism, **OFF by default**, NOT yet an improved MAST score or a validated safety intervention.

## Code implemented
- `benchmark/lib/benchmark/clinical-safety-review.ts`: opt-in independent Sonnet safety reviewer, triggered by high-risk signals in the ORIGINAL case text. Signals: severe grade 3/4 drug adverse reactions, anticoagulant + bleeding/NSAID, dangerous potassium abnormalities, kidney-drug risks, pregnancy-drug risks.
- `benchmark/lib/benchmark/mast.ts`: optional post-consilium review. Modes: `off` (default, no cost), `audit` (preserves clinical response), `enforce` (EXPERIMENTAL, rewrites only when judge returns a complete grounded answer; no automatic rewriting for uncertain verdict).
- `benchmark/lib/benchmark/clinical-safety-review.test.ts`: zero-cost unit coverage, including no calls in disabled mode, no calls without a high-risk trigger.
- `benchmark/lib/benchmark/clinical-safety-review.live.test.ts`: **no full consilium repeat**; reruns reviewer on original stored public `All001` response from GitHub Actions 41302393853. Freezes original model answer for A/B.

## Verified A/B correction
1. First pass [Actions 41305063295](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41305063295): 2.858s, $0.006926 review-only; marked PASS but generated an erroneous critique because its test prompt **omitted** the actual original case's `cycle 3` detail. This is an input-fidelity error, NOT evidence of a safe model.
2. Second pass [Actions 41305208280](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41305208280): uses the FULL, EXACT public case as in original consilium, no rephrasing. 4.232s, $0.009322, 0 unpriced calls, successful CI. The independent review returned **UNCERTAIN**, NOT pass, and flagged a potentially unsupported exception to grade-3 nivolumab permanent-discontinuation language/rechallenge. It also correctly identified that down-grading the explicitly documented grade was not justified solely by the lack of treatment detail. This is an audit, not independently verified label adjudication.
3. Both runs preserved the original clinical response exactly (no hidden rewrite) and left frozen NOHARM F1 unchanged.

## Confirmed next work
- For each patient-specific high-risk action, retrieve dated official product-label / guideline wording before allowing a reviewer to judge support for an exception; do not hard-code a known All001 answer. Parent has `lib/drug-interactions.ts` and the contest already includes opt-in public openFDA label RAG, but these are NOT a comprehensive contraindication engine.
- Test the same optional reviewer with 3–5 *distinct*, source-licensed high-risk public cases, comparing F1, severe harm, latency, and cost to an identical frozen baseline. Explicitly include negative/neutral cases so the reviewer does not over-trigger.
- Require clinician adjudication of reviewer disagreements and label applicability. For model-uncertain cases, do not silently certify clinical safety based on keyword checks.
- Separate safety audit's additional ~$0.01 per flagged case from overall model cost. A single 4.2s run is not a general latency guarantee.
- Do **not** promote `MAST_SAFETY_GATE_MODE=enforce` to default before paired clinical validation. Production parent `main` remains untouched.
