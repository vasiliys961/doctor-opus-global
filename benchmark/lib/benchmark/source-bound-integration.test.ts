import {createHash} from 'node:crypto';
import {it,expect,describe} from 'vitest';
import {arbitrateSourceEvidence} from './source-bound-evidence';
import {buildComparisonVisionContent,comparisonMetadata,validateComparison} from './source-bound-comparison';
import {adaptECGOpusDigital,toECGSourceEvidence,fetchECGOpusLocalSignal} from './ecg-opus-source-adapter';
function frame(sourceId:string,encoded:string,date?:string,position?:string,projection?:string){
 return{sourceId,subjectScope:'case1',sourceSha256:createHash('sha256').update(Buffer.from(encoded,'base64')).digest('hex'),
 image:{base64:encoded,mimeType:'image/png' as const},date,position,projection};
}
const a=frame('before','AQIDBA==','2026-02-01','supine','AP');
const b=frame('after','AQIDBQ==','2026-10-01','upright','PA');
const input={modality:'xray' as const,mode:'temporal' as const,frames:[a,b]};
describe('Independent contest source-bound multiview and longitudinal comparison',()=>{
 it('transports BOTH real labeled original pixels, not just the first image',()=>{
  const parts=buildComparisonVisionContent(input);
  const media=parts.filter(x=>x.type==='image_url') as Array<{type:'image_url';image_url:{url:string}}>;
  expect(media).toHaveLength(2);
  expect(media[0].image_url.url).toContain(a.image.base64);
  expect(media[1].image_url.url).toContain(b.image.base64);
  const meta=comparisonMetadata(input);
  expect(meta.frames.map(f=>f.sourceId)).toEqual(['before','after']);
  expect(meta).not.toHaveProperty('subjectScope');
  expect(JSON.stringify(meta)).not.toContain(a.sourceSha256);
 });
 it('requires distinguishable dates for temporal analysis',()=>{
  expect(()=>validateComparison({...input,frames:[a,{...b,date:'2026-02-01'}]})).toThrow(/distinct/);
  expect(()=>validateComparison({...input,frames:[a,{...b,date:undefined}]})).toThrow(/dates/);
 });
 it('rejects mixing subjects, duplicate pixels and forged source hashes',()=>{
  expect(()=>validateComparison({...input,frames:[a,{...b,subjectScope:'different'}]})).toThrow();
  expect(()=>validateComparison({...input,frames:[a,{...b,image:a.image,sourceSha256:a.sourceSha256}]})).toThrow();
  expect(()=>validateComparison({...input,frames:[a,{...b,sourceSha256:'a'.repeat(64)}]})).toThrow();
 });
 it('requires source projection or positioning metadata in respective modes',()=>{
  expect(()=>validateComparison({...input,mode:'position',frames:[a,{...b,position:undefined}]})).toThrow(/Position/);
  expect(()=>validateComparison({...input,mode:'projection',frames:[a,{...b,projection:undefined}]})).toThrow(/Projection/);
 });
 it('supports different view/projection metadata without claiming quantitative progression',()=>{
  const meta=comparisonMetadata({...input,mode:'projection'});
  expect(meta.caveat).toMatch(/projection\/position/);
  expect(meta.frames[1].projection).toBe('PA');
 });
});
describe('Sono-style evidence arbitration',()=>{
 const e=[{id:'observed1',sourceId:'before',modality:'ultrasound',bodyRegion:'thyroid',
 finding:'Visualized structure',status:'observed' as const,coverage:'partial' as const,model:'Gemini'},
 {id:'guess',sourceId:'after',modality:'ultrasound',bodyRegion:'thyroid',
 finding:'Unverified guess',status:'inferred' as const,coverage:'not_assessed' as const,model:'Gemini'}];
 it('rejects ungrounded diagnosis and preserves missing coverage',()=>{
  const o=arbitrateSourceEvidence(e,[
   {id:'supported',label:'possible nodule',supportingEvidenceIds:['observed1']},
   {id:'unsupported',label:'no thyroid',supportingEvidenceIds:['guess']}
  ],['before','after']);
  expect(o.accepted.map(x=>x.id)).toEqual(['supported']);
  expect(o.rejected[0].reason).toBe('no_source_bound_observation');
  expect(o.negativeFindingsAllowed).toBe(false);
 });
 it('refuses invented source IDs and duplicate evidence',()=>{
  expect(()=>arbitrateSourceEvidence([e[0],e[0]],[],['before','after'])).toThrow();
 });
});
describe('ECG Opus genuine digital engine vs narrow 531-feature model',()=>{
 const raw={model:'ECGFounder',class_count:150,input_samples:5000,
  lead_order:['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'],
  scores:[{label:'rhythm',score:0.72},{label:'ischemia',score:0.21}],
  measurements:{rate_bpm:70,qt_ms:400},note:'not calibrated'};
 it('accepts real ECGFounder scores with uncalibrated warning',()=>{
  const x=adaptECGOpusDigital('ecg-case-1',raw);
  expect(x.classCount).toBe(150);
  expect(x.limitations.join(' ')).toMatch(/not calibrated/);
  const evidence=toECGSourceEvidence(x);
  expect(evidence).toHaveLength(1);
  expect(evidence[0].status).toBe('observed');
  expect(evidence[0].coverage).toBe('partial');
 });
 it('rejects a fake ecgdeli output, malformed class counts, and probabilities',()=>{
  expect(()=>adaptECGOpusDigital('ecg-case-1',{...raw,model:'MLP'})).toThrow();
  expect(()=>adaptECGOpusDigital('ecg-case-1',{...raw,class_count:24})).toThrow();
  expect(()=>adaptECGOpusDigital('ecg-case-1',{...raw,scores:[{label:'a',score:1.7}]})).toThrow();
  expect(()=>adaptECGOpusDigital('ecg-case-1',{...raw,measurements:undefined})).toThrow();
 });
 it('does not export raw patient ECG to remote cloud without explicitly permitted local worker',async()=>{
  await expect(fetchECGOpusLocalSignal('ecg-case-1',[],500,undefined)).rejects.toThrow(/loopback/);
  await expect(fetchECGOpusLocalSignal('ecg-case-1',[],500,'https://example.org')).rejects.toThrow(/loopback/);
 });
});
