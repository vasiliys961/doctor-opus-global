// Competition-only model identifiers, kept aligned with Doctor Opus Global.
export const MODELS = {
  OPUS: 'anthropic/claude-opus-5.5',
  OPUS_VALIDATED: process.env.CONSILIUM_DEBATE_MODEL || 'anthropic/claude-opus-5.5',
  SONNET: 'anthropic/claude-sonnet-5.5',
  GPT_5_2: 'openai/gpt-6.1-sol',
  GROK_4_5: 'x-ai/grok-4.5',
  HAIKU: 'anthropic/claude-haiku-4.5',
  LLAMA: 'meta-llama/llama-3.2-90b-vision-instruct',
  GEMINI_3_FLASH: 'google/gemini-3.8-flash',
  GEMINI_3_PRO: 'google/gemini-3.8-flash',
  FABLE_5: 'anthropic/claude-fable-5.1',
  FUGU_ULTRA: 'sakana/fugu-ultra',
};
