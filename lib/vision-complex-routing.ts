/** Independent, cheap, testable complex-image routing policy. */
export type ImageRoutingMetadata={
  self_confidence?: number;
  difficulty_level?: number;
  image_quality?: 'good'|'acceptable'|'moderate'|'poor'|'non_diagnostic';
  ambiguous_findings?: boolean;
  needs_second_read?: boolean;
};
export function evaluateComplexVisionRouting(
  modality: string, evidence: ImageRoutingMetadata,
  opts:{forceProHighRisk?:boolean}={}
):{escalate:boolean;reasons:string[]}{
  const reasons:string[]=[];
  const normalized=String(modality||'').trim().toLowerCase();
  const highRisk=new Set(['ct','mri','histology','mammography']);
  if(opts.forceProHighRisk && highRisk.has(normalized))reasons.push('high_risk_modality');
  if(typeof evidence.self_confidence==='number' && evidence.self_confidence<0.75)reasons.push('low_self_confidence');
  if(typeof evidence.difficulty_level==='number' && evidence.difficulty_level>=4)reasons.push('high_difficulty');
  if(evidence.image_quality==='poor'||evidence.image_quality==='non_diagnostic')reasons.push('poor_image_quality');
  if(evidence.ambiguous_findings)reasons.push('ambiguous_findings');
  if(evidence.needs_second_read)reasons.push('second_read_requested');
  return {escalate:reasons.length>0,reasons};
}
