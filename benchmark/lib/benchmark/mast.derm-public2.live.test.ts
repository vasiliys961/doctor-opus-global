// Contest-only bootstrap: execute three new public thyroid sonograms when the proven dermoscopy CI job is re-run.
import './thyroid-ultrasound-public-three.live.test';
import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {analyzeBenchmarkMedicalImage} from './medical-vision';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

/** Two CC BY-SA 4.0 dermoscopic images. NOT official DDI/MIDAS. */
const CASES=[
  {id:'nevus-example',source:'https://upload.wikimedia.org/wikipedia/commons/9/9f/Dermatoscopy_Nevus_Reticular.jpg',
    reference:'melanocytic-nevus',author:'Philipp Tschandl'},
  {id:'melanoma-example',source:'https://upload.wikimedia.org/wikipedia/commons/0/0b/Malignant_Melanoma_Left_Mid_Back_Dermatoscope.jpg',
    reference:'melanoma',author:'Dermanonymous'}
];
const OUT='internal-results/derm-public-two';
it('two licensed genuine dermoscopy images through full observer and clinical synthesis',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/responses.jsonl','');
  writeFileSync(OUT+'/attribution.json',JSON.stringify({images:CASES,license:'CC BY-SA 4.0',
    note:'Research smoke; no DDI/MIDAS access or official MAST score.'},null,2));
  const begin=getDiagnosticApiUsageSnapshot();
  let completed=0,stopReason:string|null=null;
  for(const item of CASES){
    const usage=getDiagnosticApiUsageSnapshot();
    if(usage.costUsd-begin.costUsd>0.4 || usage.unpricedCalls>begin.unpricedCalls){
      stopReason='budget/price guard';break;
    }
    let bytes:Buffer;
    try{
      const r=await fetch(item.source,{signal:AbortSignal.timeout(30000),
        headers:{'User-Agent':'DoctorOpusResearchBenchmark/1.0 (educational evaluation; Wikimedia source attribution)'}});
      if(!r.ok)throw Error('Image unavailable');
      bytes=Buffer.from(await r.arrayBuffer());
      if(bytes.length<15000||bytes.length>3_000_000||bytes[0]!==255||bytes[1]!==216)
        throw Error('Not expected JPEG source');
    }catch(e){stopReason='licensed-source-unavailable';break;}
    const t0=Date.now(),before=getDiagnosticApiUsageSnapshot();
    try{
      // Files/labels/metadata are never included in the prompt.
      const result=await analyzeBenchmarkMedicalImage({modality:'dermatoscopy',
        images:[{mimeType:'image/jpeg',base64:bytes.toString('base64')}],allowSecondRead:true});
      if(result.report.length<60)throw Error('No diagnostic report');
      const after=getDiagnosticApiUsageSnapshot();
      const row={id:item.id,reference:item.reference,report:result.report,
        observation:result.observation,primaryObservation:result.primaryObservation,
        secondObservation:result.independentSecondObservation,models:result.models,
        secondRead:result.secondRead,seconds:(Date.now()-t0)/1000,
        costUsd:after.costUsd-before.costUsd,unpricedCalls:after.unpricedCalls-before.unpricedCalls};
      appendFileSync(OUT+'/responses.jsonl',JSON.stringify(row)+'\n');
      console.log('MAST_DERM_CASE '+JSON.stringify({...row,report:undefined,observation:undefined,
        primaryObservation:undefined,secondObservation:undefined}));
      completed++;
      if(row.unpricedCalls>0){stopReason='unpriced provider calls';break;}
    }catch(e){stopReason='inference-or-format-error';break;}
  }
  const total=getDiagnosticApiUsageSnapshot();
  const summary={completed,planned:CASES.length,billedUsd:total.costUsd-begin.costUsd,
    stopReason,method:'Licensed examples, no pathology-verification; not MAST Multimodal DDI/MIDAS.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('MAST_DERM_SUMMARY '+JSON.stringify(summary));
  expect(completed).toBeGreaterThan(0);
},900000);
