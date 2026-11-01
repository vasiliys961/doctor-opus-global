import {it,expect,vi} from 'vitest';
import {planCpuDetector} from './cpu-only-detector-policy';
import {runNonBlockingCpuPair} from './nonblocking-cpu-detector';
it('only source-authorized ready CPU models are eligible, no GPU fallback or 3D workloads',()=>{
 const candidate=planCpuDetector('chest-xray',{id:'xrv-nih-densenet121-cxr',
  localCpuWorkerReady:true,authorizedSource:true,verifiedOriginalWeights:true});
 expect(candidate.execute).toBe(true);expect(candidate.gpuCalls).toBe(0);
 expect(candidate.gpuFallback).toBe(false);expect(candidate.automaticModelDownload).toBe(false);
 expect(planCpuDetector('ct-3d').execute).toBe(false);
 expect(planCpuDetector('mri-3d').execute).toBe(false);
 expect(planCpuDetector('chest-xray').execute).toBe(false);
 expect(planCpuDetector('chest-xray',{id:'xrv-nih-densenet121-cxr',
  localCpuWorkerReady:true,authorizedSource:true,verifiedOriginalWeights:true,
  gpuRequested:true}).execute).toBe(false);
});
it('model observer starts immediately even when CPU detector hangs forever; abort lets specialists proceed',async()=>{
 let visualStarted=false,detectorStarted=false,signalSeen:AbortSignal|undefined;
 const start=Date.now();
 const r=await runNonBlockingCpuPair(
  async()=>{visualStarted=true;return 'Independent Gemini/Opus observations';},
  async signal=>{detectorStarted=true;signalSeen=signal;return await new Promise<string>(()=>{});},
  {detectorMaxMs:80,afterVisionGraceMs:12}
 );
 expect(visualStarted).toBe(true);expect(detectorStarted).toBe(true);
 expect(r.visual).toContain('Gemini');
 expect(r.detector.state).toBe('timed_out');
 expect(signalSeen?.aborted).toBe(true);
 expect(Date.now()-start).toBeLessThan(250);
});
it('does not wait for disabled worker; visual result reaches clinician',async()=>{
 const t=Date.now();
 const r=await runNonBlockingCpuPair(async()=>({report:'source image reviewed'}));
 expect(r.detector.state).toBe('disabled');
 expect(r.visual.report).toContain('reviewed');
 expect(Date.now()-t).toBeLessThan(150);
});
it('preserves a fast genuine CPU result while visual analysis continues independently',async()=>{
 const events:string[]=[];
 const r=await runNonBlockingCpuPair(async()=>{
  events.push('vision started');await new Promise(x=>setTimeout(x,24));
  return 'vision';
 },async()=>{
  events.push('detector started');await new Promise(x=>setTimeout(x,4));
  return{original:true};
 },{detectorMaxMs:100,afterVisionGraceMs:10});
 expect(events).toEqual(['vision started','detector started']);
 expect(r.detector.state).toBe('ready');
 if(r.detector.state==='ready')expect(r.detector.value.original).toBe(true);
});
it('does not turn detector exception into negative imaging assessment',async()=>{
 const r=await runNonBlockingCpuPair(async()=> 'visual',
  async()=>{throw Error('GPU unavailable or Torch model crashed')},
  {detectorMaxMs:100,afterVisionGraceMs:5});
 expect(r.detector.state).toBe('failed');
 if(r.detector.state==='failed')expect(r.detector.reason).not.toContain('GPU unavailable');
});
it('rejects unsupported CPU timeout budgets before any inference',async()=>{
 await expect(runNonBlockingCpuPair(async()=>'vision',undefined,{detectorMaxMs:999_999}))
  .rejects.toThrow(/budget/);
});
