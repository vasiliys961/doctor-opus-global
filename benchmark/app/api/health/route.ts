import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
// Only boolean readiness; do not leak secrets or patient data.
export function GET() {
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const hasPolza = Boolean(process.env.LLM_API_KEY?.trim() && process.env.LLM_BASE_URL?.trim());
  const hasMastAuth = Boolean(process.env.MAST_BENCHMARK_TOKEN?.trim());
  return NextResponse.json({
    service: 'doctor-opus-benchmark',
    configured: hasMastAuth && (hasOpenRouter || hasPolza),
    providers: { openrouter: hasOpenRouter, polza: hasPolza },
    mastAuthConfigured: hasMastAuth,
  }, { status: hasMastAuth && (hasOpenRouter || hasPolza) ? 200 : 503,
       headers: { 'Cache-Control': 'no-store' } });
}
