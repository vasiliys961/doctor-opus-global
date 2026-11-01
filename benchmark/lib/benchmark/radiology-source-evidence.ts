/** Import only verified safe anatomy observations from Opus Radiology AI
 * opus-evidence/v1 into the independent MAST contest evidence ledger.
 * Inspired by vasiliys961/opus-radiology-ai/web/lib/evidence-json.ts.
 * Never pass DICOM identifiers, file paths or pixels through this contract.
 */
import type {EvidenceItem} from './source-bound-evidence';
type NativeFinding={
 findingId:string;sign:string;anatomy:string;
 status:'candidate'|'verified_by_human'|'rejected'|'requires_recheck';
 source:{seriesUid:string;sopInstanceUid:string|null;frameIndex:number|null;slicePositionMm:number|null};
 measurements:{diameterMm:number|null;volumeMl:number|null};
 model:{id:string;provider:string;version:string|null};limitations:string[];
};
type NativeEvidence={
 schema:'opus-evidence/v1';modality:'CT'|'MR';
 coverage:'assessed'|'partially_assessed'|'not_assessed';
 seriesReviewed:string[];findings:NativeFinding[];warnings:string[];
};
function validText(x:unknown,max=250):x is string{
 return typeof x==='string'&&x.trim().length>0&&x.length<=max;
}
function nonnegOrNull(n:unknown){
 return n===null||(typeof n==='number'&&Number.isFinite(n)&&n>=0);
}
export function importRadiologySourceEvidence(
 sourceId:string,original:unknown
):{evidence:EvidenceItem[];limitations:string[];rejectedCount:number}{
 if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(sourceId)||
    !original||typeof original!=='object'||Array.isArray(original))
  throw Error('Untrusted original imaging evidence');
 const obj=original as Partial<NativeEvidence>;
 if(obj.schema!=='opus-evidence/v1'||!['CT','MR'].includes(String(obj.modality))||
    !['assessed','partially_assessed','not_assessed'].includes(String(obj.coverage))||
    !Array.isArray(obj.seriesReviewed)||obj.seriesReviewed.length>256||
    !Array.isArray(obj.findings)||obj.findings.length>500)
   throw Error('Unsupported radiology evidence schema');
 if(obj.coverage==='not_assessed'&&obj.findings.length)throw Error('Cannot infer pathology from unassessed study');
 const findings:EvidenceItem[]=[],limitations:string[]=[];
 if(obj.coverage!=='assessed')limitations.push('Radiology source coverage incomplete; unassessed regions not normal');
 const seen=new Set<string>();
 let rejectedCount=0;
 for(const [i,f] of obj.findings.entries()){
  if(!f||!validText(f.findingId,128)||seen.has(f.findingId)||
    !validText(f.sign,500)||!validText(f.anatomy,500)||
    !['candidate','verified_by_human','rejected','requires_recheck'].includes(f.status)||
    !f.source||!validText(f.source.seriesUid,180)||
    !obj.seriesReviewed.includes(f.source.seriesUid)||
    !f.measurements||!nonnegOrNull(f.measurements.diameterMm)||
    !nonnegOrNull(f.measurements.volumeMl)||
    !f.model||!validText(f.model.id,180)||
    !Array.isArray(f.limitations)||f.limitations.length>20)
     throw Error('Invalid or duplicate native source finding');
  seen.add(f.findingId);
  if(f.status==='rejected'){rejectedCount++;continue;}
  // Only doctor-verified findings can support clinical diagnosis. Model
  // candidates remain inferred even when localized in physical coordinates.
  const human=f.status==='verified_by_human';
  const sign=f.sign.slice(0,180),region=f.anatomy.slice(0,180);
  const measurement=human&&f.measurements.diameterMm!==null?
     '; clinician-verified source diameter '+f.measurements.diameterMm+' mm':'';
  findings.push({
   id:sourceId+':finding'+i,sourceId,modality:obj.modality,
   bodyRegion:region,
   frameId:f.source.frameIndex===null?undefined:'frame'+f.source.frameIndex,
   finding:'Anatomy: '+region+'; visual sign: '+sign+measurement,
   status:human?'observed':'inferred',
   // Native "assessed" means only the represented images, NOT a whole CT/MR.
   coverage:'partial',
   model:f.model.id.slice(0,180),
   limitations:['Original detector/model result, not independent clinical diagnosis',...f.limitations.slice(0,3)],
  });
 }
 return{evidence:findings,limitations,rejectedCount};
}
