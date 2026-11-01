import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../diagnostics/orchestrator',()=>({runConsilium:vi.fn()}));
vi.mock('./ecg-opus-image',()=>({analyzeECGOpusImage:vi.fn()}));
vi.mock('./source-bound-comparison',()=>({compareBenchmarkMedicalImages:vi.fn()}));
import {runConsilium} from '../diagnostics/orchestrator';
import {analyzeECGOpusImage} from './ecg-opus-image';
import {runUnifiedClinicalChat,buildSourceClinicalContext,validateUnifiedClinicalRequest} from './unified-clinical-chat';
import type {UnifiedClinicalRequest} from './unified-clinical-chat';
const eye={image:{base64:'AQIDBA==',mimeType:'image/png' as const}};
const parent={finalDiagnosis:{diagnosis:'Atrial fibrillation, provisional',reasoning:'RR variation; no verified P waves'},
 requiresHumanReview:false,totalCostUsd:0.12,
 auditTrail:{amscRound:{synthesisContent:'AF is the leading working hypothesis, but the rhythm needs confirmation.'}}};
beforeEach(()=>{
 vi.mocked(runConsilium).mockReset().mockResolvedValue(parent as never);
 vi.mocked(analyzeECGOpusImage).mockReset().mockResolvedValue({
  report:'Rapid ventricular response with possible irregular intervals. AF versus atrial flutter; no definitive P waves.',
  models:['Gemini','Opus'],originalSignalNeuroKitMeasured:true
 } as never);
});
it('routes actual ECG Opus image findings to central 5-role consilium without inventing confirmed diagnosis',async()=>{
 const result=await runUnifiedClinicalChat({
  caseText:'Evaluate the available ECG findings; give a provisional leading rhythm and alternatives.',
  studies:[{kind:'ecg-opus',sourceId:'ecg1',input:eye}]
 });
 expect(analyzeECGOpusImage).toHaveBeenCalledTimes(1);
 expect(runConsilium).toHaveBeenCalledTimes(1);
 const input=vi.mocked(runConsilium).mock.calls[0][0];
 expect(input.freeTextInput).toContain('Evaluate');
 expect(input.attachedDocuments?.[0]).toContain('AF versus atrial flutter');
 expect(input.attachedDocuments?.[0]).toContain('UNVERIFIED');
 expect(result.leadingWorkingDiagnosis).toContain('provisional');
 expect(result.reviewRequired).toBe(true);
 expect(result.evidence[0].status).toBe('inferred');
 expect(result.sourceCount).toBe(1);
});
it('rejects cross-study duplicates, no actual ECG image, and empty clinical case',()=>{
 const base={caseText:'Question',studies:[{kind:'ecg-opus' as const,sourceId:'ecg1',input:eye}]};
 expect(()=>validateUnifiedClinicalRequest(base)).not.toThrow();
 expect(()=>validateUnifiedClinicalRequest({...base,caseText:'  '})).toThrow();
 expect(()=>validateUnifiedClinicalRequest({...base,studies:[base.studies[0],base.studies[0]]})).toThrow();
 expect(()=>validateUnifiedClinicalRequest({...base,studies:[{kind:'ecg-opus',sourceId:'ecg1',input:{}}] as never})).toThrow();
});
it('allows native radiology only as source-bounded verified evidence, not as invisible CT/MRI processing',async()=>{
 const raw={schema:'opus-evidence/v1',modality:'CT',coverage:'partially_assessed',
  seriesReviewed:['series'],warnings:[],
  findings:[{findingId:'one',sign:'small nodule',anatomy:'lung',status:'candidate',
   source:{seriesUid:'series',sopInstanceUid:null,frameIndex:1,slicePositionMm:0},
   measurements:{diameterMm:4,volumeMl:null},
   model:{id:'test-detector',provider:'local',version:null},limitations:[]}]};
 const result=await runUnifiedClinicalChat({
  caseText:'Evaluate differential and imaging uncertainty.',
  studies:[{kind:'radiology',sourceId:'ct1',nativeEvidence:raw}]
 });
 expect(result.evidence).toHaveLength(1);
 expect(result.evidence[0].status).toBe('inferred');
 expect(result.reviewRequired).toBe(true);
 expect(JSON.stringify(result)).not.toContain('seriesUid');
 const summary=vi.mocked(runConsilium).mock.calls[0][0].attachedDocuments?.[0]||'';
 expect(summary).toContain('INFERRED');
 expect(summary).not.toContain('seriesUid');
});
it('patient privacy in source-chat context and explicit reviewer caveat',()=>{
 const text=buildSourceClinicalContext([{sourceId:'study1',kind:'ecg-opus',report:'Uncertain P waves',
  limitations:['Only one tracing examined']}]);
 expect(text).toContain('did not directly inspect the source pixels');
 expect(text).toContain('Only one tracing examined');
});
