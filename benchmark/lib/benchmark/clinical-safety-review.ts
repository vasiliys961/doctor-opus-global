/**
 * Contest-only optional, evidence-conscious safety audit for MAST management.
 * By default OFF. Audit never changes baseline answers; "enforce" is explicitly
 * experimental and must pass paired NOHARM evaluation before promotion.
 * Do not make product-label assertions that were not in case or retrieved sources.
 */
import {callDiagnosticAgent} from '../diagnostics/llm-client';
import {MODELS} from '../openrouter';
import {matchOfficialDrugLabel,formatOfficialDrugLabelEvidence} from './drug-label-evidence';

export type SafetySignal='severe_drug_reaction'|'anticoagulation_bleeding'|
 'dangerous_electrolyte'|'renal_drug_risk'|'pregnancy_drug_risk';
export type SafetyMode='off'|'audit'|'enforce';
export interface SafetyAudit {
 triggered:SafetySignal[];
 verdict:'pass'|'revise'|'uncertain'|'unavailable';
 issues:string[];
 rewritten:boolean;
 response:string;
 costUsd:number;
 sourceLabels:string[];
}
const safe=(s:string)=>s.toLowerCase();
export function detectSafetySignals(caseText:string):SafetySignal[]{
 const s=safe(caseText),out:SafetySignal[]=[];
 const hit=(r:RegExp)=>r.test(s);
 if(hit(/\bgrade\s*(?:iii|iv|3|4)\b.{0,90}\b(?:infusion|reaction|toxicity|adverse|hypersensitivit)|\b(?:infusion|adverse|hypersensitivit)\b.{0,90}\bgrade\s*(?:iii|iv|3|4)\b/i))
  out.push('severe_drug_reaction');
 if(hit(/\b(?:warfarin|apixaban|rivaroxaban|dabigatran|heparin|anticoagul)/i) &&
   hit(/\b(?:bleed|hemorrhag|gi bleed|thrombocytopen|nsaid|ibuprofen|diclofenac)/i))
  out.push('anticoagulation_bleeding');
 if(hit(/\b(?:potassium|k\+|hyperkalem)/i) &&
   hit(/\b(?:6\.[0-9]|7\.[0-9]|ecg chang|arrhythmia|severe hyperkalem)/i))
  out.push('dangerous_electrolyte');
 if(hit(/\b(?:egfr|gfr|renal failure|acute kidney injury|creatinine clearance)/i) &&
   hit(/\b(?:metformin|aminoglycoside|nsaid|contrast|vancomycin|dabigatran)/i))
  out.push('renal_drug_risk');
 if(hit(/\b(?:pregnant|pregnancy|gestation)/i) &&
   hit(/\b(?:warfarin|isotretinoin|valproate|methotrexate|ace inhibitor|arb)/i))
  out.push('pregnancy_drug_risk');
 return out;
}
export function requestedSafetyMode(value=process.env.MAST_SAFETY_GATE_MODE):SafetyMode{
 return value==='audit'||value==='enforce'?value:'off';
}
function parseAudit(raw:string):{verdict:'pass'|'revise'|'uncertain';issues:string[];revisedAnswer:string}|null{
 const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
 if(first<0||last<=first)return null;
 try {
  const x=JSON.parse(raw.slice(first,last+1)) as Record<string,unknown>;
  if(!['pass','revise','uncertain'].includes(String(x.verdict))||
    !Array.isArray(x.issues)||!x.issues.every(v=>typeof v==='string')||
    typeof x.revisedAnswer!=='string')return null;
  return {verdict:x.verdict as 'pass'|'revise'|'uncertain',issues:x.issues.slice(0,6),
   revisedAnswer:x.revisedAnswer};
 }catch{return null;}
}
export async function auditManagementSafety(args:{
 caseText:string;response:string;references?:string;mode?:SafetyMode
}):Promise<SafetyAudit>{
 const signals=detectSafetySignals(args.caseText);
 const mode=args.mode||requestedSafetyMode();
 const labels=signals.includes('severe_drug_reaction')?matchOfficialDrugLabel(args.caseText):[];
 const sourceLabels=labels.map(label=>label.drug+':'+label.event+':'+label.severity);
 const base:SafetyAudit={triggered:signals,verdict:'pass',issues:[],rewritten:false,response:args.response,costUsd:0,sourceLabels};
 if(mode==='off'||signals.length===0)return base;
 const x=await callDiagnosticAgent({
  model:MODELS.SONNET,maxTokens:2200,reasoningEffort:'low',
  systemPrompt:[
   'You are an independent specialist reviewing a final clinical management plan for preventable harms.',
   'The draft may be wrong. Review only safety-critical decisions supported by the ORIGINAL case and supplied source excerpts.',
   'The most severe foreseeable harms and unsafe re-exposure decisions outrank general stylistic improvements.',
   'If a serious drug reaction is described, distinguish hold vs discontinue vs re-exposure; never quietly allow rechallenge.',
   'Treat an explicitly documented severity grade or event date as part of the given case, not as hallucination.',
   'Do not mark pass when a draft suggests an exception to a possible permanent-discontinuation rule without relevant drug-specific source support; return uncertain when evidence is unavailable.',
   'Do not invent product-label specifics, contraindications, citations, patient data, or claim to have researched sources.',
   'If evidence is missing, label that uncertainty and require an appropriate physician verification before any unsafe action.',
   'Do not change a correct plan simply because a hypothetical harm is possible.',
   'Return JSON only: {"verdict":"pass|revise|uncertain","issues":["brief evidence-based concern"],"revisedAnswer":"complete standalone corrected answer or empty string"}.',
   'If verdict=revise, revisedAnswer MUST directly answer the original question and include case-specific urgent steps, safety, and follow-up.',
   'Otherwise revisedAnswer must be empty.'
  ].join('\n'),
  userContent:'SIGNALS (not diagnoses): '+signals.join(', ')+
    '\nORIGINAL CASE:\n'+args.caseText.slice(0,14000)+
    '\nINDEPENDENT VERIFIED DRUG-LABEL SOURCES (not patient data):\n'+
    (labels.length?formatOfficialDrugLabelEvidence(labels):'(none matched)')+
    '\nADDITIONAL REFERENCES (may be absent):\n'+(args.references||'(none supplied)')+
    '\nUNVERIFIED DRAFT MANAGEMENT:\n'+args.response.slice(0,13000)
 });
 if(x.error)return {...base,verdict:'unavailable',issues:['independent safety reviewer provider unavailable'],costUsd:x.costUsd};
 const result=parseAudit(x.content);
 if(!result)return {...base,verdict:'unavailable',issues:['independent safety reviewer returned invalid JSON'],costUsd:x.costUsd};
 const rewrite=mode==='enforce' && result.verdict==='revise'&&
    result.issues.length>0&&result.revisedAnswer.trim().length>=180;
 return {triggered:signals,verdict:result.verdict,issues:result.issues,rewritten:rewrite,
  response:rewrite?result.revisedAnswer.trim():args.response,costUsd:x.costUsd,sourceLabels};
}
