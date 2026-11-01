/** Standalone MAST competition multimodal clinical chat bridge.
 *
 * Reuses the actual parent Doctor Opus 5-role consilium instead of creating
 * a competing chat brain. Specialized ECG Opus, multi-view comparisons and
 * Radiology's validated source evidence enter as LIMITED SOURCE REPORTS.
 *
 * Never implies the consilium directly reviewed pixels: only imaging
 * specialists received originals. Public benchmark labels are NEVER inputs.
 * This is not an official MAST endpoint or a medical device claim.
 */
import {runConsilium} from '../diagnostics/orchestrator';
import {analyzeECGOpusImage} from './ecg-opus-image';
import type {ECGImageInput} from './ecg-opus-image';
import {compareBenchmarkMedicalImages} from './source-bound-comparison';
import type {ComparisonInput} from './source-bound-comparison';
import {importRadiologySourceEvidence} from './radiology-source-evidence';
import type {EvidenceItem} from './source-bound-evidence';
import {arbitrateSourceEvidence} from './source-bound-evidence';
import {formatMastAnswer} from './mast';
import {analyzeBenchmarkMedicalImage,validateVisionInput} from './medical-vision';
import type {BenchmarkImageInput} from './medical-vision';
import {runNonBlockingCpuPair} from './nonblocking-cpu-detector';
import {planCpuDetector} from './cpu-only-detector-policy';
import type {CpuReadiness} from './cpu-only-detector-policy';
import {validatedOriginalXrvScores} from './lightweight-xray-cpu';

export type ClinicalStudy=
 | {kind:'ecg-opus';sourceId:string;input:ECGImageInput}
 | {kind:'comparison';sourceId:string;input:ComparisonInput}
 | {kind:'radiology';sourceId:string;nativeEvidence:unknown}
 | {kind:'chest-xray';sourceId:string;input:BenchmarkImageInput};

/** External original CPU host is injected only by trusted server code.
 * Never read a client-submitted URL or provision weights at request time.
 */
export type CpuXrayExecution={
 readiness:CpuReadiness;
 execute:(input:BenchmarkImageInput,signal:AbortSignal)=>Promise<unknown>;
};
export type UnifiedClinicalOptions={cpuXray?:CpuXrayExecution};
export type UnifiedClinicalRequest={
 caseText:string;
 studies:ClinicalStudy[];
};

export type UnifiedClinicalResult={
 protocol:'doctor-opus-contest-unified/v1';
 leadingWorkingDiagnosis:string;
 reasoning:string;
 reviewRequired:boolean;
 reviewReason?:string;
 sourceCount:number;
 sourceSummaries:Array<{
  sourceId:string;kind:ClinicalStudy['kind'];status:'unverified'|'partly_verified';
  limitations:string[];
 }>;
 evidence:EvidenceItem[];
 report:string;
 totalConsiliumCostUsd:number;
 totalSpecialistCostUsd:number;
 totalEstimatedCostUsd:number;
 elapsedMs:number;
 cpuDetectorRuns:Array<{sourceId:string;state:'ready'|'timed_out'|'failed'|'disabled';elapsedMs:number}>;
};

/** Neither data filenames nor source study timestamps are patient identifiers. */
const SOURCE=/^[A-Za-z0-9_.:-]{1,80}$/;
export function validateUnifiedClinicalRequest(input:UnifiedClinicalRequest):void{
 if(!input||typeof input.caseText!=='string'||!input.caseText.trim()||
    input.caseText.length>16000||!Array.isArray(input.studies)||
    !input.studies.length||input.studies.length>4)
  throw Error('Invalid contest clinical question or source study count');
 const seen=new Set<string>();
 for(const item of input.studies){
  if(!item||!SOURCE.test(item.sourceId)||seen.has(item.sourceId))
   throw Error('Missing or duplicate imaging source');
  seen.add(item.sourceId);
  if(!['ecg-opus','comparison','radiology','chest-xray'].includes(item.kind))
   throw Error('Unsupported specialist module');
  if(item.kind==='ecg-opus'&&!item.input?.image)
   throw Error('Actual ECG image is required');
  if(item.kind==='comparison'&&!item.input?.frames)
   throw Error('Original comparative images required');
  if(item.kind==='chest-xray'){
   if(!item.input||item.input.modality!=='xray')throw Error('Chest X-ray source required');
   validateVisionInput(item.input);
   if(item.input.images.length!==1)throw Error('Exactly one original chest X-ray for CPU pilot');
  }
  if(item.kind==='radiology'&&!item.nativeEvidence)
   throw Error('Native radiology evidence required');
 }
}

