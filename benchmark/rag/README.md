# Optional RAG indexing for the Doctor Opus MAST benchmark

This independent, opt-in module reuses the architecture of the parent Doctor
Opus library (`lib/embeddings.ts`): Xenova multilingual-e5-small, 384 vector
dimensions, `passage:`/`query:` prefixes, and Int8 quantization. It runs in
Node rather than the parent's browser/IndexedDB runtime.

## What exists
- `indexer.mjs`: public-only JSONL ingestion, deterministic chunking, SHA256,
  batch embedding and incremental reuse of unchanged 384-dimensional vectors.
- `indexer.test.mjs`: dependency-free tests.
- `sample-public.jsonl`: two **synthetic** CC0 examples only.
- `package.json`: optional transformer dependency, not added to the live
  clinical benchmark dependencies.

This does **not** change the frozen NOHARM baseline or wire RAG into the
clinical answer path. That should happen only in a paired held-out evaluation.

## Usage

```bash
node --test benchmark/rag/indexer.test.mjs
node benchmark/rag/indexer.mjs --input benchmark/rag/sample-public.jsonl --dry-run
cd benchmark/rag && npm install --no-audit && cd ../..
node benchmark/rag/indexer.mjs --input benchmark/rag/sample-public.jsonl --output benchmark/rag-index-public/index.jsonl --batch 8
```

Reusing the previous `index.jsonl` preserves identical chunk vectors. Only
new or changed chunks will run through the model. An attached index can be
loaded later; queries must be embedded using the **same** E5 model with
`query:` (not `passage:`) and compared by quantized dot product.

Input: one JSON object per source document per line with
`id,title,text,license` and optional `privacy,url,page,section`. Only
sources marked public with a permitted license may enter the indexer on a
public GitHub runner. The live indexing job is an opt-in workflow on CPU.
Its output is an artifact, not committed source text.

**Do not put commercial textbooks, private licensed extracts, patient data,
or hidden MAST evaluation prompts/responses into this public repository.**
For Harrison and similar textbooks, use an authorized private/local corpus
and confirm permissions. Open clinical guidance can be added gradually after
checking document-level licenses and source provenance.

Do not optimize the index using public MAST case rubrics. First test a
small corpus on held-out retrieval queries. Then compare **full consilium**
with and without RAG on matched cases (clinical F1, severe harms, latency,
cost and citation correctness).
