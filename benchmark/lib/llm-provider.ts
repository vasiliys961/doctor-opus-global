export function getLlmApiKey() {
  return (process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
}
export function getLlmChatCompletionsUrl() {
  const base = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1';
  return base.replace(/\/+$/, '') + '/chat/completions';
}

export async function postLlmChatCompletionsWithFallback(payload: unknown, options: {timeoutMs?: number} = {}): Promise<Response> {
  const baseUrls = [
    {base: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1', key: process.env.LLM_API_KEY},
    {base: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1', key: process.env.OPENROUTER_API_KEY}
  ].filter(x => Boolean(x.key));
  if (!baseUrls.length) throw new Error('LLM provider is not configured');
  for (const endpoint of baseUrls) {
    try {
      const response = await fetch(endpoint.base.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + endpoint.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(options.timeoutMs || 60000)
      });
      if (response.ok || ![401,402,403,404,408,429,500,502,503,504].includes(response.status)) return response;
    } catch { /* retry next configured provider without logging patient content */ }
  }
  throw new Error('All LLM providers unavailable');
}
