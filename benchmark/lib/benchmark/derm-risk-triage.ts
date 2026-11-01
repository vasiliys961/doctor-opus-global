/**
 * Research-only dermoscopic SAFETY TRIAGE on structured observer findings.
 * Do not reinterpret a benign CNN/VLM class as a confirmed histopathological
 * diagnosis. Age and evolution history matter for peripheral-globule lesions.
 * This creates an uncertainty/referral flag, NOT a melanoma diagnosis.
 */
export type ClinicalDermTriage={
  initialClass:'benign'|'malignant'|'uncertain';
  triage:'benign_appearing'|'urgent_specialist_review'|'specialist_review';
  confidenceOverride:boolean;
  reasons:string[];
};
export function assessDermoscopicTriage(args:{
  observation:Record<string,unknown>;
  prediction:'benign'|'malignant'|'uncertain';
  ageYears?:number|null;
  documentedStableHistory?:boolean;
}):ClinicalDermTriage{
  const {observation,prediction}=args;
  if(prediction==='malignant')return {
    initialClass:prediction,triage:'urgent_specialist_review',
    confidenceOverride:false,reasons:['model_suspects_malignancy']
  };
  if(prediction==='uncertain')return {
    initialClass:prediction,triage:'specialist_review',
    confidenceOverride:false,reasons:['model_cannot_classify']
  };
  // Use only actual POSITIVE structured findings. This avoids treating
  // negated differential phrases in a narrative report as visible signs.
  const findings=Array.isArray(observation.findings)?observation.findings:[];
  const positives=findings.filter((x):x is Record<string,unknown> =>
    typeof x==='object'&&x!==null&&!Array.isArray(x) &&
    x.is_norm!==true
  );
  const globules=positives.some(f=>{
    const sign=String(f.sign||'').toLowerCase();
    const desc=String(f.desc||'').toLowerCase();
    return (/peripheral globules|globular rim|peripheral rim of.*globule|peripheral.*globule/.test(sign) ||
      /(?:rim|ring|circumferential).*globule/.test(desc));
  });
  const ageIsKnown=typeof args.ageYears==='number'&&args.ageYears>=0&&args.ageYears<=120;
  // Age-independent rule would overcall some benign growing nevi. We flag
  // uncertainty only when the relevant patient context is absent.
  if(globules && !ageIsKnown && args.documentedStableHistory!==true){
    return {
      initialClass:prediction,triage:'specialist_review',
      confidenceOverride:true,
      reasons:['peripheral_globules_require_age_and_evolution_context',
        'image_only_benign_prediction_not_sufficient_for_clearance']
    };
  }
  return {
    initialClass:prediction,triage:'benign_appearing',
    confidenceOverride:false,reasons:[]
  };
}
