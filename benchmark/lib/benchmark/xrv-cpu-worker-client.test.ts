import {it,expect,vi,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
import {configuredCpuXrayFromEnv} from './xrv-cpu-worker-client';
import {validatedOriginalXrvScores,XRV_ORIGINAL_SHA256,XRV_HEADS} from './lightweight-xray-cpu';
import type {BenchmarkImageInput} from './medical-vision';
const token='a-long-fixed-server-to-server-token-for-testing';
const config={
 MAST_XRV_CPU_URL:'https://cpu.example.org/infer',
 MAST_XRV_CPU_TOKEN:token,
 MAST_XRV_CPU_INPUT_RIGHTS_GRANTED:'true',
 MAST_XRV_CPU_WEIGHT_SHA256:XRV_ORIGINAL_SHA256
};
const png=Buffer.from('89504e470d0a1a0a0000000000000000','hex');
const input:BenchmarkImageInput={modality:'xray',images:[{
 mimeType:'image/png',base64:png.toString('base64')}]};
const sourceSha=createHash('sha256').update(png).digest('hex');
afterEach(()=>vi.unstubAllGlobals());
it('disables worker without explicit authorized image transfer and pinned original weight',()=>{
 for(const [k,v] of Object.entries(config)){
  expect(configuredCpuXrayFromEnv({...config,[k]:''})).toBeUndefined();
  expect(configuredCpuXrayFromEnv({...config,[k]:v})).toBeDefined();
 }
 expect(configuredCpuXrayFromEnv({...config,MAST_XRV_CPU_INPUT_RIGHTS_GRANTED:'yes'})).toBeUndefined();
 expect(configuredCpuXrayFromEnv({...config,MAST_XRV_CPU_WEIGHT_SHA256:'0'.repeat(64)})).toBeUndefined();
});
it('disallows plaintext transport, custom worker path, URL query, injected credentials',()=>{
 for(const url of ['http://cpu.example.org/infer','https://cpu.example.org/other',
  'https://cpu.example.org/infer?model=other','https://user:pw@cpu.example.org/infer']){
  expect(configuredCpuXrayFromEnv({...config,MAST_XRV_CPU_URL:url})).toBeUndefined();
 }
});
it('transmits one original image to trusted worker and validates pixel and model provenance',async()=>{
 const valid={
  schema:'opus-original-xrv-cxr-six-head/v1',model:'densenet121-res224-nih',
  sourceImageSha256:sourceSha,originalWeightSha256:XRV_ORIGINAL_SHA256,
  scores:Object.fromEntries(XRV_HEADS.map(s=>[s,0.3]))
 };
 const fetcher=vi.fn(async(_url:URL|string,init:RequestInit)=>{
  expect(init.method).toBe('POST');
  expect(init.redirect).toBe('error');
  expect((init.headers as Record<string,string>).Authorization).toBe('Bearer '+token);
  const request=JSON.parse(init.body as string);
  expect(request.sourceImageSha256).toBe(sourceSha);
  expect(request.imagePngBase64).toBe(input.images[0].base64);
  return new Response(JSON.stringify(valid),{status:200,headers:{'content-type':'application/json'}});
 });
 vi.stubGlobal('fetch',fetcher);
 const execute=configuredCpuXrayFromEnv(config);
 expect(execute).toBeDefined();
 const result=await execute!.execute(input,new AbortController().signal);
 expect(validatedOriginalXrvScores(input,result).unverifiedScores.Pneumonia).toBe(0.3);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('CPU network error fails as optional evidence, never fabricated negative',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('not ready',{status:503})));
 await expect(configuredCpuXrayFromEnv(config)!.execute(input,new AbortController().signal))
  .rejects.toThrow(/declined/);
});
