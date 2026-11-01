import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runUnifiedClinicalChat} from './unified-clinical-chat';
import type {ECGOpusMeasuredSignal} from './ecg-opus-digital-evidence';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

/** Actual source ECG pixels -> original ECG Opus Gemini/Opus,
 * digital NeuroKit measurements -> real five-role parent consilium.
 * NEVER labels in prompt; not official MAST ECG grading.
 */
const CASES=[
 {id:'case-00351',reference:'atrial-fibrillation'},
 {id:'case-01541',reference:'myocardial-infarction'}
] as const;
const OUT='internal-results/unified-ecg-two';
const USD_GUARD=3.30;

it('real 2 source ECG cases through ECG Opus and the mother clinical consilium',async()=>{
 const source=JSON.parse(readFileSync('internal-results/ecg-opus-digital-three/summary.json','utf8')) as {
  cases:Array<Record<string,unknown>>};
 mkdirSync(OUT,{recursive:true});writeFileSync(OUT+'/responses.jsonl','');
 const usage0=getDiagnosticApiUsageSnapshot();let completed=0;
 for(const item of CASES){
  const before=getDiagnosticApiUsageSnapshot();
  if(before.costUsd-usage0.costUsd>USD_GUARD*0.8||before.unpricedCalls>usage0.unpricedCalls)
   throw Error('Shared consilium cost limit or missing provider pricing');
  const record=source.cases.find(x=>x.case===item.id);
  if(!record||record.available!==true)throw Error('Actual source NeuroKit not measured');
  const {case:sourceId,reference:referenceLabel,method:ignored,...other}=record;
  void sourceId;void referenceLabel;void ignored;
  const digital={...other,method:'ECG Opus NeuroKit2'} as ECGOpusMeasuredSignal;
  const image=readFileSync('../ecg-opus-rendered/'+item.id+'.png');
  if(image[0]!==137||image[1]!==80||image.length<30_000)
   throw Error('Original 12-lead ECG image not present');
  const t=Date.now();
  const output=await runUnifiedClinicalChat({
   caseText:'Assess the attached research twelve-lead ECG. Give your single MOST LIKELY WORKING rhythm and key ST-T or ischemic findings when justified, with a prioritized differential, specific uncertainties, clinical red flags and next steps. Do not assume symptoms, troponin, prior ECG or patient history that were not provided.',
   studies:[{kind:'ecg-opus',sourceId:'ecg1',input:{
    image:{mimeType:'image/png',base64:image.toString('base64')},
    digitalMeasurements:digital}}]
  });
  const after=getDiagnosticApiUsageSnapshot();
  if(!output.leadingWorkingDiagnosis||output.sourceCount!==1||!output.reviewRequired||
     output.evidence[0]?.status!=='inferred'||after.unpricedCalls>before.unpricedCalls)
   throw Error('Incomplete multimodal consilium output');
  const response={caseId:item.id,referenceForOfflineAssessment:item.reference,
   sourceSha256:createHash('sha256').update(image).digest('hex'),
   leadingWorkingDiagnosis:output.leadingWorkingDiagnosis,
   reasoning:output.reasoning,consiliumReport:output.report,
   sourceSummaries:output.sourceSummaries,sourceEvidence:output.evidence,
   reviewRequired:output.reviewRequired,
   seconds:Number(((Date.now()-t)/1000).toFixed(1)),
   costUsd:Number((after.costUsd-before.costUsd).toFixed(5))};
  appendFileSync(OUT+'/responses.jsonl',JSON.stringify(response)+'\n');
  console.log('UNIFIED_ECG_CASE '+JSON.stringify({caseId:item.id,
   status:'completed',seconds:response.seconds,costUsd:response.costUsd,reviewRequired:true}));
  completed++;
 }
 const final=getDiagnosticApiUsageSnapshot();
 const summary={completed,planned:CASES.length,failedCalls:final.failedCalls-usage0.failedCalls,
  unpricedCalls:final.unpricedCalls-usage0.unpricedCalls,
  costUsd:Number((final.costUsd-usage0.costUsd).toFixed(5)),
  method:'Original rendered ECG pixels + source NeuroKit + Gemini/Opus + real parent clinical consilium',
  clinicalGrade:'Not independently graded; original label withheld from all models. Distinguish operational completion from correct rhythm / infarction diagnosis.'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('UNIFIED_ECG_TWO_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBe(2);
},1600000);
