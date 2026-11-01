# MAST contest: CPC-Bench first genuinely licensed public NEJM release & PhysicianBench readiness
Date: 2026-11-01. Branch: `feat/mast-consilium-adapter` (production parent main untouched).

## User-confirmed access and provenance
- The user authenticated at [CPC-Bench dataset page](https://cpcbench.com/dataset_100.html). Their screenshot shows **Public Dataset**: `100 cases` plus `30 NEJM Image Challenge` cases with physician-validated derived tasks; file size **405 MB**; an orange **Download** action and distinct **Terms of Use** link. The site's footnote says that clinical case text contains presentation and differential diagnosis sections only.
- This changes the earlier situation where we had **only synthetic Microsoft SDBench**. CPC-Bench offers a real, authorized NEJM-origin public benchmark. **This is an available download, NOT a claim that the ZIP is already mounted in GitHub or ChatGPT**.
- Before external inference or redistribution, read CPC-Bench Terms of Use. The site's statement that the dataset was released with permission does not automatically grant permission to republish NEJM case text, to train foundation models, or to send raw cases to a third-party cloud API.
- The **Starter Code** button on the CPC-Bench page provides the official task prompts and judge. Once its exact GitHub destination is retrieved, pin commit and call the author evaluation code, not a homemade textual heuristic.

## Local importer actually implemented / tested
- `benchmark/scripts/inspect_cpcbench_archive.py`: offline no-network tool, works on ZIP or directory. Lists *only schema keys, column headers, extension counts, byte counts*. Does not display raw protected case text, send cloud requests, unpack source, commit the dataset, or leak gold labels to inference.
- `benchmark/scripts/test_inspect_cpcbench_archive.py`: tests using **fictional placeholder files only**. Confirms metadata introspection, no text leakage, traversal refusal.
- [CI test run 41315235253](https://github.com/vasiliys961/doctor-opus-global/actions/runs/41315235253): **3/3 tests passed**, zero external API/model spend. No CPC case file uploaded to public GitHub.
- This is **technical ingestion readiness**, NOT a new CPC diagnosis benchmark score.
- Local use after authorized download: `python benchmark/scripts/inspect_cpcbench_archive.py /path/to/public_cpcbench.zip --output cpc_schema.json`.
- Once actual file and applicable permissions arrive: **choose 2–3 cases at predetermined positions or IDs**, retain input/reference separation, test DDx/plan/QA first, image tasks if licensed, official scoring and cost on each.

## PhysicianBench public code is available, EHR data still separate
- Open repo [HealthRex/PhysicianBench](https://github.com/HealthRex/PhysicianBench), Apache-2.0 *code*: 100 original task instructions, 670 subcheckpoints, 21 specialties, original Python runner `scripts/run_task.py` and `run_batch_task.sh`.
- To run the official environment, authors require `physicianbench-fhir-v1.tar.gz` downloaded from [Stanford Redivis](https://stanford.redivis.com/datasets/a0ek-0ad8tjsw9). This is **not in the public GitHub repository**. Running our MedAgentBench v2 Docker is not the same thing.
- Command after legitimate access to data / setup:
  `uv run python scripts/run_task.py tasks/v1/aortic_aneurysm_cad --model anthropic/claude-opus-5.5 --reasoning-effort high`.
  Verify actual model availability and runtime pricing before executing; first prefer low-cost `Sonnet` for plumbing and reserve `Opus` for comparison. No task execution without the true EHR database.
- As before, public task-style fake EHR simulations are correctly labeled **PhysicianBench-like** and cannot be converted into official pass@1.

## Current user action needed
1. In their already logged-in CPC-Bench browser: click **Terms of Use** and review any prohibitions on model service transmission / research use, then **Download** the 405 MB archive. Do **not** click **Submit**; no MAST registration needed.
2. Upload just the acquired archive into ChatGPT conversation if permitted by its terms, or share a **small permitted extract/schema** without protected NEJM text. Run local importer first if unsure about data rights.
3. Redivis: apply to PhysicianBench if the FHIR Docker image is needed; no need to copy the open GitHub repository itself into contest branch.

## Budget-first acceptance
- Import and formal schema detection without paid calls, then 2–3 true CPC tasks. Pin dataset and scorer versions, prevent cross-case gold answer leakage, use safe benchmark hosting rules.
- No costs until source file and accepted external processing rights are confirmed.
- No changes to parent `main`.
