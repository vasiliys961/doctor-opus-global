/** Optional ORIGINAL NIH chest-Xray CPU evidence.
 * Reconciles a source-pixel hash and immutable published model hash. It never
 * downloads weights, starts a GPU, or treats scores as calibrated disease
 * probabilities. Inference is executed only by a separately ready CPU worker.
 */
import {createHash} from 'node:crypto';
import type {BenchmarkImageInput} from './medical-vision';
export const XRV_ORIGINAL_SHA256='31a5475c6b1383a7edbfcaf96af9ce302eb9969cfe28b6b8b5859afc6f274fdf';
export const XRV_HEADS=['Pneumothorax','Cardiomegaly','Effusion','Pneumonia','Edema','Mass'] as const;
export type OriginalXrvCpuReport={
 schema:'opus-original-xrv-cxr-six-head/v1';
 model:'densenet121-res224-nih';
 originalWeightSha256:string;
 sourceImageSha256:string;
 scores:Record<string,number>;
};
export function sourceXrayImageSha(input:BenchmarkImageInput):string{
 if(input.modality!=='xray'||input.images.length!==1||
    input.images[0].mimeType!=='image/png')
   throw Error('Original NIH CPU worker requires one PNG chest radiograph');
 const pixels=Buffer.from(input.images[0].base64,'base64');
 if(pixels.length<8||pixels.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
  throw Error('Original PNG magic required for NIH CPU inference');
 return createHash('sha256').update(pixels).digest('hex');
}
export function validatedOriginalXrvScores(
 image:BenchmarkImageInput,report:unknown
):{unverifiedScores:Record<string,number>;warning:string}{
 if(!report||typeof report!=='object'||Array.isArray(report))
  throw Error('Missing XRV original worker output');
 const v=report as Partial<OriginalXrvCpuReport>;
 if(v.schema!=='opus-original-xrv-cxr-six-head/v1'||v.model!=='densenet121-res224-nih'||
    v.originalWeightSha256!==XRV_ORIGINAL_SHA256||
    v.sourceImageSha256!==sourceXrayImageSha(image)||
    !v.scores||typeof v.scores!=='object'||Array.isArray(v.scores))
  throw Error('Unverified XRV weights/source binding');
 const scores=v.scores as Record<string,unknown>;
 if(Object.keys(scores).length!==XRV_HEADS.length||
    XRV_HEADS.some(key=>typeof scores[key]!=='number'||!Number.isFinite(scores[key])||
    Number(scores[key])<0||Number(scores[key])>1))
  throw Error('Unexpected XRV output heads or unbounded scores');
 return{unverifiedScores:Object.fromEntries(XRV_HEADS.map(key=>[key,scores[key] as number])),
  warning:'Original pretrained CPU model produced image-level scores only; not calibrated disease probabilities or clinical diagnoses. Requires real-source external validation.'};
}
