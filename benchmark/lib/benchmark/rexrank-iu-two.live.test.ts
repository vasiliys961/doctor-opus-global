import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {analyzeBenchmarkMedicalImage} from './medical-vision';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

/** Authentic ReXrank IU-Xray TEST split metadata + original paired-view images.
 * Source image archive: NLM Open-i, noncommercial academic mirror.
 * References withheld from LLM; no copies of original images saved as artifacts.
 * Report metrics are exploratory (not official ReXrank CRIMSON/RadGraph).
 */
const CASE_IDS=['CXR3030_IM-1405','CXR3673_IM-1828'] as const;
const ROOT='../rexrank-source/data/iu_xray/ReXRank_IUXray_test.json';
const IMAGE_DIR='../rexrank-selected';
const OUT='internal-results/rexrank-iu-2';
const USD_GUARD=0.60;
type Reference={image_path:string[];key_image_path:string;section_findings:string;section_impression:string};
const safe=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function lexicalF1(a:string,b:string):number{
 const source=new Set(safe(a).split(' ').filter(x=>x.length>3));
 const response=new Set(safe(b).split(' ').filter(x=>x.length>3));
 if(!source.size||!response.size)return 0;
 const same=[...response].filter(x=>source.has(x)).length;
 const precision=same/response.size,recall=same/source.size;
 return precision+recall===0?0:2*precision*recall/(precision+recall);
}
it('two authentic IU-Xray ReXrank test studies with original pixels and blinded references',async()=>{
 const examples=JSON.parse(readFileSync(ROOT,'utf8')) as Record<string,Reference>;
 if(Object.keys(examples).length<500)throw Error('ReXrank test metadata missing');
 mkdirSync(OUT,{recursive:true});writeFileSync(OUT+'/reports.jsonl','');
 const initial=getDiagnosticApiUsageSnapshot();let completed=0,failed=0;
 for(const id of CASE_IDS){
  const source=examples[id];
  if(!source||!source.image_path?.length || !source.section_findings)throw Error('Study missing '+id);
  const before=getDiagnosticApiUsageSnapshot();
  if(before.costUsd-initial.costUsd>USD_GUARD*0.75||before.unpricedCalls>initial.unpricedCalls)break;
  const imgs=source.image_path.slice(0,2).map(file=>{
   const pixels=readFileSync(join(IMAGE_DIR,file));
   if(pixels.length<20000 || pixels.length>9_000_000 || pixels[0]!==137 || pixels[1]!==80)
    throw Error('Missing authentic PNG '+id);
   return {base64:pixels.toString('base64'),mimeType:'image/png' as const};
  });
  const begin=Date.now();
  try{
   const result=await analyzeBenchmarkMedicalImage({modality:'xray',images:imgs,allowSecondRead:true});
   const after=getDiagnosticApiUsageSnapshot();
   const reference=source.section_findings+'\n'+source.section_impression;
   const row={id,studyViews:imgs.length,
    report:result.report,referenceFindings:source.section_findings,
    referenceImpression:source.section_impression,observation:result.observation,
    secondRead:result.secondRead,models:result.models,
    descriptiveTokenF1:Number(lexicalF1(reference,result.report).toFixed(4)),
    hasFindings:/findings\s*:/i.test(result.report),hasImpression:/impression\s*:/i.test(result.report),
    seconds:(Date.now()-begin)/1000,billedUsd:after.costUsd-before.costUsd,
    unpricedCalls:after.unpricedCalls-before.unpricedCalls};
   appendFileSync(OUT+'/reports.jsonl',JSON.stringify(row)+'\n');
   console.log('MAST_REXRANK_IU_CASE '+JSON.stringify({...row,report:undefined,
     referenceFindings:undefined,referenceImpression:undefined,observation:undefined}));
   completed++;
   if(row.unpricedCalls)break;
  }catch(e){failed++;console.log('MAST_REXRANK_IU_FAIL '+JSON.stringify({id,errorClass:e instanceof Error?e.name:'unknown'}));break;}
 }
 const after=getDiagnosticApiUsageSnapshot();
 const summary={source:'rajpurkarlab/ReXrank + dz-osamu/IU-Xray',
  cases:CASE_IDS,planned:CASE_IDS.length,completed,failed,
  costUsd:Number((after.costUsd-initial.costUsd).toFixed(5)),unpricedCalls:after.unpricedCalls-initial.unpricedCalls,
  clinicalScoring:'Not official ReXrank. Descriptive lexical F1 is not a clinical quality score.'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('MAST_REXRANK_IU_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBeGreaterThan(0);
},900000);
