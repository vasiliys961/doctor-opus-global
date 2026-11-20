# Doctor Opus — Gemini 4 Neon, standalone image QA (20 public VQA-RAD questions)

**20 November 2026. Research only, NOT a clinical validation or a paired comparison to Argon.**

- Dataset: public VQA-RAD test, Hugging Face revision `bcf91e7654fb9d51c8ab6a5b82cacf3fafd2fae9`; source parquet SHA-256 `eb520bdab1116dd4f420120da19049d2315389fa126d031f65ec42e153264ea7`.
- New deterministic case panel: first 10 yes/no and first 10 other-question images, with **20 different source-image hashes**, alternated. No original patient data.
- **New short-answer mode:** 20/20 valid provider responses, **13/20 normalized exact matches**, including **9/10 binary yes/no**, **4/10 open-ended**. No model substitution. Each original source question was sent with its original image only.
- At least one strict miss is a clear lexical equivalent: reference “plain film x-ray”, Neon “Chest X-ray” (image type); treating this as one narrow equivalent raises **14/20**. Do not extend automatic synonym rules to partial or incorrect anatomical answers.
- Clinical error signals for physician review: wrong right/left colon location (case 06), gyri atrophy “yes” instead of reference “no” (case 15), diaphragm incorrectly named as liver (case 16), kidneys “retroperitoneum” where reference says not seen (case 04), airway ambiguity (case 10), and under-specific bowel anatomy (case 14). All require original-image adjudication to classify clinically.
- **Costs, provider `usage.cost`:** short-answer run **$0.125925**; earlier long Russian 80–150-word structured JSON pilot **$0.138075** (stopped when model repeatedly produced unparsable or truncated JSON); **total $0.264000** vs owner cap **$0.50**. Never auto-retried a potentially charged request.
- Earlier historical Argon **15/20** was on a local-only 12 November manifest that was **not committed to GitHub**; exact image identities could not be recovered. Thus Neon **13/20 or 14/20 versus Argon 15/20 is NOT a valid head-to-head comparison**, and answer protocols differ. Do not use these aggregates to rank clinical image diagnosis, replace Argon, modify medical imaging routes or adjust Doctor Opus production.
- This task evaluates **one short question per static image**, not complete radiology reporting, full CT/MRI volumes, ECG, lesion detection, sensitivity or specificity. Small public dataset may be known in training and lacks independent reader adjudication.

## Verified GitHub Actions and original data

- [First descriptive JSON experiment (incomplete, $0.138075)](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44754660463): archived responses, provider usage and explicit stop records.
- [Complete single-question 20-image Neon run ($0.125925)](https://github.com/vasiliys961/doctor-opus-global/actions/runs/44755670900): all 20 individual raw answer records and consolidated report as downloadable Actions artifacts, including questions, ground-truth answers, image SHA256, timings and costs.
- Dataset, script and protocol are pinned on branch `bench/neon-vqa-rad-20-20261120`; main and Doctor Opus clinical app unaffected. No Argon API calls.

**Decision:** keep the existing Argon/Flash/Opus clinical image pipeline unchanged. To measure whether Neon replaces Argon, recover the original local benchmark manifest or make a future truly paired, independently adjudicated test on the exact same images; owner authorization would be required for any additional paid calls.
