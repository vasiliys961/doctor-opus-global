export function getLlmApiKey() {
  return (process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
}
export function getLlmChatCompletionsUrl() {
  const base = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1';
  return base.replace(/\/+$/, '') + '/chat/completions';
}
