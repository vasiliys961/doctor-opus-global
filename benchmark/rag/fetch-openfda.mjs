/**
 * Download a small, general-purpose US medication safety corpus from openFDA
 * (FDA public data, CC0 unless otherwise noted). No benchmark case/rubric data.
 * The live source, access timestamp and SPL identifiers are recorded per row.
 * Never silently fall back to made-up advice if the API fails.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const API='https://api.fda.gov/drug/label.json';
const MEDICATIONS=['warfarin','apixaban','amiodarone','isotretinoin','spironolactone','metformin'];
const SECTIONS=['boxed_warning','contraindications','warnings_and_precautions','drug_interactions','dosage_and_administration','indications_and_usage'];
const allowed=new Set(MEDICATIONS);
const hash=(s)=>createHash('sha256').update(s).digest('hex');

export function extractSections(drug,rec,apiUrl) {
  if(!allowed.has(drug)) throw new Error('Unknown drug '+drug);
  if(!rec || !rec.set_id || typeof rec.set_id!=='string') throw new Error('FDA record lacks set_id');
  const generic=(rec.openfda?.generic_name||[]).join(' ').toLowerCase();
  if(!new RegExp('\\b'+drug+'\\b','i').test(generic)) throw new Error('Not a matching generic: '+generic);
  const shared={
    title:'FDA prescribing information — '+drug,
    license:'CC0',privacy:'public',
    url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid='+encodeURIComponent(rec.set_id),
    retrievedFrom:apiUrl,
    effectiveDate:rec.effective_time||null,
    sourceSetId:rec.set_id,
    source:'openFDA FDA Drug Label API; public-domain/CC0 data unless individually noted',
  };
  const output=[];
  for(const section of SECTIONS){
    const arr=rec[section];
    if(!Array.isArray(arr)||!arr.length)continue;
    const text=arr.filter(x=>typeof x==='string').join(' ').replace(/\s+/g,' ').trim().slice(0,10500);
    if(text.length<100)continue;
    output.push({...shared,id:'openfda-'+drug+'-'+section,section:section.replaceAll('_',' '),text});
  }
  return output;
}
export async function fetchDrug(drug,{fetchImpl=fetch}={}) {
  if(!allowed.has(drug)) throw new Error('Unknown drug '+drug);
  const q='openfda.generic_name:'+drug+' AND _exists_:contraindications';
  const u=API+'?search='+encodeURIComponent(q)+'&limit=10';
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const res=await fetchImpl(u,{headers:{'Accept':'application/json','User-Agent':'DoctorOpusResearchRAG/0.1 (public safety labels)'},signal:AbortSignal.timeout(25000)});
      if(!res.ok)throw Error('HTTP '+res.status);
      const obj=await res.json();
      const records=(obj.results||[]).filter(x=>x.set_id && x.openfda?.generic_name?.some(n=>new RegExp('\\b'+drug+'\\b','i').test(n)));
      if(!records.length)throw Error('No matching FDA labels for '+drug);
      const prescribed=records.filter(x=>x.openfda?.product_type?.some(v=>/PRESCRIPTION/i.test(v)));
      const sorted=(prescribed.length?prescribed:records).sort((a,b)=>String(b.effective_time||'').localeCompare(String(a.effective_time||'')));
      const docs=extractSections(drug,sorted[0],u);
      if(docs.length<2)throw Error('FDA record has insufficient safety sections for '+drug);
      return docs;
    }catch(err){lastError=err;if(attempt<2)await new Promise(r=>setTimeout(r,(attempt+1)*1700));}
  }
  throw Error('FDA fetch for '+drug+' failed: '+String(lastError));
}
export async function generateCorpus(output,opts={}) {
  const meds=opts.medications||MEDICATIONS;
  const all=[];
  const failures=[];
  for(const name of meds){
    try{
      const docs=await fetchDrug(name,opts);
      all.push(...docs);
      console.log('FDA_SOURCE '+JSON.stringify({drug:name,sections:docs.length,setId:docs[0].sourceSetId,effectiveDate:docs[0].effectiveDate}));
    }catch(e){failures.push({name,error:String(e)});console.error('FDA_SOURCE_FAIL '+JSON.stringify(failures.at(-1)));}
  }
  if(all.length<12 || new Set(all.map(x=>x.id.split('-')[1])).size<3) {
    throw Error('Public corpus insufficient; NO synthetic substitute. '+JSON.stringify(failures));
  }
  if(failures.length) throw Error('Source retrieval partial. Refusing to silently omit requested medication labels: '+JSON.stringify(failures));
  const str=all.map(x=>JSON.stringify(x)).join('\n')+'\n';
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,str);
  await writeFile(output+'.provenance.json',JSON.stringify({
    source:API,licenseBasis:'https://open.fda.gov/terms/',retrievedAt:new Date().toISOString(),
    medications:meds,documents:all.length,sha256:hash(str),failedSources:failures,
    caution:'FDA labels are drug- and formulation-specific. Information must be matched to the selected product, route and date. Not a validated clinical decision engine.'
  },null,2)+'\n');
  return {documents:all.length,drugs:meds.length,output,sha256:hash(str)};
}
if(process.argv[1]?.endsWith('fetch-openfda.mjs')){
  const output=process.argv[process.argv.indexOf('--output')+1]||'benchmark/rag/data/openfda-safety.jsonl';
  try{console.log(JSON.stringify(await generateCorpus(output)))}catch(e){console.error(String(e));process.exitCode=1;}
}
