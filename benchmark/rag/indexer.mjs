/**
 * Opt-in public-source RAG indexer for the Doctor Opus benchmark.
 * Reuses parent's multilingual-e5-small, passage/query prefixes and Int8
 * compression, but runs on GitHub CPU/Node rather than in the browser.
 * No clinical content is bundled and no benchmark prompts/rubrics are indexed.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL_ID = 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIM = 384;
export const PUBLIC_LICENSES = new Set(['CC0', 'CC-BY-4.0', 'PUBLIC-DOMAIN', 'MIT']);
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function quantizeInt8(vec) {
  if (vec.length !== EMBEDDING_DIM) throw new Error('Expected 384-dimensional E5 vector');
  return Array.from(vec, v => Math.max(-127, Math.min(127, Math.round(v * 127))));
}

export function assertPublicDocument(doc) {
  if (!doc || typeof doc !== 'object' || !String(doc.id || '').trim()) throw new Error('Document id required');
  if (!PUBLIC_LICENSES.has(doc.license)) throw new Error('Unlicensed or private document blocked from PUBLIC GitHub runner: ' + doc.id);
  if (doc.privacy && doc.privacy !== 'public') throw new Error('Private source blocked: ' + doc.id);
  if (typeof doc.title !== 'string' || !doc.title.trim()) throw new Error('Document title required: ' + doc.id);
  if (typeof doc.text !== 'string' || doc.text.trim().length < 20) throw new Error('Document text too short: ' + doc.id);
  if (doc.url && !/^https:\/\//.test(doc.url)) throw new Error('Require HTTPS source URL for ' + doc.id);
}

export function chunkDocument(doc, maxChars=1100, overlapWords=22) {
  assertPublicDocument(doc);
  if (maxChars < 100) throw new Error('maxChars must be >= 100');
  const words = doc.text.trim().replace(/\s+/g, ' ').split(' ');
  let start = 0;
  const chunks = [];
  while (start < words.length) {
    let end = start;
    let size = 0;
    while (end < words.length) {
      const next = words[end].length + (end > start ? 1 : 0);
      if (end > start && size + next > maxChars) break;
      size += next;
      end++;
    }
    if (end <= start) throw new Error('Unable to advance chunker');
    const text = words.slice(start, end).join(' ');
    chunks.push({
      id: String(doc.id) + ':part-' + String(chunks.length + 1),
      documentId: String(doc.id),
      title: doc.title,
      license: doc.license,
      sourceUrl: doc.url || null,
      page: Number.isInteger(doc.page) ? doc.page : null,
      section: doc.section || null,
      text,
      contentSha256: sha256(text),
    });
    if (end === words.length) break;
    start = Math.max(start + 1, end - Math.min(overlapWords, Math.floor((end - start) / 4)));
  }
  return chunks;
}

export function similarity(queryVector, storedInt8) {
  if (queryVector.length !== EMBEDDING_DIM || storedInt8.length !== EMBEDDING_DIM) {
    throw new Error('Embedding dimensions do not match model');
  }
  let value = 0;
  for (let i=0; i<EMBEDDING_DIM; i++) value += queryVector[i] * storedInt8[i] / 127;
  return value;
}

export function retrieve(queryVector, indexRows, limit=4) {
  return indexRows
    .filter(row => row.model === MODEL_ID && row.vector?.length === EMBEDDING_DIM)
    .map(row => ({...row, score: similarity(queryVector, row.vector)}))
    .sort((a,b) => b.score - a.score).slice(0,limit);
}

async function loadPrevious(outputPath) {
  try {
    const raw = await readFile(outputPath, 'utf8');
    return new Map(raw.split(/\r?\n/).filter(Boolean).map(line => {
      const row = JSON.parse(line);
      return [row.id, row];
    }));
  } catch(e) {
    if (e.code === 'ENOENT') return new Map();
    throw e;
  }
}

export async function buildIndex({inputPath, outputPath, dryRun=false, batchSize=8, maxChars=1100}) {
  const raw = await readFile(inputPath, 'utf8');
  const docs=raw.split(/\r?\n/).filter(Boolean).map((line,i)=>{
    try { return JSON.parse(line); } catch {throw new Error('Invalid JSONL at input line '+(i+1));}
  });
  if (!docs.length) throw new Error('Source contains no documents');
  const seenDocs=new Set();
  const chunks=[];
  for (const doc of docs) {
    assertPublicDocument(doc);
    if (seenDocs.has(doc.id)) throw new Error('Duplicate document id '+doc.id);
    seenDocs.add(doc.id);
    chunks.push(...chunkDocument(doc,maxChars));
  }
  const prior=dryRun?new Map():await loadPrevious(outputPath);
  const accepted=chunks.map(chunk => {
    const row=prior.get(chunk.id);
    if (row && row.model===MODEL_ID && row.contentSha256===chunk.contentSha256 &&
        Array.isArray(row.vector) && row.vector.length===EMBEDDING_DIM) {
      return {...chunk, model:MODEL_ID, vector:row.vector};
    }
    return {...chunk,model:MODEL_ID,vector:null};
  });
  const missing=accepted.filter(x=>x.vector===null);
  const stats={documents:docs.length, chunks:chunks.length, reused:accepted.length-missing.length,
    newEmbeddings:missing.length, model:MODEL_ID, dimensions:EMBEDDING_DIM,
    sourceSha256:sha256(raw), dryRun, output:outputPath};
  if (dryRun) { console.log(JSON.stringify(stats)); return stats; }
  if (missing.length) {
    // Optional dependency: installed only by an opt-in GitHub indexing job.
    const {pipeline, env}=await import('@xenova/transformers');
    env.allowRemoteModels=true;
    env.allowLocalModels=true;
    const extractor=await pipeline('feature-extraction',MODEL_ID,{quantized:true});
    for (let start=0;start<missing.length;start+=batchSize) {
      const batch=missing.slice(start,start+batchSize);
      const tensor=await extractor(batch.map(x=>'passage: '+x.text),{pooling:'mean',normalize:true});
      const dim=tensor.dims[tensor.dims.length-1];
      if (dim!==EMBEDDING_DIM) throw new Error('Unexpected vector dimension '+dim);
      if (tensor.data.length!==batch.length*dim) throw new Error('Unexpected embedding batch shape');
      batch.forEach((x,i) => { x.vector=quantizeInt8(tensor.data.subarray(i*dim,(i+1)*dim)); });
      console.log('Indexed '+Math.min(start+batch.length,missing.length)+'/'+missing.length);
    }
  }
  await mkdir(dirname(outputPath),{recursive:true});
  const tmp=outputPath+'.tmp';
  await writeFile(tmp,accepted.map(row=>JSON.stringify(row)).join('\n')+'\n');
  await rename(tmp,outputPath);
  await writeFile(outputPath+'.manifest.json',JSON.stringify({...stats,generatedUtc:new Date().toISOString(),
      indexSha256:sha256(await readFile(outputPath,'utf8'))},null,2)+'\n');
  console.log(JSON.stringify(stats));
  return stats;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback;};
  const input=arg('--input','benchmark/rag/sample-public.jsonl');
  const output=arg('--output','benchmark/rag-index-public/index.jsonl');
  const dryRun=process.argv.includes('--dry-run');
  const batch=Number(arg('--batch','8'));
  if (!Number.isInteger(batch)||batch<1||batch>64) throw new Error('--batch must be 1..64');
  await buildIndex({inputPath:input,outputPath:output,dryRun,batchSize:batch});
}
