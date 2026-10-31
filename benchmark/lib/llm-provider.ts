// Competition-only provider chain. Never log prompts, responses or credential values.
// Explicitly bind a Polza key to its own base URL; never send it to OpenRouter.
type Endpoint = { base: string; key: string };
function endpoints(): Endpoint[] {
  const polzaKey = process.env.LLM_API_KEY?.trim();
  const polzaBase = process.env.LLM_BASE_URL?.trim();
  const routerKey = process.env.OPENROUTER_API_KEY?.trim();
  const routerBase = (process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1');
  const router = routerKey ? [{base: routerBase, key: routerKey}] : [];
  const polza = polzaKey && polzaBase ? [{base: polzaBase, key: polzaKey}] : [];
  // On Vercel use international routing first; Timeweb can select Polza explicitly.
  const primary = process.env.BENCHMARK_PRIMARY_PROVIDER === 'polza' ? [...polza,...router] : [...router,...polza];
  return primary.filter((e,i,a)=>a.findIndex(x=>x.base===e.base&&x.key===e.key)===i);
}
export async function postLlmChatCompletionsWithFallback(payload:unknown,options:{timeoutMs?:number}={}):Promise<Response>{
  const chain=endpoints();
  if(!chain.length) throw new Error('No configured LLM provider');
  for (let i=0;i<chain.length;i++) {
    const e=chain[i];
    try {
      const result=await fetch(e.base.replace(/\/+$/, '')+'/chat/completions',{
        method:'POST',
        headers:{'Authorization':'Bearer '+e.key,'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(options.timeoutMs||60000)
      });
      if(result.ok || ![401,402,403,404,408,429,500,502,503,504].includes(result.status) || i===chain.length-1) return result;
    } catch {
      if(i===chain.length-1) throw new Error('All providers unavailable');
    }
  }
  throw new Error('All providers unavailable');
}
