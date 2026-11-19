# Doctor Opus Academy — first actual 0 USD five-role ensemble pilot

**Date:** 2026-11-19. **Research-only; synthetic/public MAST cases.**  
[GitHub Actions run 44575873938](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44575873938) (technical job SUCCESS). Artifact \`academy-five-role-free-ensemble-20261119\`, ID \`14556662117\`, contains all actual raw replies, actual billing, source manifest and an entirely offline HTML review of archived Opus/Haiku/Nemotron answers.

## Measured data

| Measure | Value |
| --- | --- |
| Profile | Academy Free: Nemotron 3 Ultra for hypothesis, investigations, stewardship and synthesis; Nemotron 3.5 Lightning for challenger |
| Public cases | Card002, Derm001 (same unchanged original MAST source cases used earlier for Opus, Haiku and Nemotron) |
| Model calls | 10/10 replies obtained; actual OpenRouter reported cost **USD 0.000000** |
| Complete role outputs | 9/10 with \`finish_reason=stop\` |
| Truly complete FIVE-role cases | **1/2** (Card002) |
| Partially complete case | Derm001 has 4/5 complete: challenger truncated. A final synthesis text exists but must not count as complete consilium. |
| Technical CI | success (does not mean clinical validation or full role-completion on each case) |
| Source privacy | public MAST only, no patient uploads, no paid fallback |
| User-facing study | Offline Academy Replay HTML generated from real saved replies; no API calls |

**Integrity correction:** The initial runner \`summary.json\` misleadingly marked \`completed_studies=2\` because it checked the existence of the final synthesizer rather than all five completed roles. A subsequent code commit changed it to require **all five actual role outputs** and explicitly include missing/truncated role IDs in the synthesis prompt and case-stage status. This subsequent fix did not affect the already archived first-run outputs, so report this run's true complete count **1/2**, NOT 2/2. The missing opinion's content is *not* evidence.

## Clinical qualitative observations, not adjudicated diagnostic scores

### Card002 — brief historical AF / possible ablation

- The free 5/5 functional role ensemble correctly resisted an immediate DOAC prescription solely because ablation might happen, sought stroke-risk variables, echocardiography, thyroid status and further AF documentation.
- **Potential omission:** The source MAST rubric explicitly asks for a *conditional* anticoagulation plan **if persistent AF later requires electrical cardioversion**. The free final synthesis mentions procedural anticoagulation for ablation but does not explicitly discuss cardioversion. Simple text checks of saved Haiku, Nemotron, Opus-alone and Opus+Nemotron answers also found no literal “cardioversion”; a physician must adjudicate semantic equivalents and actual urgency rather than equate a missing keyword with a verified unsafe omission.
- Therefore, 5 completed roles and agreeing opinions did not demonstrate higher clinical completeness than the strongest solo answer on this example.

### Derm001 — postinflammatory hyperpigmentation + idiopathic intracranial hypertension

- Hypothesis, investigation, stewardship and synthesis roles proposed **topical tretinoin**, despite the pre-existing IIH diagnosis. The MAST source rubric flags retinoids in IIH as high-risk. The exact clinical risk of topical retinoids relative to systemic treatment requires independent evidence/pharmacology review. DO NOT turn this benchmark label into an unconditional new prescribing rule.
- Challenger failed to finish (\`finish_reason=length\`). The final synthesis still claimed consensus and absence of objections without explicitly exposing this missing expert voice. This is an **architecture integrity error** in the experimental orchestrator. A separate fix now supplies an explicit list of missing voices and forbids claiming unanimity when incomplete.
- Similar retinoid recommendations occurred in historical solo Haiku, Opus and Nemotron archived responses, showing **correlated or repeated clinical omission**, not automatic safety through multiple roles.

## Interpretation

**Proved:** (a) five-role topology can execute with real free models on a public scenario; (b) actual reported model price $0 for 10 calls; (c) a no-server offline replay interface works; (d) inexpensive roles and synthesis preserve meaningful clinical decisions.

**Not proved:** safety parity with Sonnet/Opus, exact original Consilium runtime equivalence, all 12 cases completed, real imaging workflows, full pharmacological evidence checks, speed advantages, independent physician benchmark scores, or provider reliability in general.

**Architecture lesson:** role diversity and multiple model calls do not guarantee independent *errors*. Four roles using the same Nemotron family are correlated, and the Lightning critical voice may truncate. Future Light would intentionally mix Haiku, Gemini Flash Lite and independent verified sources — only under separately approved spending limits and clinical gating. The output must show model, source, cost and missing opinions.

## Next study criteria

1. Add a visible **role completeness invariant** and never falsely mark synthesis as a full consilium with missing votes — code fix already authored.
2. Validate whether a **posthoc drug-disease source checker** catches IIH+retinoids, without passing benchmark rubrics as prior model input.
3. Compare identical 12 public MAST cases in independent blinded physician grading, including conditional anticoagulation, medication safety and missed high-consequence alternatives.
4. Only if the owner independently approves a new cap, enable Light \`Haiku + Gemini Flash Lite + independent free challenger\`; measure actual run cost/latency and evaluate against the strongest **single cheap model**, then Opus/full Consilium.
5. Keep real patient uploads disabled in all free endpoint trials. Never silently mix practice cases with clinical records.

**No changes to \`main\`, running Consilium, Codex 3107, Preview 3207, patient data, or production pricing.**
