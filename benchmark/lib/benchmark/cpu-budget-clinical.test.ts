import {it,expect,vi,beforeEach} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('../diagnostics/orchestrator',()=>({runConsilium:vi.fn()}));
vi.mock('./medical-vision',()=>({analyzeBenchmarkMedicalImage:vi.fn(),validateVisionInput:vi.fn()}));
import {runConsilium} from '../diagnostics/orchestrator';
import {analyzeBenchmarkMedicalImage} from './medical-vision';
import {runUnifiedClinicalChat} from './unified-clinical-chat';
import {validatedOriginalXrvScores,XRV_ORIGINAL_SHA256,XRV_HEADS} from './lightweight-xray-cpu';
import type {BenchmarkImageInput} from './medical-vision';
const bytes=Buffer.from('89504e470d0a1a0a00112233aabbccdd','hex');
const input:BenchmarkImageInput={modality:'xray',images:[{base64:bytes.toString('base64'),mimeType:'image/png'}]};
const originalSha=createHash('sha256').update(bytes).digest('hex');
const report={schema:'opus-original-xrv-cxr-six-head/v1',model:'densenet121-res224-nih',
 originalWeightSha256:XRV_ORIGINAL_SHA256,sourceImageSha256:originalSha,
 scores:Object.fromEntries(XRV_HEADS.map(x=>[x,0.31]))};
const clinical={caseText:'Review source radiograph; leading working hypothesis, differential and hazards.',
 studies:[{kind:'chest-xray' as const,sourceId:'cxr1',input}]};
const mother={finalDiagnosis:{diagnosis:'Unconfirmed chest X-ray opacity',reasoning:'Image is insufficient for definitive diagnosis'},
 requiresHumanReview:true,totalCostUsd:0.14,
 auditTrail:{testHistory:[],challengerNotes:[],stewardshipNotes:[],amscRound:{synthesisContent:'Chest image differential with limited coverage'}}};
beforeEach(()=>{
 vi.mocked(runConsilium).mockReset().mockResolvedValue(mother as never);
 vi.mocked(analyzeBenchmarkMedicalImage).mockReset().mockResolvedValue({
  report:'Visual analysis: single source CXR shows an uncertain opacity; no second view supplied.',
  models:['gemini','sonnet'],observation:{findings:[]}
 } as never);
});
it('NO CPU worker: Gemini/Opus and actual specialist consilium still complete immediately, no hidden GPU use',async()=>{
 const out=await runUnifiedClinicalChat(clinical);
 expect(analyzeBenchmarkMedicalImage).toHaveBeenCalledTimes(1);
 expect(runConsilium).toHaveBeenCalledTimes(1);
 expect(out.evidence).toHaveLength(1);
 expect(out.evidence[0].status).toBe('inferred');
 expect(out.reviewRequired).toBe(true);
 expect(vi.mocked(runConsilium).mock.calls[0][0].attachedDocuments?.[0]).toContain('not assessed');
});
it('CPU hangs: original Gemini/Sonnet starts, then parent clinical specialists proceed without negative claim',async()=>{
 let aborted=false,started=false;
 const out=await runUnifiedClinicalChat(clinical,{cpuXray:{
  readiness:{id:'xrv-nih-densenet121-cxr',verifiedOriginalWeights:true,
   localCpuWorkerReady:true,authorizedSource:true},
  execute:(_input,signal)=>{
   started=true;signal.addEventListener('abort',()=>{aborted=true});
   return new Promise(()=>{});
  }
 }});
 expect(started).toBe(true);
 expect(aborted).toBe(true);
 expect(out.evidence).toHaveLength(1);
 expect(runConsilium).toHaveBeenCalledTimes(1);
 const transcript=vi.mocked(runConsilium).mock.calls[0][0].attachedDocuments?.[0]||'';
 expect(transcript).toContain('CPU detector timed_out');
 expect(transcript).not.toContain('No pneumothorax');
},5000);
it('independent vision and verified original CPU detector run in parallel, still uncalibrated hypotheses',async()=>{
 const events:string[]=[];
 vi.mocked(analyzeBenchmarkMedicalImage).mockImplementationOnce(async()=>{
  events.push('vision started');await new Promise(r=>setTimeout(r,40));
  return{report:'Source image independent observation',models:['Gemini','Sonnet']} as never;
 });
 const out=await runUnifiedClinicalChat(clinical,{cpuXray:{
  readiness:{id:'xrv-nih-densenet121-cxr',verifiedOriginalWeights:true,
   localCpuWorkerReady:true,authorizedSource:true},
  execute:async()=>{events.push('cpu started');await new Promise(r=>setTimeout(r,8));return report;}
 }});
 expect(events).toEqual(['vision started','cpu started']);
 expect(out.evidence).toHaveLength(2);
 expect(out.evidence.every(x=>x.status==='inferred')).toBe(true);
 expect(vi.mocked(runConsilium).mock.calls[0][0].attachedDocuments?.[0]).toContain('UNCALIBRATED');
});
it('fake original CPU result with mismatched pixels or model weights is rejected, no diagnosis leakage',()=>{
 expect(()=>validatedOriginalXrvScores(input,{...report,sourceImageSha256:'e'.repeat(64)})).toThrow();
 expect(()=>validatedOriginalXrvScores(input,{...report,originalWeightSha256:'0'.repeat(64)})).toThrow();
});
