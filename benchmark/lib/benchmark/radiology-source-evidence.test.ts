import {it,expect} from 'vitest';
import {importRadiologySourceEvidence} from './radiology-source-evidence';
import {arbitrateSourceEvidence} from './source-bound-evidence';
const source={
 schema:'opus-evidence/v1',modality:'CT',coverage:'partially_assessed',
 seriesReviewed:['series-alpha'],warnings:[],
 findings:[
  {findingId:'one',sign:'opacity',anatomy:'left lung',status:'candidate',
   source:{seriesUid:'series-alpha',sopInstanceUid:'sop-one',frameIndex:7,slicePositionMm:14},
   measurements:{diameterMm:9,volumeMl:null},model:{id:'detector-one',provider:'local',version:null},limitations:[]},
  {findingId:'two',sign:'pleural fluid',anatomy:'pleura',status:'verified_by_human',
   source:{seriesUid:'series-alpha',sopInstanceUid:'sop-two',frameIndex:8,slicePositionMm:15},
   measurements:{diameterMm:null,volumeMl:null},model:{id:'detector-one',provider:'local',version:null},limitations:[]},
  {findingId:'three',sign:'rejected artifact',anatomy:'mediastinum',status:'rejected',
   source:{seriesUid:'series-alpha',sopInstanceUid:'sop-three',frameIndex:9,slicePositionMm:16},
   measurements:{diameterMm:null,volumeMl:null},model:{id:'detector-one',provider:'local',version:null},limitations:[]},
 ]};
it('distinguishes human verified finding from original model candidate',()=>{
 const r=importRadiologySourceEvidence('study-one',source);
 expect(r.evidence.map(x=>x.status)).toEqual(['inferred','observed']);
 expect(r.rejectedCount).toBe(1);
 const a=arbitrateSourceEvidence(r.evidence,[
  {id:'candidate',label:'lung mass',supportingEvidenceIds:['study-one:finding0']},
  {id:'verified',label:'pleural effusion',supportingEvidenceIds:['study-one:finding1']}
 ],['study-one']);
 expect(a.accepted.map(x=>x.id)).toEqual(['verified']);
 expect(a.rejected.map(x=>x.id)).toEqual(['candidate']);
 expect(a.negativeFindingsAllowed).toBe(false);
});
it('withholds source series identifiers and unverified model measurements',()=>{
 const r=importRadiologySourceEvidence('study-one',source);
 const asText=JSON.stringify(r);
 expect(asText).not.toContain('series-alpha');
 expect(asText).not.toContain('sop-one');
 expect(asText).not.toContain('9 mm');
});
it('refuses unassessed source or unmatched series',()=>{
 expect(()=>importRadiologySourceEvidence('study-one',{...source,coverage:'not_assessed'})).toThrow();
 const mismatch={...source,findings:[{...source.findings[0],
  source:{...source.findings[0].source,seriesUid:'unrelated'}}]};
 expect(()=>importRadiologySourceEvidence('study-one',mismatch)).toThrow();
});
