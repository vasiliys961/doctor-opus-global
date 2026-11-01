import { it, expect } from 'vitest';
import { MODELS } from '../openrouter';
import { DIAGNOSTIC_ROLES } from '../diagnostics/roles';

it('uses Claude Opus 5.5 for clinical debate roles by default in the contest',()=>{
  if(process.env.CONSILIUM_DEBATE_MODEL) return; // explicit benchmark override is permitted
  for(const role of ['hypothesis','challenger','checklist'] as const){
    expect(DIAGNOSTIC_ROLES[role].model).toBe('anthropic/claude-opus-5.5');
    expect(DIAGNOSTIC_ROLES[role].fallbackModel).toBe(MODELS.SONNET);
  }
});
