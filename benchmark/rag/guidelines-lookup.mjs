/**
 * Guided semantic retrieval from legally approved NIH public clinical pages.
 * Opt-in, offline-replayable, not connected to full consilium until paired
 * evaluation confirms benefit. No case questions/rubrics are stored.
 */
import { readFile } from 'node:fs/promises';
import { MODEL_ID, EMBEDDING_DIM, retrieve } from './indexer.mjs';

let extractorPromise;
async function embedQuery(text){
  extractorPromise ||= (async()=>{
    const {pipeline,env}=await import('@xenova/transformers');
    env.allowRemoteModels=true;env.allowLocalModels=true;
    env.cacheDir=process.env.DOCTOR_OPUS_RAG_CACHE_DIR||'benchmark/rag/.cache';
    return pipeline('feature-extraction',MODEL_ID,{quantized:true});
  })();
  const extractor=await extractorPromise;
  const output=await extractor('query: '+text,{pooling:'mean',normalize:true});
  if(output.data.length!==EMBEDDING_DIM)throw Error('Wrong E5 query vector shape');
  return output.data;
}
export function parseGuidelineIndex(content) {
  const rows=content.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
  if(!rows.length)throw Error('Guideline index has no chunks');
  for(const row of rows) {
    if(row.model!==MODEL_ID || !Array.isArray(row.vector) || row.vector.length!==EMBEDDING_DIM)
      throw Error('Wrong model/index dimension for '+row.id);
    if(row.license!=='PUBLIC-DOMAIN' || !row.sourceUrl?.startsWith('https://clinicalinfo.hiv.gov/'))
      throw Error('Unexpected publisher or license in guideline index: '+row.id);
    if(!String(row.documentId||'').startsWith('nih-hiv-'))
      throw Error('Unknown guideline source '+row.id);
  }
  return rows;
}
export function selectContext(searchText,rows){
  const q=String(searchText||'');
  // HIV exposure, testing, PrEP and PEP are NOT the same as HIV opportunistic
  // infection management; do not let these six OI chapters contaminate them.
  const specificOI=/pneumocystis|pneumocystis jirovecii|toxoplasm|mycobacterium avium|MAC disease/i.test(q);
  const explicitlyNoHiv=/\b(?:HIV[- ]negative|without HIV|no known HIV|not (?:yet )?(?:been )?diagnosed with HIV)\b/i.test(q);
  const confirmedHiv=/\b(?:with HIV|has HIV|advanced HIV|HIV[- ]positive|HIV infection|living with HIV|people with HIV|diagnosed with HIV)\b/i.test(q);
  const hivPneumonia=confirmedHiv && /\b(pneumonia|opportunistic infection)\b/i.test(q) && !explicitlyNoHiv;
  if(q.length<15||!(specificOI||hivPneumonia))
    return {eligible:false,reason:'outside current NIH opportunistic-infection guidance scope',rows:[]};
  return {eligible:true,reason:'NIH HIV opportunistic-infections scope',rows};
}
export async function guidelineEvidence(question,indexPath,opts={}) {
  const rows=parseGuidelineIndex(await readFile(indexPath,'utf8'));
  const filtered=selectContext(question,rows);
  if(!filtered.eligible) return {found:false,reason:filtered.reason,hits:[],context:''};
  const queryVector=opts.embed || await embedQuery(question.slice(0,950));
  const ranked=retrieve(queryVector,filtered.rows,Math.max(opts.limit||5,12));
  const selected=[];
  const countByDoc=new Map();
  for(const row of ranked){
    if(selected.length >= (opts.limit||5))break;
    const count=countByDoc.get(row.documentId)||0;
    if(count>=2)continue;
    selected.push(row);
    countByDoc.set(row.documentId,count+1);
  }
  const context=selected.map((row,i)=>
    '['+(i+1)+'] '+row.title+' | '+row.section+' | '+row.sourceUrl+'\n'+row.text.slice(0,950)
  ).join('\n\n').slice(0,4800);
  return {found:selected.length>0,reason:filtered.reason,
    hits:selected.map(row=>({id:row.id,documentId:row.documentId,title:row.title,
      section:row.section,sourceUrl:row.sourceUrl,score:Math.round(row.score*1000)/1000})),
    context};
}
