# Doctor Opus / MAST — Redivis Stanford AIMI credential and small-sample readiness

**Verified on:** 2026-11-01, by private GitHub Actions secret `REDIVIS_API_TOKEN`. **Branch:** `feat/mast-consilium-adapter`. No parent main modification.

## Correct organization and access

- The Stanford AIMI Redivis organization API handle is **`AIMI`**, NOT `StanfordAIMI`. The latter returned NotFound.
- The official Redivis Python SDK `redivis.organization("AIMI").list_datasets()` returned **37 datasets**; **37/37 have `accessLevel="data"`**, whereas **37/37 `publicAccessLevel="metadata"`**. This proves the authenticated account has data-level access beyond anonymous public users. Token data-export scope is distinct from the displayed user access level; some API operations can still be restricted.
- [Successful owner resolution 41317473375](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41317473375), [complete authorized metadata inventory 41317625087](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41317625087).
- The 37 named datasets include PhysicianBench, DDI, DDI2, MRA-MIDAS, INSPECT, CheXpert Plus, Merlin Abdominal CT, Merlin Plus, MRNet, MURA, RadFusion, BrainMetShare, EchoNet, thyroid ultrasound and others.
- **PhysicianBench:** `aimi.physicianbench:a0ek:v1_0`. One file-index table with **2 entries**, not 100 directly streamed FHIR cases.
- **DDI:** `aimi.ddi_diverse_dermatology_images:3r16:v1_0`. A 656-row metadata table and 657-entry file index.
- **DDI2:** `aimi.ddi2_diverse_dermatology_images_2:6f7f:v1_0`. A 665-row metadata table and 665-entry file index.
- **MRA-MIDAS:** `aimi.mra_midas_multimodal_image_dataset_for_ai_based_skin_cancer:dpx2:v1_0`. Two 3416-entry tables (metadata and file index).
- **CheXpert Plus:** 234 validation PNG-file entries in `PNG_valid`; 223,462 rows in metadata table, no bulk image transfer.
- **INSPECT:** 106-file sample file-index table plus 23,254-file full index.

## Selective file-index probe (not actual files)

[Successful Actions 41317866757](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41317866757) fetched **at most two file-index objects** from each of 5 datasets, without retrieving file contents, images or clinical text:

| Dataset | Result | Number of index entries |
|---|---|---:|
| DDI | Success | 2 |
| CheXpert Plus | Success | 2 |
| PhysicianBench | Success | 2 |
| DDI2 | APIError; no bypass attempted | 0 |
| MRA-MIDAS | APIError; no bypass attempted | 0 |

An index enumeration success **does not** guarantee that actual file bytes can be exported or sent through a third-party inference provider. DDI2/MIDAS failures may reflect restrictions or API format; cause is not yet established. No authenticated dataset media was downloaded or published, and no paid LLM calls were made.

## Data rights and safe next step

- [Official DDI Research Use Agreement](https://ddi-dataset.github.io/) and [DDI2 agreement](https://daneshjoulab.github.io/ddi2-dataset/) grant personal non-commercial research use but **prohibit distribution/retransmission of any part of the dataset without prior written permission**. This does NOT imply authorization to forward source images to Gemini/Claude/OpenRouter or publish sample images in GitHub artifacts.
- [Redivis data usage rules](https://docs.redivis.com/reference/data-access/usage-rules) say export constraints apply to the API as well as UI. `accessLevel="data"` is not permission to bypass export restrictions.
- For protected DDI images, obtain clear authorization for any external cloud model transmission, or use an explicitly permitted processing arrangement; do not silently pass pixels to a third-party model.
- Continue zero-cost **metadata/index-only** checks in CI until individual dataset terms, destination export rules and model-processing rights are established.
- For actual physician-style evaluation, the public PhysicianBench task/runner code is at [HealthRex/PhysicianBench](https://github.com/HealthRex/PhysicianBench). Official 100-task EHR execution still needs the source FHIR container. Listing two file-index entries is **not** running two benchmark tasks.

## Code
- `benchmark/scripts/redivis_aimi_dataset_inventory.py`: complete 37-dataset permission inventory with no rows/files.
- `benchmark/scripts/redivis_aimi_few_files_metadata.py`: two file-index entries per selected dataset; no image contents.
- Corresponding GH Actions under `.github/workflows/mast-redivis-*.yml`.
- No medical images, real patient records, secret values or API tokens stored in repository/artifacts. No commercial or official MAST benchmark claim.
