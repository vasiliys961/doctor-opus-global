/**
 * Experimental MAST multimodal adapter. Contest branch ONLY; no production
 * patient records, no remote image URL fetches, and no benchmark answer keys.
 * Mirrors the parent Doctor Opus observer -> interpretation design, reusing
 * read-only prompt/formatting helpers that already exist in this branch.
 */
import { getDescriptionPrompt, prepareVisionDataForTextPrompt } from '../../../lib/prompts';
import type { ImageType, Specialty } from '../../../lib/prompts';
import { evaluateComplexVisionRouting } from '../../../lib/vision-complex-routing';
import { getDiagnosticReportSystemPrompt } from '../../../lib/diagnostic-report';
import { callDiagnosticAgent } from '../diagnostics/llm-client';
import { MODELS } from '../openrouter';

export type BenchmarkImageModality = 'xray' | 'ct' | 'mri' | 'ecg' | 'dermatoscopy' | 'ultrasound';
export type BenchmarkImageInput = {
  modality: BenchmarkImageModality;
  images: Array<{ base64: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }>;
  allowSecondRead?: boolean;
};
export type BenchmarkVisionOutput = {
  modality: BenchmarkImageModality;
  observation: Record<string, unknown>;
  report: string;
  secondRead: boolean;
  secondReadReasons: string[];
  models: string[];
  estimatedCostUsd: number;
};
const MAX_IMAGES = 3;
const MAX_BASE64_CHARS = 16_000_000;
const specialties: Record<BenchmarkImageModality, Specialty> = {
  xray: 'radiology', ct: 'radiology', mri: 'radiology',
  ecg: 'cardiology', dermatoscopy: 'dermatology', ultrasound: 'radiology'
};

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^\s*\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60\s*$/,'').trim();
  for(const candidate of [cleaned,cleaned.slice(cleaned.indexOf('{'),cleaned.lastIndexOf('}')+1)]){
    if(!candidate.startsWith('{'))continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if(parsed && typeof parsed==='object' && !Array.isArray(parsed))return parsed as Record<string,unknown>;
    } catch { /* a malformed visual extraction is not evidence */ }
  }
  return null;
}
export function parseVisionObservation(text:string):Record<string,unknown>|null {
  return parseJson(text);
}
export function getVisionRoutingDecision(modality:BenchmarkImageModality,data:Record<string,unknown>) {
  const routing=data.routing && typeof data.routing==='object' ? data.routing as Record<string,unknown> : {};
  const study=data.study && typeof data.study==='object' ? data.study as Record<string,unknown> : {};
  return evaluateComplexVisionRouting(modality,{
    self_confidence:typeof routing.self_confidence==='number'?routing.self_confidence:undefined,
    difficulty_level:typeof routing.difficulty_level==='number'?routing.difficulty_level:undefined,
    image_quality:typeof study.image_quality==='string' ? study.image_quality as 'good'|'acceptable'|'moderate'|'poor'|'non_diagnostic' : undefined,
    ambiguous_findings:routing.ambiguous_findings===true,
    needs_second_read:routing.needs_second_read===true
  });
}
export function validateVisionInput(input:BenchmarkImageInput):void {
  if(!input.images.length||input.images.length>MAX_IMAGES)throw Error('Invalid number of benchmark images');
  for(const img of input.images){
    // Reject remote references. A source image is supplied as inline pixels only.
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(img.base64) || img.base64.length>MAX_BASE64_CHARS)
      throw Error('Invalid or oversized base64 medical image');
    if(!['image/jpeg','image/png','image/webp'].includes(img.mimeType))throw Error('Unsupported image MIME type');
  }
}
export function buildReportInstruction(modality:BenchmarkImageModality):string {
  if(modality==='dermatoscopy')return 'You are an expert dermatologist interpreting STRUCTURED OBSERVATIONS from a dermoscopic image. State observable morphology, likely diagnoses with diagnostic uncertainty, clinically relevant red flags, and next diagnostic actions. Do not invent image findings, patient history or certainty. Separate visible findings from interpretations.';
  if(modality==='ecg')return getDiagnosticReportSystemPrompt('ecg');
  return getDiagnosticReportSystemPrompt('radiology');
}
export async function analyzeBenchmarkMedicalImage(input:BenchmarkImageInput):Promise<BenchmarkVisionOutput> {
  validateVisionInput(input);
  const modality=input.modality as ImageType;
  const pixels=input.images.map(image=>({type:'image_url' as const,image_url:{url:'data:'+image.mimeType+';base64,'+image.base64}}));
  const prompt=getDescriptionPrompt(modality,specialties[input.modality]);
  const first=await callDiagnosticAgent({
    systemPrompt:prompt,
    userContent:[{type:'text',text:'Observe the original image pixels independently. Do not diagnose.'},...pixels],
    model:MODELS.GEMINI_3_FLASH,maxTokens:3500,reasoningEffort:'low'
  });
  const firstJson=first.error?null:parseVisionObservation(first.content);
  const routing=firstJson ? getVisionRoutingDecision(input.modality,firstJson)
    : {escalate:true,reasons:['invalid_visual_json']};
  let observation=firstJson;
  let secondRead=false;
  let cost=first.costUsd;
  const models=[MODELS.GEMINI_3_FLASH];
  if(routing.escalate && input.allowSecondRead!==false) {
    const second=await callDiagnosticAgent({
      systemPrompt:prompt,
      userContent:[{type:'text',text:'Provide an INDEPENDENT second read from the original image(s); describe only findings.'},...pixels],
      model:MODELS.GEMINI_3_PRO,maxTokens:3500,reasoningEffort:'low'
    });
    cost+=second.costUsd;
    models.push(MODELS.GEMINI_3_PRO);
    const secondJson=second.error?null:parseVisionObservation(second.content);
    if(secondJson){observation=secondJson;secondRead=true;}
  }
  if(!observation)throw Error('No valid structured visual observation from permitted images');
  // The clinical interpretation sees factual observations, not pixels, to
  // avoid the observer instructing or biasing the second model's diagnosis.
  const reportCall=await callDiagnosticAgent({
    systemPrompt:buildReportInstruction(input.modality),
    userContent:'STRUCTURED IMAGE FINDINGS (not verified diagnoses):\n'+JSON.stringify(prepareVisionDataForTextPrompt(observation))+
      '\nReturn the modality-appropriate clinical report. Do not claim clinical history or measurements absent from the source.',
    model:MODELS.SONNET,maxTokens:1800,reasoningEffort:'low'
  });
  cost+=reportCall.costUsd;
  if(reportCall.error || reportCall.content.trim().length<60)throw Error('Medical-image reporting stage failed');
  return {
    modality:input.modality,observation,report:reportCall.content.trim(),
    secondRead,secondReadReasons:routing.reasons,models,estimatedCostUsd:cost
  };
}
