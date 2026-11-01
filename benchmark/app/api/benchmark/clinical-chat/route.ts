/** Standalone contest endpoint: text question + source-bound ECG / CT-MR / multi-view.
 * Never merge into mother Doctor Opus main. No original image persistence.
 */
import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {runUnifiedClinicalChat,validateUnifiedClinicalRequest} from '../../../../lib/benchmark/unified-clinical-chat';
import type {UnifiedClinicalRequest} from '../../../../lib/benchmark/unified-clinical-chat';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
function authenticated(req:NextRequest):boolean{
 const token=process.env.MAST_BENCHMARK_TOKEN?.trim();
 const header=req.headers.get('authorization')||'';
 if(!token||!header.startsWith('Bearer '))return false;
 const actual=Buffer.from(header.slice(7),'utf8'),expected=Buffer.from(token,'utf8');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function POST(req:NextRequest):Promise<NextResponse>{
 const headers={'Cache-Control':'no-store'};
 if(!authenticated(req))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if((Number(req.headers.get('content-length'))||0)>15_000_000)
  return NextResponse.json({error:'Payload too large'},{status:413,headers});
 if(!(req.headers.get('content-type')||'').includes('application/json'))
  return NextResponse.json({error:'JSON required'},{status:415,headers});
 let body:unknown;
 try{body=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400,headers})}
 try{
  validateUnifiedClinicalRequest(body as UnifiedClinicalRequest);
 }catch{return NextResponse.json({error:'Invalid source study or question'},{status:422,headers})}
 try{
  const result=await runUnifiedClinicalChat(body as UnifiedClinicalRequest);
  return NextResponse.json(result,{headers});
 }catch{
  // The endpoint never echoes original patient text, image bytes, models,
  // credentials or provider exceptions in error responses.
  return NextResponse.json({error:'Unified clinical research analysis unavailable'},{status:502,headers});
 }
}
