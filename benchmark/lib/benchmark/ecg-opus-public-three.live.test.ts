import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyzeECGOpusImage} from './ecg-opus-image';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
const CASES=[
 {id:'case-00001',reference:'normal-rhythm'},
 {id:'case-00351',reference:'atrial-fibrillation'},
 {id:'case-01541',reference:'myocardial-infarction'}
] as const;
const OUT='internal-results/ecg-opus-public-three';
it('3 actual ECG Opus original 12-lead signals rendered blinded and read Gemini -> Claude Opus',async()=>{
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/reports.jsonl','');
 const started=getDiagnosticApiUsageSnapshot();
 let completed=0;
 for(const item of CASES){
  const prior=getDiagnosticApiUsageSnapshot();
  if(prior.costUsd-started.costUsd>1.40)throw Error('ECG model cost guard');
  const pixels=readFileSync('../ecg-opus-rendered/'+item.id+'.png');
  if(pixels.length<30_000||pixels[0]!==137||pixels[1]!==80)throw Error('Expected real ECG PNG');
  const t0=Date.now();
  // No clinical reference, diagnosis label or filename reaches either model.
  const result=await analyzeECGOpusImage({image:{mimeType:'image/png',base64:pixels.toString('base64')}});
  if(!result.report||result.report.length<70||result.digitalECGFounderExecuted!==false)
    throw Error('ECG Opus report or provenance missing');
  const after=getDiagnosticApiUsageSnapshot();
  if(after.unpricedCalls>prior.unpricedCalls)throw Error('Unpriced ECG LLM calls');
  const row={id:item.id,reference:item.reference,sourceSha256:createHash('sha256').update(pixels).digest('hex'),
    report:result.report,geminiObservation:result.geminiVisualDescription,
    models:result.models,digitalECGFounderExecuted:false,
    seconds:Number(((Date.now()-t0)/1000).toFixed(2)),
    costUsd:Number((after.costUsd-prior.costUsd).toFixed(5))};
  appendFileSync(OUT+'/reports.jsonl',JSON.stringify(row)+'\n');
  console.log('ECG_OPUS_PUBLIC_CASE '+JSON.stringify({id:item.id,seconds:row.seconds,costUsd:row.costUsd,technicalReport:true}));
  completed++;
 }
 const end=getDiagnosticApiUsageSnapshot();
 const summary={completed,planned:3,providerFailures:end.failedCalls-started.failedCalls,
  unpricedCalls:end.unpricedCalls-started.unpricedCalls,
  costUsd:Number((end.costUsd-started.costUsd).toFixed(5)),
  source:'vasiliys961/ecg-opus-global pinned PTB-XL examples rendered without reference labels',
  metric:'Original 12-lead image technical report only; no ECGFounder weights, no diagnostic accuracy estimate, clinical adjudication pending'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('ECG_OPUS_PUBLIC_THREE_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBe(3);
},900000);
