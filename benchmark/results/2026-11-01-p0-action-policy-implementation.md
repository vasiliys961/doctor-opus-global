# P0 implementation: explicit action tagging (2026-11-01)

Contest-only lexical preflight in `benchmark/lib/benchmark/clinical-action-policy.ts` with Vitest coverage in `clinical-action-policy.test.ts`.

## Purpose

Preserve **conditional** medical advice rather than silently treating an if/when statement as an immediate order. Classify explicit actions into `recommend-now`, `conditional`, `avoid`, `defer`, `information-only`. Return the triggering text for clinician audit.

## Known cases used as regression fixtures

- Endo007-style: “If prolactinoma is confirmed, start cabergoline” → `conditional`.
- Card002-style: “When cardioversion becomes indicated, initiate anticoagulation” → `conditional`.
- Derm001-style: “Avoid tretinoin in this patient” → `avoid`.

These are **adapted public development fixtures**, not unseen NOHARM heldout cases, no new clinical benchmark score is claimed.

## Critical constraints

- This is **not** an FDA-label retrieval engine, drug–disease contraindication evaluator, semantic model, or treatment validator. A negated clause buried in a longer sentence may not be recognized. It does not infer whether the clinical advice is appropriate.
- Review flag remains true for potential prescriptions and ambiguous statements; no automated approval is possible.
- Run `cd benchmark && npm test -- clinical-action-policy.test.ts` in CI/local test environment. The GitHub commit alone is not proof that tests ran.
- Next iteration: integrate into review-only output of NOHARM full consilium, then compare action-specific recall and false positives against heldout clinician-reviewed cases before any clinical decision gating.
- No edits to parent `main`, public app or deployment configuration.
