import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { analyzeBenchmarkMedicalImage } from './medical-vision';
import { getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

/**
 * CHEAP RESEARCH SMOKE, NOT OFFICIAL MAST/ReXrank.
 * Public pediatric images CC BY 4.0 (Kermany et al), two selected test cases.
 * Category/label and ground truth are NEVER sent to the visual model.
 * Report generation, source bytes, costs and elapsed duration are measured.
 */
const REV='551b993d5dcaec27a1f1bbbcbca2ff4968a28e07';
const ROOT='https://raw.githubusercontent.com/probml/chest_xray_kaggle/'+REV+'/test/';
const CASES=[
  {id:'normal-0001',file:'NORMAL/IM-0001-0001.jpeg',referenceLabel:'NORMAL'},
  {id:'opacity-0475',file:'PNEUMONIA/person100_bacteria_475.jpeg',referenceLabel:'PNEUMONIA'}
] as const;
const OUT='internal-results/xray-public-two';
const COST_GUARD_USD=0.65;
const round=(v:number)=>Math.round(v*100000)/100000;

it('genuine JPEG -> independent visual JSON -> clinical radiology report, two public images',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/responses.jsonl','');
  writeFileSync(OUT+'/manifest.json',JSON.stringify({source:'probml/chest_xray_kaggle',revision:REV,
    attribution:'Kermany et al., Cell 2018, CC BY 4.0',cases:CASES,
    method:'two-stage actual-image research smoke, not ReXrank nor clinical validation',
    secondRead:'OFF in cost-limited smoke; test separately on uncertainty',
    labelsOnlyAfterInference:true},null,2));
  const origin=getDiagnosticApiUsageSnapshot();
  let completed=0;let stopped:string|null=null;
  for(const test of CASES){
    const before=getDiagnosticApiUsageSnapshot();
    if(before.costUsd-origin.costUsd>=COST_GUARD_USD*0.7 || before.unpricedCalls>origin.unpricedCalls){
      stopped='cost or missing-price guard';break;
    }
    let buffer:Buffer;
    try {
      const url=ROOT+test.file;
      const resp=await fetch(url,{signal:AbortSignal.timeout(25000)});
      if(!resp.ok) throw Error('Source image download failed HTTP '+resp.status);
      const bytes=Buffer.from(await resp.arrayBuffer());
      if(bytes.length<20000 || bytes.length>3_000_000 || bytes[0]!==255 || bytes[1]!==216)
        throw Error('Not a plausible source JPEG');
      buffer=bytes;
    }catch(error){stopped='source JPEG unavailable';break;}
    const t0=Date.now();
    try{
      const result=await analyzeBenchmarkMedicalImage({modality:'xray',
        images:[{base64:buffer.toString('base64'),mimeType:'image/jpeg'}],allowSecondRead:false});
      if(!Array.isArray(result.observation.findings) || result.report.length<60)
        throw Error('Invalid report from original image');
      const after=getDiagnosticApiUsageSnapshot();
      const row={id:test.id,referenceLabel:test.referenceLabel,sourceFile:test.file,
        report:result.report,observation:result.observation,
        secondRead:result.secondRead,models:result.models,
        imageSizeBytes:buffer.length,elapsedSeconds:round((Date.now()-t0)/1000),
        trackedCostUsd:round(after.costUsd-before.costUsd),
        unpricedCalls:after.unpricedCalls-before.unpricedCalls};
      appendFileSync(OUT+'/responses.jsonl',JSON.stringify(row)+'\n');
      console.log('MAST_XRAY_CASE '+JSON.stringify({...row,report:undefined,observation:undefined}));
      completed++;
      if(row.unpricedCalls>0){stopped='unpriced provider call';break;}
    }catch(error){
      stopped='image analysis failed';
      console.log('MAST_XRAY_FAILURE '+JSON.stringify({id:test.id,reason:stopped,
        errorClass:error instanceof Error?error.name:'unknown'}));
      break;
    }
  }
  const end=getDiagnosticApiUsageSnapshot();
  const summary={planned:CASES.length,completed,totalTrackedUsd:round(end.costUsd-origin.costUsd),
    unpricedCalls:end.unpricedCalls-origin.unpricedCalls,stopped,
    scoring:'No official score; radiology interpretation requires physician review against actual pixels.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('MAST_XRAY_SUMMARY '+JSON.stringify(summary));
  expect(completed).toBeGreaterThan(0);
},900000);
