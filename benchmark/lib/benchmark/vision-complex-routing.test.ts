import {it,expect} from 'vitest';
import {evaluateComplexVisionRouting} from '../../../lib/vision-complex-routing';
import {MODELS} from '../openrouter';

it('distinguishes real Gemini Pro from Flash for complex image escalation',()=>{
  expect(MODELS.GEMINI_3_PRO).toBe('google/gemini-3.1-pro-preview');
  expect(MODELS.GEMINI_3_PRO).not.toBe(MODELS.GEMINI_3_FLASH);
});
it('keeps uncomplicated CT/MRI images on Flash by default',()=>{
  for(const modality of ['ct','mri','xray','dermatoscopy','ecg']){
    expect(evaluateComplexVisionRouting(modality,{self_confidence:0.93,difficulty_level:1,image_quality:'good'}).escalate).toBe(false);
  }
});
it('escalates uncertain visual findings regardless of modality',()=>{
  const scenarios=[
    {mod:'ct',e:{self_confidence:0.6},reason:'low_self_confidence'},
    {mod:'mri',e:{difficulty_level:5},reason:'high_difficulty'},
    {mod:'dermatoscopy',e:{ambiguous_findings:true},reason:'ambiguous_findings'},
    {mod:'xray',e:{needs_second_read:true},reason:'second_read_requested'},
    {mod:'wound',e:{image_quality:'poor' as const},reason:'poor_image_quality'},
  ];
  for(const c of scenarios){
    const r=evaluateComplexVisionRouting(c.mod,c.e);
    expect(r.escalate).toBe(true);
    expect(r.reasons).toContain(c.reason);
  }
});
it('allows explicit high-risk CT or MRI escalation without forcing all by default',()=>{
  const e={self_confidence:0.9,difficulty_level:1,image_quality:'good' as const};
  expect(evaluateComplexVisionRouting('ct',e).escalate).toBe(false);
  expect(evaluateComplexVisionRouting('ct',e,{forceProHighRisk:true}).escalate).toBe(true);
  expect(evaluateComplexVisionRouting('mri',e,{forceProHighRisk:true}).escalate).toBe(true);
  expect(evaluateComplexVisionRouting('dermatoscopy',e,{forceProHighRisk:true}).escalate).toBe(false);
});
