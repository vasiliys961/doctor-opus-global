import { it,expect } from 'vitest';
import { parseVisionObservation,getVisionRoutingDecision,validateVisionInput,buildReportInstruction } from './medical-vision';

const valid=JSON.stringify({
  schema_version:'vision.extraction.v1',
  study:{image_quality:'good',projection_or_plane:'PA'},
  findings:[{id:'f1',anatomy:'lung',sign:'opacity',observation_confidence:0.9}],
  routing:{self_confidence:0.93,difficulty_level:1,ambiguous_findings:false,needs_second_read:false}
});
it('extracts mother-compatible structured visual evidence, not a diagnosis',()=>{
  expect(parseVisionObservation('Positive context'+'\n'+valid)?.schema_version).toBe('vision.extraction.v1');
  expect(parseVisionObservation('{"diagnosis":"pneumonia"}')).toBeNull();
  expect(parseVisionObservation('not JSON')).toBeNull();
});
it('does not escalate clear chest x-ray evidence merely due to modality',()=>{
  const evidence=parseVisionObservation(valid)!;
  expect(getVisionRoutingDecision('xray',evidence).escalate).toBe(false);
});
it('escalates genuinely uncertain and non-diagnostic images',()=>{
  const e=JSON.parse(valid);
  e.study.image_quality='non_diagnostic';
  e.routing.self_confidence=0.3;
  const decision=getVisionRoutingDecision('xray',e);
  expect(decision.escalate).toBe(true);
  expect(decision.reasons).toContain('poor_image_quality');
  expect(decision.reasons).toContain('low_self_confidence');
});
it('requires actual inline image bytes and prevents arbitrary remote image references',()=>{
  expect(()=>validateVisionInput({modality:'xray',images:[]})).toThrow();
  expect(()=>validateVisionInput({modality:'xray',images:[{base64:'https://example.com/a.jpg',mimeType:'image/jpeg'}]})).toThrow();
  expect(()=>validateVisionInput({modality:'xray',images:[{base64:'AA==',mimeType:'image/png'}]})).not.toThrow();
});
it('uses actual specialty report contracts instead of generic chat instructions',()=>{
  const r=buildReportInstruction('xray');
  expect(r).toContain('Findings');
  expect(r).toContain('Impression');
  expect(buildReportInstruction('ecg')).toContain('ECG');
  expect(buildReportInstruction('dermatoscopy')).toMatch(/dermatolog/i);
});

it('escalates high-confidence critical visual findings to an independent second read',()=>{
  const evidence=JSON.parse(valid);
  evidence.critical_flags=[{flag:'possible critical abnormal silhouette',basis:'image finding',confidence:0.9}];
  const decision=getVisionRoutingDecision('xray',evidence);
  expect(decision.escalate).toBe(true);
  expect(decision.reasons).toContain('critical_visual_flag');
});