function bounded(s:string,n:number):string{return s.length>n?s.slice(0,n)+' [TRUNCATED]':s;}

/** Format evidence with explicit provenance. Source reports are observations/
 * suggestions, NOT expert reference diagnoses or confirmed chart findings. */
export function buildSourceClinicalContext(
 reports:Array<{sourceId:string;kind:string;report:string;limitations:string[]}>
):string{
 if(!reports.length||reports.length>4)throw Error('No specialist reports');
 return reports.map((r,i)=>{
  if(!SOURCE.test(r.sourceId)||!r.report.trim()||r.report.length>24000)
   throw Error('Unbounded or unproven specialist report');
  return [
   'SPECIALIST SOURCE '+(i+1)+' ['+r.kind+' / '+r.sourceId+']',
   'UNVERIFIED SPECIALIST REPORT. The clinical consilium did not directly inspect the source pixels.',
   'Do not promote model candidate to observed diagnosis. Do not assume the full imaging series was reviewed.',
   'If numerical measures are unverified, qualify them. If a mandatory source is missing, report incomplete coverage.',
   'FINDINGS:',bounded(r.report,8500),
   'LIMITATIONS:',bounded(r.limitations.join('; ')||'No independent human review',900)
  ].join('\n');
 }).join('\n\n-----\n\n');
}

