# Doctor Opus Global — public NOHARM 30-case baseline (k=1)

**Not an official MAST leaderboard score.** Internal test of the full multiagent system on 30 *open* base cases.

- Weighted F1: 0.8555 (95% CI 0.8136–0.8940)
- Severe harm flags: 2/30 (6.67%) according to the alternative-transport judge
- 30/30 output completed, 26 provider-call failures during 27 new cases
- $4.76143 new inference + $0.49876 prior pilot + $1.057948 judge ~= $6.31814

## Evidence files

- [original-mast-score.csv](original-mast-score.csv) exact overall official scoring *algorithm* CSV
- [cases.csv](cases.csv) exact item-level numbers from original graded JSONL
- [original-responses.jsonl](original-responses.jsonl) clinical answers to *public* test prompts only
- [official-rubric-alternate-transport-judged.jsonl](official-rubric-alternate-transport-judged.jsonl) per-case rubric judgements
- [inference-ledger.jsonl](inference-ledger.jsonl) cost, time and failed API attempts
- [clinical-audit-original.md](clinical-audit-original.md) judge-generated error review
- [manifest.json](manifest.json) code SHA, provenance and SHA256 integrity hashes

**MAST conditions:** the organizer requires zero retention of prompts and responses received during *official private* API assessment. This directory contains **public open-set self-evaluation only**.
This experiment uses 30 originals (k=1), while public MAST comparator results use all 330 variants (k=11); no direct ranking is justified.
