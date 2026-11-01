/** Contest-only CPU research policy; no model weights are bundled in Vercel.
 * GPU, automatic downloads and paid fallback workers are always disabled.
 * This is a ROUTING contract; only an externally ready original CPU worker can
 * actually infer. A readiness flag alone is never proof of a model run.
 */
export type CpuTask='ecg-digital'|'chest-xray'|'ct-hu-morphometry'|'ct-3d'|'mri-3d'|'other';
export type CpuDetectorId='ecg-opus-neurokit2'|'xrv-nih-densenet121-cxr'|'ct-hu-source-quantification';
export type CpuReadiness={
 id:string;
 localCpuWorkerReady:boolean;
 authorizedSource:boolean;
 verifiedOriginalWeights:boolean;
 sourceMaskBound?:boolean;
 gpuRequested?:boolean;
};
export type CpuPlan={
 profile:'cpu-only';task:CpuTask;detectorId:CpuDetectorId|null;
 execute:boolean;reason:string;gpuCalls:0;gpuFallback:false;
 automaticModelDownload:false;paidGpuFallback:false;
};
export const CPU_LIGHT_CATALOG=Object.freeze([
 {id:'ecg-opus-neurokit2' as const,task:'ecg-digital' as const,requiresWeights:false,
  note:'Digital source NeuroKit measurements; P/QT still need review.'},
 {id:'xrv-nih-densenet121-cxr' as const,task:'chest-xray' as const,requiresWeights:true,
  note:'Original ~28MB NIH weights; PyTorch RAM/startup still to be measured on actual CPU host.'},
 {id:'ct-hu-source-quantification' as const,task:'ct-hu-morphometry' as const,requiresWeights:false,
  note:'Source-calibrated HU with already registered mask; NOT pathology inference.'},
]);
function reject(task:CpuTask,reason:string):CpuPlan{
 return{profile:'cpu-only',task,detectorId:null,execute:false,reason,gpuCalls:0,
  gpuFallback:false,automaticModelDownload:false,paidGpuFallback:false};
}
export function planCpuDetector(task:CpuTask,ready?:CpuReadiness):CpuPlan{
 if(task==='ct-3d'||task==='mri-3d')
  return reject(task,'Heavy 3D detector disabled on contest CPU-only profile');
 const match=CPU_LIGHT_CATALOG.find(x=>x.task===task);
 if(!match)return reject(task,'No lightweight source-verified CPU model');
 if(!ready||ready.id!==match.id||!ready.localCpuWorkerReady)
  return reject(task,'Original CPU worker is not available; bypass it without blocking');
 if(ready.gpuRequested)return reject(task,'GPU worker prohibited');
 if(!ready.authorizedSource)return reject(task,'Data not authorized for this worker');
 if(match.requiresWeights&&!ready.verifiedOriginalWeights)
  return reject(task,'Original pretrained weights not independently verified');
 if(task==='ct-hu-morphometry'&&!ready.sourceMaskBound)
  return reject(task,'Cannot compute pathology from HU without source-bound mask');
 return{profile:'cpu-only',task,detectorId:match.id,execute:true,
  reason:'Ready CPU candidate; execution must return independently validated source evidence',
  gpuCalls:0,gpuFallback:false,automaticModelDownload:false,paidGpuFallback:false};
}