export async function runUnifiedClinicalChat(
 input:UnifiedClinicalRequest,options:UnifiedClinicalOptions={}
):Promise<UnifiedClinicalResult>{
 validateUnifiedClinicalRequest(input);
 const startedAt=Date.now();
 let specialistCostUsd=0;
 const cpuDetectorRuns:UnifiedClinicalResult['cpuDetectorRuns']=[];
 const summaries:UnifiedClinicalResult['sourceSummaries']=[];
 const reports:Array<{sourceId:string;kind:string;report:string;limitations:string[]}>=[];
 const evidence:EvidenceItem[]=[];
 // Intentionally sequential: per-source provenance and clear provider failure,
 // not a silent substitution of an unrelated source or invented finding.
 for(const study of input.studies){
  if(study.kind==='ecg-opus'){
   const result=await analyzeECGOpusImage(study.input);
   if(Number.isFinite(result.costUsd)&&result.costUsd>=0)specialistCostUsd+=result.costUsd;
   const limitations=[
    'Visual ECG and algorithmic digital measurements are unverified; not ECGFounder',
    'Absence of source calibration or uncertain atrial activity limits interpretation'
   ];
   summaries.push({sourceId:study.sourceId,kind:study.kind,status:'unverified',limitations});
   reports.push({sourceId:study.sourceId,kind:study.kind,report:result.report,limitations});
   evidence.push({id:'ecg:'+study.sourceId,sourceId:study.sourceId,modality:'ecg',
    bodyRegion:'heart',finding:bounded(result.report,4600),status:'inferred',
    coverage:'partial',model:result.models.join('+'),limitations});
  }else if(study.kind==='comparison'){
   const result=await compareBenchmarkMedicalImages(study.input);
   if(Number.isFinite(result.estimatedCostUsd)&&result.estimatedCostUsd>=0)
    specialistCostUsd+=result.estimatedCostUsd;
   const limitations=[...result.limitations,
    'Comparison is generated from selected originals only; image registration or calibrated measurement unavailable'];
   summaries.push({sourceId:study.sourceId,kind:study.kind,status:'unverified',limitations});
   reports.push({sourceId:study.sourceId,kind:study.kind,report:result.report,limitations});
   evidence.push({id:'compare:'+study.sourceId,sourceId:study.sourceId,modality:study.input.modality,
    bodyRegion:study.input.examRegion||'unspecified',finding:bounded(result.report,4600),
    status:'inferred',coverage:'partial',model:'source-bound Gemini+Opus comparative',limitations});
  }else if(study.kind==='chest-xray'){
   // Fast model-based visual observation starts immediately. The external,
   // source-verified CPU original model runs alongside it, never in series.
   // The specialist consilium starts promptly even if the CPU model hangs.
   const plan=planCpuDetector('chest-xray',options.cpuXray?.readiness);
   const cpu=plan.execute&&options.cpuXray
     ?(signal:AbortSignal)=>options.cpuXray!.execute(study.input,signal).then(
       report=>validatedOriginalXrvScores(study.input,report))
     :undefined;
   const pair=await runNonBlockingCpuPair(
     ()=>analyzeBenchmarkMedicalImage(study.input),cpu,
     {detectorMaxMs:8000,afterVisionGraceMs:1500}
   );
   if(Number.isFinite(pair.visual.estimatedCostUsd)&&pair.visual.estimatedCostUsd>=0)
    specialistCostUsd+=pair.visual.estimatedCostUsd;
   cpuDetectorRuns.push({sourceId:study.sourceId,state:pair.detector.state,
    elapsedMs:pair.detector.elapsedMs});
   const limitations=[
    'Only submitted radiograph reviewed; other views or comparisons not assessed',
    'Image reading is model inference without independent physician confirmation',
    'Optional original CPU model does not establish pathology or negative findings',
    'GPU is prohibited; no automatic model download or paid CPU/GPU fallback'
   ];
   const status=pair.detector.state;
   const sourceReport=pair.visual.report;
   const detectorDetail=pair.detector.state==='ready'
    ?'CPU original six-head scores (UNCALIBRATED, NOT DIAGNOSES): '+
      JSON.stringify(pair.detector.value.unverifiedScores)
    :'CPU detector '+status+': not assessed. Continue based on independent visual report, not a negative result.';
   const report=bounded(sourceReport,8000)+'\n'+detectorDetail;
   summaries.push({sourceId:study.sourceId,kind:study.kind,status:'unverified',limitations});
   reports.push({sourceId:study.sourceId,kind:study.kind,report,limitations});
   evidence.push({id:'vision:'+study.sourceId,sourceId:study.sourceId,modality:'xray',
    bodyRegion:'chest',finding:bounded(sourceReport,4600),status:'inferred',
    coverage:'partial',model:pair.visual.models.join('+'),limitations});
   if(pair.detector.state==='ready'){
    evidence.push({id:'xrv:'+study.sourceId,sourceId:study.sourceId,modality:'xray',
     bodyRegion:'chest',finding:'UNVERIFIED ORIGINAL CPU SCORES: '+
        JSON.stringify(pair.detector.value.unverifiedScores),
     status:'inferred',coverage:'partial',model:'nih-densenet121-cpu',limitations:[
      pair.detector.value.warning,'Not an expert-confirmed finding']});
   }
  }else{
   const result=importRadiologySourceEvidence(study.sourceId,study.nativeEvidence);
   const limitations=[...result.limitations,
    'Detector candidates are unverified. A reviewed source finding is not by itself a confirmed diagnosis.',
    'Study completeness, negative findings, and extra anatomy require source verification'];
   summaries.push({sourceId:study.sourceId,kind:study.kind,
    status:result.evidence.some(x=>x.status==='observed')?'partly_verified':'unverified',limitations});
   const findingText=result.evidence.length?result.evidence.map(x=>
     x.status.toUpperCase()+': '+x.finding+' [source '+x.id+']').join('\n'):'No imported radiology findings';
   reports.push({sourceId:study.sourceId,kind:study.kind,report:findingText,limitations});
   evidence.push(...result.evidence);
  }
 }
 // Fail-closed coverage gate from Sono / radiology: no imputed negative scan.
 const arbiter=arbitrateSourceEvidence(evidence,[],input.studies.map(s=>s.sourceId));
 const transcript=buildSourceClinicalContext(reports)+
  '\n\nCOVERAGE ARBITER:\n'+arbiter.limitations.join('; ')+
  '\nDo not infer absence of a critical lesion from an unassessed series. '+
  'Preserve the mother Doctor Opus workflow: rank the most likely WORKING diagnosis, '+
  'justify differential diagnoses, uncertainty and safety actions.';
 const result=await runConsilium({
  patientId:'competition-anonymized',freeTextInput:input.caseText,
  attachedDocuments:[transcript]
 });
 return{
  protocol:'doctor-opus-contest-unified/v1',
  leadingWorkingDiagnosis:result.finalDiagnosis.diagnosis,
  reasoning:result.finalDiagnosis.reasoning,
  reviewRequired:result.requiresHumanReview||arbiter.limitations.length>0,
  reviewReason:result.reviewReason||arbiter.limitations.join('; '),
  sourceCount:input.studies.length,sourceSummaries:summaries,
  evidence,report:formatMastAnswer(result).response,
  totalConsiliumCostUsd:result.totalCostUsd,
  totalSpecialistCostUsd:Number(specialistCostUsd.toFixed(6)),
  totalEstimatedCostUsd:Number((specialistCostUsd+result.totalCostUsd).toFixed(6)),
  elapsedMs:Date.now()-startedAt,
  cpuDetectorRuns
 };
}
