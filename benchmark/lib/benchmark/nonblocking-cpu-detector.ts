/** Budgeted race: source images go to Gemini/Opus immediately while a
 * SMALL CPU detector runs in parallel. The detector is optional evidence,
 * never a prerequisite for specialists or final diagnosis.
 *
 * On slow/failure/absent worker: abort fetch, mark result unassessed and proceed
 * without starting any paid replacement worker. A worker must independently
 * enforce execution timeout / stop its subprocess: AbortSignal alone does not
 * guarantee that an already-running external process has stopped.
 */
export type DetectorOutcome<T>=
 |{state:'ready';value:T;elapsedMs:number}
 |{state:'timed_out'|'failed'|'disabled';elapsedMs:number;reason:string};
export type ParallelResult<V,T>={visual:V;detector:DetectorOutcome<T>};
export type DetectorLimits={detectorMaxMs?:number;afterVisionGraceMs?:number};
const MAX_DETECTOR_MS=8_000;
const MAX_GRACE_MS=1_500;
const safeBudget=(n:number|undefined,fallback:number,cap:number)=>{
 if(n===undefined)return fallback;
 if(!Number.isInteger(n)||n<1||n>cap)throw Error('CPU detector time budget out of range');
 return n;
};
/** Never waits longer than the capped grace period AFTER visual analysis.
 * Specialists should be launched by the caller immediately on return.
 */
export async function runNonBlockingCpuPair<V,T>(
 visual:()=>Promise<V>,
 detector?: (signal:AbortSignal)=>Promise<T>,
 limits:DetectorLimits={}
):Promise<ParallelResult<V,T>>{
 const maxMs=safeBudget(limits.detectorMaxMs,MAX_DETECTOR_MS,MAX_DETECTOR_MS);
 const graceMs=safeBudget(limits.afterVisionGraceMs,MAX_GRACE_MS,MAX_GRACE_MS);
 const started=Date.now(),abort=new AbortController();
 let settle:(value:DetectorOutcome<T>)=>void=()=>{};
 let finished=false;
 const outcome=new Promise<DetectorOutcome<T>>(resolve=>{settle=resolve});
 const finish=(value:DetectorOutcome<T>)=>{
  if(finished)return;
  finished=true;
  clearTimeout(deadline);
  settle(value);
 };
 const deadline=detector?setTimeout(()=>{
   abort.abort('cpu_detector_deadline');
   finish({state:'timed_out',elapsedMs:Date.now()-started,reason:'CPU detector exceeded absolute budget; study remains unassessed'});
 },maxMs):undefined;
 // Eager start both branches before awaiting either; no vision-first or
 // detector-first sequential chain. Handle even late detector rejections.
 const visionPromise=Promise.resolve().then(visual);
 if(detector){
  Promise.resolve().then(()=>detector(abort.signal)).then(
   value=>finish({state:'ready',value,elapsedMs:Date.now()-started}),
   ()=>finish({state:'failed',elapsedMs:Date.now()-started,
    reason:'Original CPU detector unavailable; not a negative scan'})
  );
 }else{
  finish({state:'disabled',elapsedMs:0,reason:'No original CPU detector configured'});
 }
 let observed:V;
 try{observed=await visionPromise}
 catch(error){
  abort.abort('visual_model_failed');
  clearTimeout(deadline);
  // Do not leave a dangling grace timer or a late detector result interpreted
  // as a standalone diagnosis after source-vision failed.
  throw error;
 }
 if(!finished){
  await Promise.race([
   outcome,
   new Promise<void>(resolve=>setTimeout(resolve,graceMs))
  ]);
  if(!finished){
   abort.abort('start_consilium_without_optional_detector');
   finish({state:'timed_out',elapsedMs:Date.now()-started,
    reason:'Optional CPU detector did not finish before clinical consilium handoff'});
  }
 }
 return {visual:observed,detector:await outcome};
}
