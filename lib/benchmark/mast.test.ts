import { describe, expect, it } from 'vitest';
import { formatMastAnswer, isScriptConcordancePrompt, parseScriptConcordance } from './mast';
import type { DiagnosticResult } from '../diagnostics/types';

describe('MAST response adapter', () => {
  it('extracts an answer from a consilium result', () => {
    const r: DiagnosticResult = {
      finalDiagnosis: { diagnosis: 'Test diagnosis', probability: 0.5, reasoning: 'Evidence' },
      auditTrail: {
        caseInput: {patientId: 'benchmark-anonymous', freeTextInput: 'synthetic case'},
        round: 0, hypotheses: [], testHistory: ['Test X'], challengerNotes: [],
        stewardshipNotes: ['Check safety'], disagreementScore: 0, roundOutputs: []
      },
      requiresHumanReview:false, totalTokensUsed:5,totalCostUsd:0
    };
    const output = formatMastAnswer(r);
    expect(Object.keys(output)).toEqual(['response']);
    expect(output.response).toContain('Test diagnosis');
    expect(output.response).toContain('Check safety');
    it('recognizes official SCT prompt and validates ratings', () => {
    expect(isScriptConcordancePrompt('# Script Concordance Testing\n\n## Case Details\nCase')).toBe(true);
    expect(isScriptConcordancePrompt('Clinical case')).toBe(false);
    expect(parseScriptConcordance('{"Rating":-1,"Rationale":"New evidence weakens hypothesis"}')).toEqual({
      Rating: -1, Rationale: 'New evidence weakens hypothesis'
    });
    expect(() => parseScriptConcordance('{"Rating":3,"Rationale":"Invalid"}')).toThrow();
  });
});

});
