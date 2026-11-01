import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {compareBenchmarkMedicalImages} from './source-bound-comparison';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
const CASES=['CXR3030_IM-1405','CXR3673_IM-1828'] as const;
const META='../rexrank-source/data/iu_xray/ReXRank_IUXray_test.json';
const IMAGE_DIR='../rexrank-selected';
const OUT='internal-results/rexrank-iu-2/comparative-sourcebound';
type Entry={image_path:string[];section_findings:string;section_impression:string};
it('two original paired-view ReXrank studies with source-bound multi-image comparison',async()=>{
 const data=JSON.parse(readFileSync(META,'utf8')) as Record<string,Entry>;
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/comparison-reports.jsonl','');
 const start=getDiagnosticApiUsageSnapshot();
 let completed=0;
 for(const caseId of CASES){
  const entry=data[caseId];
  if(!entry||entry.image_path.length<2||!entry.section_findings)
   throw Error('Genuine paired-view source missing');
  const initial=getDiagnosticApiUsageSnapshot();
  if(initial.costUsd-start.costUsd>0.65)throw Error('Comparison cost guard');
  const frames=entry.image_path.slice(0,2).map((relative,i)=>{
   const pixels=readFileSync(join(IMAGE_DIR,relative));
   if(pixels.length<20000||pixels[0]!==137||pixels[1]!==80)
    throw Error('Invalid original PNG');
   const sourceId='view'+(i+1);
   return{sourceId,subjectScope:caseId,
     sourceSha256:createHash('sha256').update(pixels).digest('hex'),
     image:{base64:pixels.toString('base64'),mimeType:'image/png' as const},
     projection:undefined,position:undefined};
  });
  // Projection orientation not supplied by this source in an audited field;
  // do not invent PA/lateral labels. Original report remains blinded.
  const started=Date.now();
  const result=await compareBenchmarkMedicalImages({modality:'xray',mode:'general',frames});
  if(!result.report||result.report.length<80||result.sourceReadings.length!==2)
   throw Error('Multiview comparison missing original observation');
  const after=getDiagnosticApiUsageSnapshot();
  const row={caseId,studyViews:2,models:['independent observer','Gemini 3.1 Pro cross-view','Sonnet comparison'],
    sourceRefs:result.sourceReadings.map(x=>x.sourceId),comparisonReport:result.report,
    pairwiseObservation:result.pairwiseObservation,
    expertReference:entry.section_findings+'\n'+entry.section_impression,
    seconds:Number(((Date.now()-started)/1000).toFixed(1)),
    costUsd:Number((after.costUsd-initial.costUsd).toFixed(5)),
    unpricedCalls:after.unpricedCalls-initial.unpricedCalls,
    clinicalScore:null};
  appendFileSync(OUT+'/comparison-reports.jsonl',JSON.stringify(row)+'\n');
  console.log('REXRANK_COMPARATIVE_CASE '+JSON.stringify({
     caseId,views:2,seconds:row.seconds,costUsd:row.costUsd,officialScore:null}));
  if(row.unpricedCalls)throw Error('Unpriced model call');
  completed++;
 }
 const end=getDiagnosticApiUsageSnapshot();
 const summary={completed,planned:2,modelFailures:end.failedCalls-start.failedCalls,
   costUsd:Number((end.costUsd-start.costUsd).toFixed(5)),
   methodology:'Original 2 views per study; independent observations + both originals in pairwise vision, original reference blinded; clinical grading pending.',
   clinicalScore:null};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('REXRANK_COMPARATIVE_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBe(2);
},900000);
