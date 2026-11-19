# Doctor Opus Academy — 12 original MAST cases: comparative research protocol

**Date:** 2026-11-19. **Status:** original public-case research, not clinical validation. **Protected:** main/Consilium/Preview 3207/Codex 3107 unchanged.

## Arms on identical public clinical questions

Original MAST source SHA: 57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee. IDs: Card001, Card002, Derm001, Endo009, GI002, All001, Heme002, ID003, Nephro003, Neuro003, Pulm001, GI004.

1. Historical **Haiku 5.5 alone**, 12 recorded answers, zero new calls.
2. **Academy Free**: four Nemotron Ultra role slots + independent Lightning critic, plus Ultra final synthesis; 12 original questions; first two previously recorded cases reused with provenance rather than re-inference.
3. **Academy Mixed**: Haiku hypothesis, Gemini 3.1 Flash Lite test chooser, free Nemotron Lightning challenger, Gemini 3.5 Flash Lite stewardship, Haiku checklist. Costs tracked from real OpenRouter usage; test cap USD 0.20 for one live benchmark job.
4. Historical **Opus 5.5 alone**, 12 recorded answers, zero new calls.
5. Historical **Opus 5.5 + Nemotron**, 12 recorded answers, zero new calls.
6. Historical **FULL Doctor Opus Consilium**, all same 12 cases extractable from its original 30-case benchmark, zero new calls.

**Scientific qualification:** The *user questions* and source cases are matched; the model system prompts differ across single-model control and five-role ensemble because functional orchestration is the intervention under study. Hence this is an architecture/use-case comparison, not a controlled identical-system-prompt pharmacological trial.

## Methods and validity

- Four initial roles are independent, not exposed to each other's responses. The fifth checklist sees all four verbatim, tagged with role identity and status.
- The final may be technically complete even when an earlier role is missing, truncated or failed. Report both **final completed** and **all five roles completed**. Never call missing voices unanimous.
- Original rubric and reference are not supplied to any model. Source rubrics can only be examined afterward.
- Safety primary outcomes for physician adjudication: harmful medication advice, dangerous delay/inaction, omission of urgent referral, unsafe anticoagulation changes, false reassurance, unsupported facts. Examples of locked high-risk case IDs: Derm001 IIH/retinoids, Card002 anticoagulation, All001 grade-3 infusion reaction, GI002 anticoagulated anemia, Pulm001 infectious differential.
- Secondary outcomes: reference-aligned test selection; conditional vs absolute management; source support; explicit uncertainty; ability of challenger to catch an error introduced by hypothesis or stewardship; cost per complete 5-role encounter, latency, role availability.
- The original FULL Consilium 30-case score uses a MAST alternative-transport judge; its historical 12-subset **arithmetic mean of per-case weighted F1 = 0.83816**. This is historical judge output only. Other arms have no identical validated judge, so **do not assign them official F1 or infer clinical non-inferiority**.
- Tally independent errors, not just answer overlap. A persistent error shared by all models is not consensus-based validation.
- Prefer the full original context and dose/contraindication verification. Tretinoin in IIH is a potential benchmark contraindication concern whose specific topical clinical risk needs independent pharmacological review.
- Prompt lengths/role budgets and provider rate limits differ. Original baseline model runs were earlier dates; cost and latency comparisons should be bounded accordingly.

## Source evidence

- Haiku archive: [successful experiment](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44568505502)
- Nemotron standalone: [historical test](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44405020410)
- Opus alone and with Nemotron: [12 paired answers archive](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44406222552)
- Full Consilium: [public 30-case original answers](https://github.com/vasiliys961/doctor-opus-global/blob/main/benchmark/results/2026-10-31-noharm-open30-k1/original-responses.jsonl)
- Full Consilium: [original judge JSONL](https://github.com/vasiliys961/doctor-opus-global/blob/main/benchmark/results/2026-10-31-noharm-open30-k1/official-rubric-alternate-transport-judged.jsonl)
- New test: [12-case live GitHub Actions](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44579921724)
- Obsolete accidental duplicate 44579875162 was cancelled; partial usage billed USD 0.01824315 and kept as a separate incident, not a scientific repeated trial.

## Privacy and training restrictions

All questions are pre-existing public benchmark text. No patient images, private charts, original doctor-authored records, IDs, ultrasound recordings, clinical prescriptions, or EHR writes. Free NVIDIA endpoint data practices are not appropriate for identifiable clinical data. Costs and provider failures are recorded; zero priced calls only if catalog confirms zero. Any resulting Academy training mode must remain visibly labeled TRAINING, not a clinical decision system.
