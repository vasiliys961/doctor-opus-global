import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyzeBenchmarkMedicalImage} from './medical-vision';
import {callDiagnosticAgent,getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
import {MODELS} from '../openrouter';

type SourceCase={id:string;label:'benign'|'malignant';file:string;sourceMetadataUrl:string;
  sha256:string;bytes:number;declaredIndividualLicense:string|null;licensedViaOfficial2016CC0Dataset:boolean};
const SOURCE='isic2016-ten/manifest.json';
const OUT='internal-results/isic2016-ten';
const SOFT_CEILING_USD=0.85;
/** The class comparison measures lesion malignancy classification, not whether
 * melanoma is mentioned anywhere in a differential diagnosis. */
type Opinion={classification:'benign'|'malignant'|'uncertain';reason:string;confidence:number|null};
function parseOpinion(raw:string):Opinion|null{
 const i=raw.indexOf('{'),j=raw.lastIndexOf('}');
 if(i<0||j<=i)return null;
 try{
  const x=JSON.parse(raw.slice(i,j+1)) as Record<string,unknown>;
  if(!['benign','malignant','uncertain'].includes(String(x.classification)) ||
    typeof x.reason!=='string' || x.reason.length<6) return null;
  const confidence=typeof x.confidence==='number' && x.confidence>=0 && x.confidence<=1?x.confidence:null;
  return {classification:x.classification as Opinion['classification'],
    reason:x.reason.slice(0,1200),confidence};
 }catch{return null;}
}
function score(rows:Array<{reference:string;prediction:string}>){
 const positive=rows.filter(r=>r.reference==='malignant');
 const negative=rows.filter(r=>r.reference==='benign');
 const tp=positive.filter(r=>r.prediction==='malignant').length;
 const tn=negative.filter(r=>r.prediction==='benign').length;
 const fn=positive.filter(r=>r.prediction!=='malignant').length;
 const fp=negative.filter(r=>r.prediction==='malignant').length;
 const uncertain=rows.filter(r=>r.prediction==='uncertain').length;
 const wrong=rows.filter(r=>r.prediction!=='uncertain'&&r.prediction!==r.reference).length;
 const correct=tp+tn;
 return {total:rows.length,malignant:positive.length,benign:negative.length,
  correct,incorrectOrUncertain:rows.length-correct,wrong,uncertain,tp,tn,fn,fp,
  accuracy:rows.length?correct/rows.length:null,
  malignantSensitivity:positive.length?tp/positive.length:null,
  benignSpecificity:negative.length?tn/negative.length:null};
}
it('10 actual open ISIC 2016 Task3 CC0 dermoscopy images (5/5), blinded malignancy decision',async()=>{
 const manifest=JSON.parse(readFileSync(SOURCE,'utf8'));
 const cases=manifest.cases as SourceCase[];
 if(cases.length!==10 || cases.filter(x=>x.label==='benign').length!==5 ||
  cases.filter(x=>x.label==='malignant').length!==5)
   throw Error('Invalid balanced 10-image ISIC official source manifest');
 if(cases.some(x=>!x.licensedViaOfficial2016CC0Dataset))throw Error('ISIC source not verified');
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/answers.jsonl','');
 writeFileSync(OUT+'/method.json',JSON.stringify({
  dataset:manifest.dataset,selection:manifest.selection,licenseBasis:manifest.licenseBasis,
  sourceSha256:manifest.sourceSha256,sourceUrls:cases.map(x=>({id:x.id,url:x.sourceMetadataUrl})),
  modality:'dermatoscopy',observer:'Gemini 3.8 Flash',secondRead:'conditional independent Gemini 3.1 Pro',
  reportAndClassifier:'Sonnet 5.5',labelsBlinded:true,referenceAvailableAfterInference:true,
  budgetGuardUsd:SOFT_CEILING_USD,
  caveat:'Very small public TRAIN split; NOT histology-verified for every lesion; NOT Stanford DDI/MIDAS; no representative clinical accuracy estimate'
 },null,2));
 const started=getDiagnosticApiUsageSnapshot();
 let attempted=0,reason:string|null=null;
 const scored:Array<{reference:string;prediction:string}>=[];
 for(const item of cases){
  const usage=getDiagnosticApiUsageSnapshot();
  if(usage.costUsd-started.costUsd>SOFT_CEILING_USD*0.80 || usage.unpricedCalls>started.unpricedCalls){
   reason='Reached measured-cost guard or model missing price';break;
  }
  const bytes=readFileSync(item.file);
  if(createHash('sha256').update(bytes).digest('hex')!==item.sha256 || bytes.length!==item.bytes)
   throw Error('Source image changed since preflight');
  if(bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Not source JPEG');
  const before=getDiagnosticApiUsageSnapshot(),t0=Date.now();
  try{
   // Model sees PIXELS ONLY, not ISIC id, file name, sample category or gold label.
   const study=await analyzeBenchmarkMedicalImage({
    modality:'dermatoscopy',
    images:[{mimeType:'image/jpeg',base64:bytes.toString('base64')}],
    allowSecondRead:true
   });
   // Independent calibrated-looking confidence is merely model self-report;
   // only explicit class is scored. Diagnosis names and reference withheld.
   const opinionCall=await callDiagnosticAgent({
    model:MODELS.SONNET,maxTokens:500,reasoningEffort:'low',
    systemPrompt:[
     'You are a dermatology specialist classifying an EXAMINATION image based only on the observation and report below.',
     'Choose the best-supported malignancy class: benign (no melanoma suspicion), malignant (melanoma suspected) or uncertain.',
     'These are image-only observations. No pathology, prior clinical history or gold labels were provided.',
     'Do not mistake every mention of melanoma in a differential as a certain malignant prediction.',
     'When visual evidence cannot reliably discriminate melanoma, return uncertain instead of claiming benign.',
     'Return exactly JSON: {"classification":"benign|malignant|uncertain","confidence":0.0,"reason":"short evidence-based explanation"}',
     'Confidence is uncalibrated impression, not a probability of malignancy.'
    ].join('\n'),
    userContent:'IMAGE-ONLY STRUCTURED OBSERVATION:\n'+JSON.stringify(study.observation)+
      '\nREPORT FROM IMAGE FINDINGS ONLY:\n'+study.report
   });
   if(opinionCall.error)throw Error('Classifier LLM unavailable');
   const opinion=parseOpinion(opinionCall.content);
   if(!opinion)throw Error('Invalid JSON class decision');
   const after=getDiagnosticApiUsageSnapshot();
   const row={
    id:item.id,sha256:item.sha256,groundTruth:item.label,
    prediction:opinion.classification,reason:opinion.reason,confidence:opinion.confidence,
    correct:opinion.classification===item.label,
    visualModelChain:study.models,secondRead:study.secondRead,
    secondReadReasons:study.secondReadReasons,observation:study.observation,
    report:study.report,analysisSeconds:Number(((Date.now()-t0)/1000).toFixed(2)),
    measuredCostUsd:Number((after.costUsd-before.costUsd).toFixed(5)),
    unpricedCalls:after.unpricedCalls-before.unpricedCalls
   };
   appendFileSync(OUT+'/answers.jsonl',JSON.stringify(row)+'\n');
   scored.push({reference:item.label,prediction:opinion.classification});
   attempted++;
   console.log('MAST_ISIC_CASE '+JSON.stringify({
    id:row.id,actual:row.groundTruth,predicted:row.prediction,
    correct:row.correct,secondRead:row.secondRead,
    seconds:row.analysisSeconds,cost:row.measuredCostUsd,unpricedCalls:row.unpricedCalls
   }));
   if(row.unpricedCalls>0){reason='Unpriced provider calls';break;}
  }catch(error){
   reason=error instanceof Error?error.message:'Unknown case failure';
   console.log('MAST_ISIC_CASE_FAILURE '+JSON.stringify({id:item.id,reason}));
   break;
  }
 }
 const end=getDiagnosticApiUsageSnapshot();
 const summary={
  planned:10,attempted,missing:10-attempted,
  ...score(scored),
  measuredCostUsd:Number((end.costUsd-started.costUsd).toFixed(5)),
  modelApiFailures:end.failedCalls-started.failedCalls,
  unpricedCalls:end.unpricedCalls-started.unpricedCalls,stopReason:reason,
  warning:'Balanced ten-case development sample. Not a patient-level external validation, not DDI/MIDAS, and self-confidence is not calibrated.'
 };
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('MAST_ISIC10_SUMMARY '+JSON.stringify(summary));
 expect(attempted).toBe(10);
 expect(summary.unpricedCalls).toBe(0);
},1800000);
