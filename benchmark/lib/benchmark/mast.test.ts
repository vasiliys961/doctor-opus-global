import { describe, expect, it } from 'vitest';
import { buildMastManagementContext, formatMastAnswer, isScriptConcordancePrompt, MAST_MANAGEMENT_PROMPT, parseScriptConcordance } from './mast';
import type { DiagnosticResult } from '../diagnostics/types';
const example: DiagnosticResult = {
  finalDiagnosis: { diagnosis: 'Pulmonary embolism', probability: 0.9, reasoning: 'CTPA filling defect' },
  auditTrail: {
    caseInput: {patientId:'benchmark-anonymous',freeTextInput:'Synthetic case'},
    round:0,hypotheses:[],testHistory:['Confirm oxygenation'],challengerNotes:['Consider bleeding risk'],
    stewardshipNotes:['Avoid unnecessary repeat imaging'],disagreementScore:0,roundOutputs:[],
    amscRound:{selectedSpecialties:['Pulmonology'],opinions:[{specialty:'Pulmonology',content:'Consider anticoagulation after bleeding risk assessment',hypotheses:[],promptTokens:0,completionTokens:0,costUsd:0,model:'mock'}],disagreementScore:0,escalatedToDebate:false,synthesisContent:'Most likely PE'}
  },
  requiresHumanReview:false,totalTokensUsed:5,totalCostUsd:0
};
describe('MAST response adapter',()=>{
  it('preserves diagnostic information and safety notes on fallback',()=>{
    const out=formatMastAnswer(example);
    expect(Object.keys(out)).toEqual(['response']);
    expect(out.response).toContain('Pulmonary embolism');
    expect(out.response).toContain('Avoid unnecessary repeat imaging');
    expect(out.response).toContain('Consider bleeding risk');
  });
  it('passes the complete clinical evidence into final management synthesis',()=>{
    const context=buildMastManagementContext('Hypoxic patient',example);
    for(const fragment of ['Hypoxic patient','Pulmonary embolism','Pulmonology','anticoagulation','Consider bleeding risk','Avoid unnecessary repeat imaging']) expect(context).toContain(fragment);
    for(const fragment of ['grade 3-4 drug-related adverse reaction','specialist-led','normal routine tests','probably can continue','Treatment and management','Monitoring and follow-up','Immediate actions / triage','Safety and stewardship']) expect(MAST_MANAGEMENT_PROMPT).toContain(fragment);
  });
  it('recognizes SCT and enforces the official rating scale',()=>{
    expect(isScriptConcordancePrompt('# Script Concordance Testing\n\n## Case Details\nCase')).toBe(true);
    expect(isScriptConcordancePrompt('Clinical case')).toBe(false);
    expect(isScriptConcordancePrompt('# Script Concordance Testing\n\n## Scenario\nCase\n\n## Hypothesis\nIf...\n\n## Additional Information\nFinding')).toBe(true);
    expect(parseScriptConcordance('{"Rating":-1,"Rationale":"Finding weakens the hypothesis"}')).toEqual({Rating:-1,Rationale:'Finding weakens the hypothesis'});
    expect(()=>parseScriptConcordance('{"Rating":3,"Rationale":"Invalid"}')).toThrow();
  });
});
