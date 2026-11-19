# Doctor Opus Academy / Research — free and cheap ensemble sandbox

**Status:** isolated experimental prototype; **not production, not a replacement for W4/W5**. Source branch: \`bench/academy-cheap-ensemble-20261119\`. Do not merge or deploy without separate clinician and privacy sign-off.

## Goal

Recreate the decision *process* of Doctor Opus Consilium at minimal cost, not pretend that a small-model answer has the clinical reliability of a frontier system. Preserve five actual functional roles from \`vasiliys961/consilium/lib/consilium.ts\`:

1. \`hypothesis\` — independent differential and dangerous alternative.
2. \`testChooser\` — test selection, without orders.
3. \`challenger\` — independent skepticism and omissions.
4. \`stewardship\` — medication, organ and context safety.
5. \`checklist\` — final unsigned synthesis of the four exact prior opinions, with dissent and missing votes.

The first four answer independently, without seeing each other; only the synthesizer sees the earlier outputs. **This is a simplified copy of the logical five-role topology**, not the full production stack: there is currently NO ECGFounder, DICOM detector integration, reliable drug-label RAG, source-verification, ambient STT, original clinical-case persistence, actual specialist EHR tools or polished workstation UI in this sandbox.

## Profiles

| Profile | hypothesis | testChooser | challenger | stewardship | checklist | Billing |
| --- | --- | --- | --- | --- | --- | --- |
| \`free\` | Nemotron 3 Ultra :free | Nemotron 3 Ultra :free | Nemotron 3.5 Lightning :free | Nemotron 3 Ultra :free | Nemotron 3 Ultra :free | **Only if catalog confirms all input/output token rates exactly zero** |
| \`light\` (future opt-in, not enabled in CI) | Haiku 5.5 | Gemini 3.1 Flash Lite | Nemotron 3 Ultra :free | Gemini 3.5 Flash Lite | Haiku 5.5 | Explicit separate approval, cap and actual usage ledger needed |

\`free\` calls MUST stop rather than auto-fallback to paid; \`light\` requires explicit \`ACADEMY_PAID_EXPLICIT_APPROVAL=YES\` and a real positive \`--max-total-usd\` <= $0.50. This mechanism is NOT a blanket spending approval; no automated light workflow is configured. Per-request conservative cost reservations use the live OpenRouter price catalog, followed by actual \`usage.cost\` checks. No patient-identifying content.

Current official OpenRouter model links: [NVIDIA free](https://openrouter.ai/collections/free-models), [Haiku 5.5](https://openrouter.ai/anthropic/claude-haiku-5.5), [Gemini 3.1 Flash Lite](https://openrouter.ai/google/gemini-3.1-flash-lite), [Gemini 3.5 Flash Lite](https://openrouter.ai/google/gemini-3.5-flash-lite). Endpoints, availability, price and data-retention terms may change. NVIDIA explicitly warns that free endpoint conversations may be logged and used to improve its services; **no patient cases, photos or recordings**.

## Existing identical-case evaluation

Use pinned public MAST NOHARM \`57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee\`: \`Card002\`, \`Derm001\`, \`GI002\` initially, expandable to the frozen 12-case old comparison. Never send MAST rubrics, labels or old outputs to any model.

Prior true API evidence:
- [Opus / Nemotron paired 12](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44406222552), retrieval of original results artifact without re-billing.
- [Single-model Haiku matched 12 + images](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44568505502).
- [Haiku report](../results/2026-11-19-haiku-vs-all-archived-models.md) — 46.84× lower clinical-case inference cost than Opus solo on the same 12 cases, but **not proved clinically equivalent**.
- [Historical full Consilium open 30](https://github.com/vasiliys961/doctor-opus-global/blob/main/benchmark/results/2026-10-31-noharm-open30-k1/README.md): F1 weighted 0.8555 on a different architecture and wider sample; not directly interchangeable with 3/12 case results.

### Experimental arms for credible comparison

A. **Single-model controls:** Haiku, Nemotron, Opus alone, other exact stored model replies.  
B. **Free Academy ensemble:** 4 independent cheap/free roles → final free synthesis.  
C. **Light Academy ensemble** (only after independent cap authorization): free skeptical voice + cheap Haiku/Gemini specialist roles.  
D. **Full Doctor Opus Consilium:** archived identical case responses when available; if not, mark NOT MATCHED rather than pretending old 30-case overall F1 is head-to-head.

Primary metrics: clinician-blinded dangerous clinical omissions (separate binary/graded measure); checklist agreement with verified source; immediate vs conditional management; investigations; contraindications; unjustified certainty; differential coverage; successful role count and truncation; dollar and seconds per completed case. Keep initial evidence of failures. Explicitly measure whether ensemble improves over strongest individual cheap component, not just over Opus.

A low-level regex or similarity metric must not award clinical correctness. The rubric can guide manual grading but no benchmark labels in inference context. Record physician disagreements and judge-vs-clinician conflicts.

### Future Academy product only when training sandbox is ready

- Distinct origin / workspace and permanent visible label \`TRAINING – SYNTHETIC DATA – NOT FOR CLINICAL USE\`.
- Resettable synthetic patient cases, sample ECG/radiology images, report drafts, model opinions, interaction flags, literature retrieval practice; all sourced/allowed.
- Two study modes: **Replay** (0 API calls, pre-recorded verified outcomes) and **Live free/Light** (actual model responses, explicit costs, no inference if unavailable).
- Same task topology and familiar controls, but explicitly explain unavailable modules; never forge detector output or source verification.
- Demo cannot write to production cases, orders or clinical EHR, cannot silently switch to paid Pro, and cannot upload private data to free endpoints.
- Separate hard safety gates for abnormal lab units, severe red flags, medicines, pregnancy/allergy and image uncertainty. The small model's own self-assessment is never the only gate.
- Instrument the full workflow, not just individual chat responses. A successful five-role model call is **NOT** a validated clinical diagnosis.

## Current code

- \`benchmark/scripts/academy-cheap-ensemble-20261119.py\` — isolated stdlib runner, five-role sequential workflow, actual free-catalog validation and append-only provider evidence.
- \`benchmark/scripts/test_academy_cheap_ensemble.py\` — offline contract tests.
- \`.github/workflows/academy-free-ensemble-20261119.yml\` — free-only CI, fixed publicly available synthetic MAST cases and preserved artifacts.
- **No production routing, Copilot or case-storage changes.** This is a research kernel and deployment gate, a first static offline training UI, not yet an integrated interactive live workstation.

### Immediate readiness criteria

1. Exact role-model mapping available at zero price and the workflow produces complete five-role results without silent substitution.
2. Repeatability on all 12 original cases without rubrics in prompts, then held-out safety cases.
3. Clinical review of consensus vs solo model (including severe failures even when majority agrees).
4. Budget, source licenses, model versions and observed privacy behavior reviewed.
5. Only then a separate app route with synthetic-only browser workspace; never merge W5 route changes from this prototype.

**Warning:** Existing 2026-11-19 case \`Derm001\` showed that both top and cheap models may recommend topical tretinoin for a patient with IIH despite the benchmark's medication hazard rubric. Agreement within an ensemble is not independent safety evidence.
