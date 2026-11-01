/** Source-bound findings and cross-specialty arbiter, adapted from the
 * standalone Sono's Brain1 -> Brain2 -> arbiter pattern and Opus Radiology's
 * per-frame evidence reconciliation. Only contest benchmark implementation.
 * No clinical inference; does not invent diagnoses, thresholds or masks.
 */
export type EvidenceStatus='observed'|'inferred'|'unknown'|'not_assessed';
export type Coverage='complete'|'partial'|'not_assessed';
export type EvidenceItem={
 id:string;
 sourceId:string;                 // opaque benchmark input identifier, not patient ID
 modality:string;
 bodyRegion:string;
 frameId?:string;
 finding:string;
 status:EvidenceStatus;
 coverage:Coverage;
 model:string;
 limitations?:string[];
};
export type HypothesisProposal={
 id:string;
 label:string;
 supportingEvidenceIds:string[];
 contradictingEvidenceIds?:string[];
};
export type SourceArbitration={
 accepted:Array<{id:string;label:string;supportingEvidenceIds:string[];contradictingEvidenceIds:string[]}>;
 rejected:Array<{id:string;reason:string}>;
 limitations:string[];
 negativeFindingsAllowed:boolean;
};
const SAFE_ID=/^[A-Za-z0-9_.:-]{1,120}$/;
function safeText(value:unknown):value is string{
 return typeof value==='string'&&value.trim().length>0&&value.length<=5000;
}
export function arbitrateSourceEvidence(
 evidence:readonly EvidenceItem[], proposals:readonly HypothesisProposal[], expectedSourceIds:readonly string[]
):SourceArbitration{
 if(!expectedSourceIds.length||expectedSourceIds.length>16||
    new Set(expectedSourceIds).size!==expectedSourceIds.length||
    expectedSourceIds.some(s=>!SAFE_ID.test(s)))
   throw Error('Invalid source scope');
 const sources=new Set(expectedSourceIds),byId=new Map<string,EvidenceItem>();
 for(const item of evidence){
  if(!SAFE_ID.test(item.id)||!SAFE_ID.test(item.sourceId)||!sources.has(item.sourceId)||
     byId.has(item.id)||!safeText(item.finding)||!safeText(item.modality)||
     !safeText(item.bodyRegion)||!safeText(item.model)||
     !['observed','inferred','unknown','not_assessed'].includes(item.status)||
     !['complete','partial','not_assessed'].includes(item.coverage)||
     (item.frameId!==undefined&&!SAFE_ID.test(item.frameId)))
   throw Error('Unverified source evidence');
  byId.set(item.id,item);
 }
 const complete=expectedSourceIds.every(sourceId=>
   evidence.some(e=>e.sourceId===sourceId&&e.status==='observed'&&e.coverage==='complete'));
 const accepted:SourceArbitration['accepted']=[],rejected:SourceArbitration['rejected']=[];
 for(const proposal of proposals){
  if(!SAFE_ID.test(proposal.id)||!safeText(proposal.label)){
   rejected.push({id:'invalid',reason:'invalid_proposal'});continue;
  }
  // Only actual observed evidence can support a hypothesis.
  const support=(proposal.supportingEvidenceIds||[]).filter(id=>byId.get(id)?.status==='observed');
  if(!support.length){rejected.push({id:proposal.id,reason:'no_source_bound_observation'});continue;}
  const contrad=(proposal.contradictingEvidenceIds||[]).filter(id=>byId.get(id)?.status==='observed');
  accepted.push({id:proposal.id,label:proposal.label,
    supportingEvidenceIds:[...new Set(support)],
    contradictingEvidenceIds:[...new Set(contrad)]});
 }
 const limitations:string[]=[];
 if(!complete)limitations.push('Not all source images/series are fully assessed; absence of a finding is not proven');
 if(rejected.length)limitations.push('Some proposed findings lacked direct observed source evidence');
 if(accepted.some(x=>x.contradictingEvidenceIds.length))limitations.push('Source-linked observations conflict');
 return{accepted,rejected,limitations,negativeFindingsAllowed:complete};
}
