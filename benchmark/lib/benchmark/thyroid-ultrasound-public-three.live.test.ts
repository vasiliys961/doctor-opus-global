import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyzeBenchmarkMedicalImage} from './medical-vision';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

/** Independent real ultrasound JPGs, CC BY-SA 3.0 from Wikimedia Commons.
 * Reference is the photographer's caption only, NOT histopathology or an
 * adjudicated clinical ground truth. Stanford Redivis cine-clips not used.
 */
const CASES=[
 {id:'thyroid-transverse',file:'Thyroid_ultrasound_110314142256_1423520.jpg',caption:'transverse thyroid ultrasound'},
 {id:'thyroid-nodule-a',file:'Thyroid_ultrasound_110321165224_1657430.jpg',caption:'thyroid nodule ultrasound'},
 {id:'thyroid-nodule-b',file:'Thyroid_ultrasound_110322095404_0959360.jpg',caption:'thyroid nodule ultrasound'},
] as const;
const OUT='internal-results/derm-public-two/thyroid-ultrasound-public-three';
function directCommonsUrl(file:string){
  const hash=createHash('md5').update(file).digest('hex');
  return 'https://upload.wikimedia.org/wikipedia/commons/'+hash[0]+'/'+hash.slice(0,2)+'/'+file;
}

it('3 CC BY-SA genuine thyroid ultrasound stills: blinded observation and radiology report',async()=>{
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/reports.jsonl','');
 writeFileSync(OUT+'/attribution.json',JSON.stringify({
    creator:'Nevit Dilmen',license:'CC BY-SA 3.0 Unported',
    licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',
    cases:CASES.map(x=>({id:x.id,
      page:'https://commons.wikimedia.org/wiki/File:'+x.file,
      sourceCaption:x.caption})),
    note:'Source caption is NOT clinical verified gold truth. Stanford cine-clips are not evaluated.'
 },null,2));
 const start=getDiagnosticApiUsageSnapshot();
 let completed=0;
 const summaries=[];
 for(const item of CASES){
   const initial=getDiagnosticApiUsageSnapshot();
   if(initial.costUsd-start.costUsd>0.55||initial.unpricedCalls>start.unpricedCalls)
     throw Error('Price/budget guard before next image');
   const url=directCommonsUrl(item.file);
   const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{
      'User-Agent':'DoctorOpusMedicalAIResearch/1.0 (Wikimedia CC attribution preserved)'}});
   if(!r.ok)throw Error('Licensed ultrasound image source unavailable HTTP '+r.status);
   const bytes=Buffer.from(await r.arrayBuffer());
   if(bytes.length<15000||bytes.length>2_000_000||bytes[0]!==255||bytes[1]!==216)
      throw Error('Unexpected ultrasound image bytes');
   const checksum=createHash('sha256').update(bytes).digest('hex');
   const began=Date.now();
   // Label, file name and webpage context are never passed to the observers.
   const analysis=await analyzeBenchmarkMedicalImage({modality:'ultrasound',examRegion:'thyroid',
     images:[{mimeType:'image/jpeg',base64:bytes.toString('base64')}],
     allowSecondRead:true});
   if(!analysis.report||analysis.report.length<60)
      throw Error('No clinically structured ultrasound report');
   const after=getDiagnosticApiUsageSnapshot();
   if(after.unpricedCalls>initial.unpricedCalls)throw Error('Unpriced inference calls');
   const itemReport={
      id:item.id,sourceSha256:checksum,sourceCaption:item.caption,
      preliminaryReport:analysis.report,observation:analysis.observation,
      models:analysis.models,secondRead:analysis.secondRead,
      seconds:Number(((Date.now()-began)/1000).toFixed(2)),
      costUsd:Number((after.costUsd-initial.costUsd).toFixed(5)),
   };
   appendFileSync(OUT+'/reports.jsonl',JSON.stringify(itemReport)+'\n');
   summaries.push({id:item.id,reportGenerated:true,
      mentionsNodule:/nodule|nodular|узел/i.test(itemReport.preliminaryReport),
      seconds:itemReport.seconds,costUsd:itemReport.costUsd});
   console.log('THYROID_ULTRASOUND_PUBLIC_CASE '+JSON.stringify(summaries.at(-1)));
   completed++;
 }
 const end=getDiagnosticApiUsageSnapshot();
 const summary={
   source:'Wikimedia Commons CC BY-SA 3.0 Nevit Dilmen',
   planned:3,completed,totalUsd:Number((end.costUsd-start.costUsd).toFixed(5)),
   unpricedCalls:end.unpricedCalls-start.unpricedCalls,
   providerFailures:end.failedCalls-start.failedCalls,
   cases:summaries,
   note:'Anatomy-aware thyroid observer; lesion labels remain hidden. Compare with prior blind/no-region trial. Not cine-clip benchmark or pathology gold-standard.'
 };
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('THYROID_ULTRASOUND_PUBLIC_THREE_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBe(3);
},1200000);
