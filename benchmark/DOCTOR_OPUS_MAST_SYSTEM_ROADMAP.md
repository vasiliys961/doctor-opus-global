# Doctor Opus Global — system-level clinical evaluation and improvement roadmap

**Scope:** test the **whole multiagent medical system**, not the underlying individual LLM.
**Updated:** 2026-11-01. Maintain a frozen original baseline and compare new versions on
previously untested public cases. Do not inject evaluation rubrics into live responses.

## Published baseline and reproducibility

- Exact 30-case open NOHARM original multiagent answers, scoring, ledger, evidence:
  [results/2026-10-31-noharm-open30-k1/README.md](results/2026-10-31-noharm-open30-k1/README.md).
- Frozen benchmark system commit: `cf6065ca9b9a2f6d84d396fc027eb1f464b6fbed`.
- First 30 open base cases (k=1): F1_weighted **0.8555** (95% CI **0.8136–0.8940**),
  `Severe_rate=0.0667` (two judge-flagged cases). This is **not** the
  k=11 330-variant, direct Google-SDK judged official MAST leaderboard protocol.
- Never call SCT fast path (single-model) a measured full-consilium score.
- Official MAST private submission: zero-retention of *all* private benchmark
  inputs and outputs; stable endpoint, <300s response, 5-10 concurrent calls.
  Open public test artifacts may be archived; private API test records must not be.

## Source modules to reuse from parent Doctor Opus Global (verified in main)

1. **Protocol drug interaction service**: `lib/drug-interactions.ts`,
   `app/api/drug-interactions/route.ts` — existing hybrid local
   limited drug-pair rules + Gemini-based candidate interaction detector +
   explanatory pass. **This is not a drug–disease contraindication engine.**
   Do not claim it would detect tretinoin contraindications in intracranial
   hypertension until separately tested. Reuse its extraction, aliasing
   and deduplication patterns; extend to indications, drug–condition,
   dosage/route, organ impairment, pregnancy and age conditions, with
   authoritatively grounded pharmaceutical references.
2. **Whole-case image ingestion**: `app/api/analyze/image/route.ts`,
   `lib/server-image-processing.ts`, `lib/analyze-image-client.ts`.
   Handle HEIC/HEIF, image sizing, multi-image transport, vision mode and
   structured text/evidence. Avoid destructive anonymization of diagnostic
   image regions; keep reversible diagnostic crops separately from identity.
3. **Current image-to-consilium link**: `app/api/consilium/route.ts` calls
   `describeImagesAsFindings` in `lib/diagnostics/orchestrator.ts` and
   passes the result as text. This is already connected in the parent app.
   It is **not proof of diagnostic performance** on image benchmarks.
   Evaluate whether important details are lost at the image→text boundary.
4. **DICOM and radiology viewing/processing**: `lib/dicom-service.ts`,
   `lib/dicom-processor.ts`, `lib/dicom-client-processor.ts`,
   `components/DicomViewer.tsx` and `components/Dicom3DViewer.tsx`.
   Port only the pieces needed for benchmark-supplied images and do
   not represent a viewer as a validated disease detector.
5. **Clinical source and protocol subsystem**:
   `app/api/protocol/route.ts`, `lib/protocols.ts`,
   `lib/protocol-stage2.ts`; reuse evidence structure / quality controls,
   but do not insert model-generated sources without citation verification.

## Ranked quality improvements (hypotheses, not yet demonstrated gains)

### P0 — clinical safety
- Drug–disease contraindication gate before returning the action plan;
  `Derm001`: topical tretinoin in pre-existing IIH, two severe action matches.
- Temporality/conditionality tagging of recommended actions:
  **recommend now / only-if / avoid / defer / information only**.
  `Endo007`: "If prolactinoma confirmed, start cabergoline" was judged as a
  partial unsafe prescription. A human adjudication should confirm whether
  this is a grader false-positive, not a case for blindly removing indications.
- Time-conditional safety obligations; `Card002`: anticoagulation *when
  cardioversion becomes indicated* is absent from the response (judge severe flag).
- Keep **specific** structured error classification and physician adjudication;
  do not optimize solely for a higher average F1.

### P1 — availability and latency
- Baseline: 26 failed provider calls in 27 newly run cases, all completed, many
  at 196–285 seconds. Timeouts threaten the MAST <300-second requirement.
- Validate primary and fallback models for each function; use Sonnet
  fallback only after measuring quality, price, and availability.
- Request timeout, retry budget, safe recovery of partial specialist responses,
  request-level deadline and concurrency load tests at 5–10 simultaneous calls.

### P2 — reasoning and diagnostic workup
- Measure diagnostic accuracy, appropriate next-test ordering, dynamic
  urgency, missing red flags and long case consistency across *new* cases.
- Assess which specialist / challenger feedback changes final plans versus
  nondebated synthesis; record intermediate agent outputs locally for open tests.
- Use retrieval to bring *verifiable* guideline recommendations and current
  drug labeling to relevant questions, with citation dates.

### P3 — clinical image understanding
- Preserve original image + source metadata + visual finding JSON from an
  independent vision pass; then let full consilium weigh those findings.
- Test **DDI/MIDAS** for dermatology and **ReXrank Mini** for radiology on
  license-permitted real images. Report visual error category, per-image cost
  and latency; avoid score comparisons across different image sources.
- Consider importing suitable validated radiology detector outputs from the
  separate Opus Radiology AI project, but do not claim detector accuracy
  without expert-reference comparisons.

## Evaluation matrix — every column in MAST needs its own measurement

| Domain | Test(s) | Status | Next defensible action |
|---|---|---|---|
| Clinical safety | First Do NOHARM v2 | Open 30 k=1 COMPLETE | k=5/11 after clinical fixes, direct Google-SDK scorer or independent MAST endpoint |
| Diagnostic reasoning under uncertainty | SCT | 174 items done only for single-model fast path | Implement & evaluate REAL whole-consilium answer policy; report separate from fast path |
| Complex diagnosis / CPC | CPC-Bench | Not measured | Obtain permitted official cases and assess full system |
| Agentic EHR | MedAgentBench v2 | Not measured | Optional FHIR sandbox (browser database is not FHIR EHR) |
| Long-horizon EHR | PhysicianBench | Not measured | Same, after tool interface validation |
| Radiology image report | ReXrank Mini | Not measured | Reuse parent image processing and measure original images |
| Dermatology images | DDI/MIDAS | Not measured | Reuse parent vision pipeline and test on image-linked cases |

Comparison targets: LiSA 2.5, Doximity Ask 6.1, OpenEvidence, Glass,
other **end-to-end medical AI systems**, not exclusively individual LLMs.
Published MAST product leaderboard comparisons require the same dataset,
rubric, judge and official independent endpoint submission.

## Release gate for improvements

1. Baseline frozen before changes; new PR, complete CI, no regression of
   clinician-critical tasks.
2. For each specific intervention run a paired test on **new/held-out**
   public instances with original scorer.
3. Report `F1_weighted`, `Severe_rate`, all relevant omissions,
   contraindication rate, format failures, latency p50/p95, API failures
   and USD/case.
4. Only merge into parent app after improvements are demonstrated
   with reproducible evidence and failure analysis. Retain prior results.
5. Bundle benchmark results and methods into a research report for MAST.
   Do not pretend submitted private tests may be cached.
