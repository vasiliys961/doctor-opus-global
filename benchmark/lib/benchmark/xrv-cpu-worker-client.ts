/** Trusted server-side connection to an OPTIONAL original NIH XRV CPU worker.
 * Never accepts client worker URLs, never provisions a GPU or weights.
 * Source transfer must be explicitly authorized; worker must report exact
 * original weight and pixel SHA256 before its scores enter clinical context.
 */
import type {BenchmarkImageInput} from './medical-vision';
import type {CpuXrayExecution} from './unified-clinical-chat';
import {sourceXrayImageSha,XRV_ORIGINAL_SHA256} from './lightweight-xray-cpu';

export function configuredCpuXrayFromEnv(env:NodeJS.ProcessEnv=process.env):CpuXrayExecution|undefined {
 const address=env.MAST_XRV_CPU_URL?.trim();
 const token=env.MAST_XRV_CPU_TOKEN?.trim();
 // An explicit rights grant is necessary because the request sends source
 // pixels to a separate host. Never silently grant it based on a URL.
 if(!address||!token||env.MAST_XRV_CPU_INPUT_RIGHTS_GRANTED!=='true'||
    env.MAST_XRV_CPU_WEIGHT_SHA256!==XRV_ORIGINAL_SHA256)return undefined;
 let target:URL;
 try{target=new URL(address)}catch{return undefined}
 if(target.protocol!=='https:'||!target.hostname||
    target.username||target.password||target.search||target.hash||
    target.pathname!=='/infer'||target.port==='0')return undefined;
 if(token.length<24||token.length>1024)return undefined;
 return{
  readiness:{id:'xrv-nih-densenet121-cxr',localCpuWorkerReady:true,
    authorizedSource:true,verifiedOriginalWeights:true,gpuRequested:false},
  execute:async(input:BenchmarkImageInput,signal:AbortSignal):Promise<unknown>=>{
   // Validate locally before transferring any image.
   const sha=sourceXrayImageSha(input);
   const response=await fetch(target.toString(),{
    method:'POST',redirect:'error',cache:'no-store',signal,
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify({
     schema:'opus-xrv-cpu-request/v1',sourceImageSha256:sha,
     imagePngBase64:input.images[0].base64
    })
   });
   if(!response.ok)throw Error('Original CPU worker declined image');
   const size=Number(response.headers.get('content-length')||0);
   if(size>4096)throw Error('Oversized CPU worker reply');
   const body=await response.text();
   if(body.length>4096)throw Error('Oversized CPU worker reply');
   return JSON.parse(body) as unknown;
  }
 };
}
