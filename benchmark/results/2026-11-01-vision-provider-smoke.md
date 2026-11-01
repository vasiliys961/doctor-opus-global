# Vision provider smoke — Opus Benchmark (public synthetic input)

Date: 2026-11-01. Branch: `feat/mast-consilium-adapter`. **The default branch is unchanged.**

Evidence: [GitHub Actions run 41284525547](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41284525547).

| Model | Endpoint request | Wall time | Provider measured USD |
|---|---|---:|---:|
| google/gemini-3.8-flash | successful | 2.18 s | 0.00137325 |
| google/gemini-3.1-pro-preview | successful | 4.69 s | 0.006948 |
| qwen/qwen3.5-397b-a17b | successful | 4.98 s | 0.00053391 |
| Total | 3 of 3 | — | 0.00885516 |

A 420×260 synthetic diagram with circles and clear text was generated
within the workflow. No patient, DICOM, X-ray, dermatology or hidden MAST
images were used; therefore these numbers measure *connectivity and billing
only*, **not diagnostic accuracy** or actual clinical image quality.

### Smart routing candidate

- Flash: `google/gemini-3.8-flash` first.
- Pro on uncertain/ambiguous/high-difficulty/poor quality images:
  `google/gemini-3.1-pro-preview`, with the existing fallback.
- Qwen: optional comparison model `qwen/qwen3.5-397b-a17b` for
  independently measuring a second read, not an automatic final diagnosis.
- The model IDs in the parent main previously aliased both Gemini Pro and
  Gemini Flash to Flash. The **benchmark branch** now uses the correct,
  distinct Pro ID and enables its existing conditional routing. Fast-only
  analysis still does not escalate.
- Dedicated unit tests assert that low-risk images do not escalate merely
  due to modality, while ambiguous CT, MRI, X-ray, dermoscopy and wound images do.

Before medical deployment, score a legal open ReXrank Mini and DDI/MIDAS
image cohort with clinician references. Measure sensitivity/specificity,
clinical reporting omissions, errors in localization, cost and latency.

### Clinical reasoning

The SCT experiment in
[run 41284175472](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41284175472)
separately compares the full Doctor Opus consilium against the prior
single-model SCT fast pathway on the same four public open cases. Expert
ratings are used only after inference, never as prompts. Its outcome is
independent of the synthetic provider smoke above.
