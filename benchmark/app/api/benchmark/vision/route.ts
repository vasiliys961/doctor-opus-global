import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { analyzeBenchmarkMedicalImage, validateVisionInput } from '../../../../lib/benchmark/medical-vision';
import type { BenchmarkImageInput } from '../../../../lib/benchmark/medical-vision';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function authenticated(req:NextRequest):boolean{
  const token=process.env.MAST_BENCHMARK_TOKEN?.trim();
  const supplied=req.headers.get('authorization') || '';
  if(!token || !supplied.startsWith('Bearer '))return false;
  const actual=Buffer.from(supplied.slice(7),'utf8');
  const required=Buffer.from(token,'utf8');
  return actual.length===required.length && timingSafeEqual(actual,required);
}

export async function POST(req:NextRequest):Promise<NextResponse>{
  if(!authenticated(req))return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  if((Number(req.headers.get('content-length'))||0)>4_000_000)
    return NextResponse.json({error:'Image payload too large'},{status:413,headers:{'Cache-Control':'no-store'}});
  let body:unknown;
  try{body=await req.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400,headers:{'Cache-Control':'no-store'}});}
  if(!body || typeof body!=='object' || Array.isArray(body))
    return NextResponse.json({error:'Invalid image request'},{status:400,headers:{'Cache-Control':'no-store'}});
  const r=body as Record<string,unknown>;
  if(!['xray','ct','mri','ecg','dermatoscopy','ultrasound'].includes(String(r.modality)) || !Array.isArray(r.images))
    return NextResponse.json({error:'Unsupported modality or images'},{status:400,headers:{'Cache-Control':'no-store'}});
  const input={modality:r.modality,images:r.images,allowSecondRead:r.allowSecondRead,examRegion:r.examRegion} as BenchmarkImageInput;
  try{
    validateVisionInput(input);
    // An internal, token-authenticated research endpoint. No request/response
    // persistence; original images are forwarded only to the configured LLMs.
    const result=await analyzeBenchmarkMedicalImage(input);
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch{
    // Never echo prompt, picture content, credentials or raw provider exceptions.
    return NextResponse.json({error:'Medical image analysis unavailable or input invalid'},{status:422,headers:{'Cache-Control':'no-store'}});
  }
}
