/** ECG Opus IMAGE route, based on vasiliys961/ecg-opus-global.
 * This is NOT the 531-feature model and NOT original digital ECGFounder weights.
 * Gemini visual observation -> Claude Opus visual + clinical critique.
 * Research-only, original input pixels in both stages, no source labels.
 */
import {callDiagnosticAgent} from '../diagnostics/llm-client';
import {MODELS} from '../openrouter';

export type ECGImageInput={image:{base64:string;mimeType:'image/png'|'image/jpeg'|'image/webp'}};
export function validateECGImage(input:ECGImageInput):void{
 if(!input?.image||!['image/png','image/jpeg','image/webp'].includes(input.image.mimeType)||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(input.image.base64)||input.image.base64.length>12_000_000)
   throw Error('Invalid or oversized original 12-lead ECG image');
}
export async function analyzeECGOpusImage(input:ECGImageInput){
 validateECGImage(input);
 const image={type:'image_url' as const,image_url:{url:'data:'+input.image.mimeType+';base64,'+input.image.base64}};
 const first=await callDiagnosticAgent({
  systemPrompt:`You are an expert ECG physician performing only structured independent
 visual extraction of a 12-lead ECG image. Follow a Minnesota-code-inspired
 systematic sequence: lead labels, recording/calibration when visible, rhythm,
 intervals if readable, frontal axis if inferable, QRS/ST/T morphology, ectopy.
 For every measurement distinguish directly printed on the image from
 estimated/unreadable. Do not invent millimetres, heart rate, diagnosis,
 patient metadata or calibration. Return concise observations.`,
  userContent:[{type:'text',text:'Inspect only these original ECG pixels. No reference diagnosis is provided.'},image],
  model:MODELS.GEMINI_3_FLASH,maxTokens:2000,reasoningEffort:'low',
 });
 if(first.error||first.content.trim().length<40)throw Error('ECG visual observation failed');
 const second=await callDiagnosticAgent({
  systemPrompt:`You are Claude Opus, a cardiologist independently examining an original
 ECG image and checking a junior reader's unverified observations. Review the
 ORIGINAL pixels independently; correct lead/rhythm/conduction/ST-T claims.
 Write a clinical ECG interpretation: rhythm, rate when known, axis, intervals,
 morphology, most likely electrocardiographic abnormalities, critical
 differentials and recording limitations. Label any unmeasured parameters
 UNKNOWN; never claim ECGFounder/NeuroKit or digital waveform was executed.
 A score from another model is not a diagnostic probability.`,
  userContent:[{type:'text',text:'Review original ECG image, then critically compare with unverified Gemini observations:\n'+first.content},image],
  model:MODELS.OPUS,maxTokens:2700,reasoningEffort:'low',
 });
 if(second.error||second.content.trim().length<70)throw Error('ECG Opus image interpretation failed');
 return{modality:'ecg',route:'ecg-opus-image-gemini-to-opus',
  geminiVisualDescription:first.content,report:second.content.trim(),
  models:[MODELS.GEMINI_3_FLASH,MODELS.OPUS],
  digitalECGFounderExecuted:false,
  measurementsAreCalibrated:false,
  costUsd:first.costUsd+second.costUsd};
}
