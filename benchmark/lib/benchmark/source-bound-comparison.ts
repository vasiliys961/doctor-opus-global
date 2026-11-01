/** Source-bound comparative imaging, contest-only adaptation of mother's
 * /comparative (temporal/location/general), video-comparison and
 * multiple-image transport. Unlike the historic first-image-only failure,
 * this adapter guarantees every labeled frame reaches the actual vision call.
 * It keeps individual observations separate from pairwise interpretations.
 */
import {analyzeBenchmarkMedicalImage,validateVisionInput} from './medical-vision';
import type {BenchmarkImageModality,BenchmarkVisionOutput} from './medical-vision';
import {callDiagnosticAgent} from '../diagnostics/llm-client';
import {MODELS} from '../openrouter';
import {arbitrateSourceEvidence} from './source-bound-evidence';

export type ComparisonMode='temporal'|'position'|'projection'|'general';
export type ComparisonFrame={
 sourceId:string;           // opaque case-local ID; never use names/MRN
 subjectScope:string;       // local cohort ID only; withheld from the model
 sourceSha256:string;
 image:{base64:string;mimeType:'image/jpeg'|'image/png'|'image/webp'};
 date?:string;              // YYYY-MM-DD, may be same for multiview
 position?:string;          // supine/upright/prone/left-lateral etc.
 projection?:string;        // AP/PA/lateral/axial etc.
};
export type ComparisonInput={
 modality:BenchmarkImageModality;
 mode:ComparisonMode;
 examRegion?:'thyroid'|'heart'|'abdomen'|'pelvis'|'vascular'|'musculoskeletal';
 frames:ComparisonFrame[];
};
const SHA=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9_.:-]{1,80}$/;
const DATE=/^\d{4}-\d\d-\d\d$/;

export function validateComparison(input:ComparisonInput):void{
 if(!['temporal','position','projection','general'].includes(input.mode))
  throw Error('Unsupported comparison mode');
 if(input.frames.length<2||input.frames.length>3)
  throw Error('Comparison requires 2 or 3 original images');
 const ids=new Set<string>(),hashes=new Set<string>();
 const scope=input.frames[0].subjectScope;
 if(!ID.test(scope))throw Error('Missing consistent source scope');
 for(const frame of input.frames){
  if(!ID.test(frame.sourceId)||ids.has(frame.sourceId)||!SHA.test(frame.sourceSha256)||
    hashes.has(frame.sourceSha256)||frame.subjectScope!==scope)
    throw Error('Mixed sources, duplicate pixels or mismatched source scope');
  ids.add(frame.sourceId);hashes.add(frame.sourceSha256);
  if(frame.date!==undefined&&(!DATE.test(frame.date)||
     new Date(frame.date).toISOString().slice(0,10)!==frame.date))
    throw Error('Invalid acquisition date');
  for(const v of [frame.position,frame.projection]){
    if(v!==undefined&&(v.length>80||!v.trim()||/[\r\n<>]/.test(v)))
      throw Error('Invalid source image metadata');
  }
  validateVisionInput({modality:input.modality,images:[frame.image],examRegion:input.examRegion});
 }
 if(input.mode==='temporal'&&
   (input.frames.some(f=>!f.date)||new Set(input.frames.map(f=>f.date)).size<2))
  throw Error('Two distinct recorded acquisition dates required');
 if(input.mode==='position'&&input.frames.some(f=>!f.position))
  throw Error('Position required on every image');
 if(input.mode==='projection'&&input.frames.some(f=>!f.projection))
  throw Error('Projection required on every image');
}
export function comparisonMetadata(input:ComparisonInput){
 validateComparison(input);
 // The subject scope, hashes, filenames and patient details must stay local.
 return {
  modality:input.modality,mode:input.mode,
  examRegion:input.examRegion||'unknown',
  frames:input.frames.map(f=>({sourceId:f.sourceId,date:f.date||'unknown',
    position:f.position||'unknown',projection:f.projection||'unknown'})),
  caveat:'A change in projection/position/acquisition can mimic progression; no geometric registration or calibration is established.'
 };
}
export function buildComparisonVisionContent(input:ComparisonInput){
 const metadata=comparisonMetadata(input);
 // All original images, with source labels, not only index zero.
 const content:Array<{type:'text';text:string}|{type:'image_url';image_url:{url:string}}>=[
  {type:'text',text:'Independently assess differences between each numbered ORIGINAL image. Only image-source metadata (not diagnoses) is supplied. Do not infer quantitative progression without matched scales. '+JSON.stringify(metadata)}
 ];
 input.frames.forEach(frame=>{
  content.push({type:'text',text:'Original image sourceId='+frame.sourceId});
  content.push({type:'image_url',image_url:{url:'data:'+frame.image.mimeType+';base64,'+frame.image.base64}});
 });
 return content;
}

