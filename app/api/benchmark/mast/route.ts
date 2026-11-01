import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { answerMastCase } from '@/lib/benchmark/mast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validToken(header: string | null, token: string): boolean {
  const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a,b);
}

export async function POST(request: NextRequest) {
  const token = process.env.MAST_BENCHMARK_TOKEN;
  if (!token) return NextResponse.json({error:'Benchmark endpoint disabled'}, {status:503});
  if (!validToken(request.headers.get('authorization'), token)) {
    return NextResponse.json({error:'Unauthorized'}, {status:401});
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('text/plain')) {
    return NextResponse.json({error:'Expected text/plain'}, {status:415});
  }
  try {
    const caseText = await request.text();
    if (!caseText.trim() || caseText.length > 100_000) {
      return NextResponse.json({error:'Invalid input'}, {status:400});
    }
    const output = await answerMastCase(caseText);
    return NextResponse.json(output, {headers:{'Cache-Control':'no-store'}});
  } catch {
    // Never put private benchmark input/output or model details in HTTP errors.
    return NextResponse.json({error:'Benchmark inference failed'}, {status:500,headers:{'Cache-Control':'no-store'}});
  }
}
