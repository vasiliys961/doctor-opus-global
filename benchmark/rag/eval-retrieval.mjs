/**
 * Retrieval-only validation on synthetic, non-MAST topics.
 * Does not call any text generation model; no medical outcome claims.
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {medicationEvidence} from './retrieve.mjs';
const index=process.argv[2]||'benchmark/rag-index-openfda/index.jsonl';
const output=process.argv[3]||'benchmark/rag-index-openfda/retrieval-smoke.json';
const probes=[
  {tag:'anticoagulant-bleeding',query:'An adult taking apixaban has active gastrointestinal bleeding. What prescribing cautions apply?',expected:'apixaban'},
  {tag:'pregnancy-teratogen',query:'Isotretinoin is being considered for an adult patient with possible pregnancy. Review medication risks.',expected:'isotretinoin'},
  {tag:'qt-and-thyroid',query:'Patient on amiodarone develops abnormal thyroid studies and prolonged QT interval.',expected:'amiodarone'},
  {tag:'potassium-renal',query:'An adult on spironolactone has hyperkalemia and declining kidney function.',expected:'spironolactone'},
  {tag:'no-match',query:'Patient has a leg wound without any documented medication exposure.',expected:null},
];
const outputs=[];
for(const probe of probes){
  const out=await medicationEvidence(probe.query,index,{limit:4,maxChars:3700});
  if(probe.expected){
    if(!out.retrieved||!out.drugs.includes(probe.expected)||!out.hits.length)throw Error('No expected evidence for '+probe.tag);
    if(out.hits.some(h=>!h.id.startsWith('openfda-'+probe.expected+'-')))throw Error('Unrelated medicine for '+probe.tag);
    if(!out.evidence.includes('dailymed.nlm.nih.gov'))throw Error('Missing source citation for '+probe.tag);
  }else{
    if(out.retrieved||out.hits.length)throw Error('Irrelevant knowledge injection for no-match');
  }
  outputs.push({probe:probe.tag,expected:probe.expected,matchedDrugs:out.drugs,
    sourceIds:out.hits.map(x=>x.id),sourceUrls:out.hits.map(x=>x.sourceUrl),
    passed:true});
  console.log('RAG_RETRIEVAL '+JSON.stringify(outputs.at(-1)));
}
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({index,probes:outputs,passed:outputs.length},null,2)+'\n');
console.log('RAG_RETRIEVAL_VALIDATION '+JSON.stringify({passed:outputs.length,total:probes.length}));