export async function compareBenchmarkMedicalImages(input:ComparisonInput){
 const metadata=comparisonMetadata(input);
 // Independently read each source first; do not let a follow-up image overwrite
 // evidence from another study/position or claim full CT/MRI coverage.
 const readings=await Promise.all(input.frames.map(f=>
  analyzeBenchmarkMedicalImage({modality:input.modality,images:[f.image],
    examRegion:input.examRegion,allowSecondRead:false})));
 const comparisonVision=await callDiagnosticAgent({
   model:MODELS.GEMINI_3_PRO,
   systemPrompt:'You are a medical comparative image observer. Describe visible changes between provided labeled originals. Separate actual visible differences from projection and acquisition artefacts. Never invent clinical dates, measurements or diagnoses.',
   userContent:buildComparisonVisionContent(input),
   maxTokens:2200,reasoningEffort:'low',
 });
 if(comparisonVision.error||comparisonVision.content.trim().length<30)
   throw Error('Pairwise vision stage failed');
 const evidence=readings.map((r,i)=>({
  id:'observation'+i,sourceId:input.frames[i].sourceId,
  modality:input.modality,bodyRegion:input.examRegion||'unspecified',
  finding:JSON.stringify(r.observation).slice(0,3000),
  status:'observed' as const,coverage:'partial' as const,
  model:r.models.join(';'),limitations:['Single image only; overall study not assessed']
 }));
 const scope=arbitrateSourceEvidence(evidence,[],input.frames.map(f=>f.sourceId));
 const clinician=await callDiagnosticAgent({
   model:MODELS.SONNET,
   systemPrompt:'You are a senior medical imaging specialist comparing original images over time/views. Distinguish temporal progression from position/projection artefacts. Treat viewer observations as hypotheses, explicitly state unseen study coverage, abstain from quantifying uncalibrated differences, and give a clinically usable comparison report.',
   userContent:JSON.stringify({metadata,sourceReadings:readings.map((r,i)=>({
     sourceId:input.frames[i].sourceId,findings:r.observation,report:r.report
   })),jointOriginalPixelsReview:comparisonVision.content,
     limitations:scope.limitations,negativeFindingsAllowed:scope.negativeFindingsAllowed}),
   maxTokens:1600,reasoningEffort:'low',
 });
 if(clinician.error||clinician.content.trim().length<80)
   throw Error('Comparative report stage failed');
 return{
   mode:input.mode,modality:input.modality,metadata,sourceReadings:readings.map((r,i)=>({
    sourceId:input.frames[i].sourceId,observation:r.observation,report:r.report,
    models:r.models})),
   pairwiseObservation:comparisonVision.content,report:clinician.content.trim(),
   limitations:scope.limitations,completeStudyCoverage:false,
   estimatedCostUsd:readings.reduce((s,r)=>s+r.estimatedCostUsd,0)+comparisonVision.costUsd+clinician.costUsd,
 };
}
