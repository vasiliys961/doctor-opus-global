import { runConsilium } from '../diagnostics/orchestrator';
import { callDiagnosticAgent } from '../diagnostics/llm-client';
import { MODELS } from '../openrouter';
import type { DiagnosticResult } from '../diagnostics/types';

export interface MastResponse { response: string }
export interface ScriptConcordanceResponse { Rating: number; Rationale: string }

/** Official MAST SCT prefix. Do not guess format from patient information. */
export function isScriptConcordancePrompt(text: string): boolean {
  return text.trimStart().startsWith('# Script Concordance Testing') &&
    text.includes('## Case Details');
}

export function parseScriptConcordance(content: string): ScriptConcordanceResponse {
  const match = content.match(/\{\s*"Rating"\s*:\s*[-+]?\d[\s\S]*?\}/);
  if (!match) throw new Error('Missing SCT JSON');
  const value: unknown = JSON.parse(match[0]);
  if (typeof value !== 'object' || value === null) throw new Error('Invalid SCT data');
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.Rating) || (data.Rating as number) < -2 ||
      (data.Rating as number) > 2 || typeof data.Rationale !== 'string' ||
      !data.Rationale.trim()) throw new Error('Invalid SCT rating or rationale');
  return { Rating: data.Rating as number, Rationale: data.Rationale };
}

/** Structured doctor-opus consilium audit is already available, no extra LLM call. */
export function formatMastAnswer(result: DiagnosticResult): MastResponse {
  const diagnosis = result.finalDiagnosis;
  const parts = [
    `Most likely diagnosis: ${diagnosis.diagnosis}.`,
    `Rationale: ${diagnosis.reasoning}`,
  ];
  if (result.auditTrail.testHistory.length) {
    parts.push(`Suggested diagnostic evaluation: ${result.auditTrail.testHistory.at(-1)}`);
  }
  if (result.auditTrail.stewardshipNotes.length) {
    parts.push(`Management and safety considerations: ${result.auditTrail.stewardshipNotes.at(-1)}`);
  }
  if (result.requiresHumanReview) {
    parts.push(`Uncertainty / review needed: ${result.reviewReason || 'Independent clinician review required.'}`);
  }
  return { response: parts.join('\n\n') };
}

export async function answerMastCase(caseText: string): Promise<MastResponse | ScriptConcordanceResponse> {
  const cleaned = caseText.trim();
  if (!cleaned || cleaned.length > 100_000) throw new Error('Invalid clinical case length');

  const result = await runConsilium({ patientId:'benchmark-anonymous', freeTextInput:cleaned });
  if (!result.finalDiagnosis.diagnosis || !result.finalDiagnosis.reasoning) {
    throw new Error('Consilium did not produce a valid diagnostic assessment');
  }

  if (isScriptConcordancePrompt(cleaned)) {
    // SCT is a *relative change* task, not a diagnostic probability. A direct
    // constrained synthesis is required; never map diagnostic confidence to Rating.
    const assessment = await callDiagnosticAgent({
      model: MODELS.OPUS_VALIDATED,
      maxTokens: 450,
      systemPrompt: 'You are completing a Script Concordance Test. Judge how the new finding changes the likelihood of the stated hypothesis. Return strictly a JSON object with integer Rating (-2..2) and concise Rationale. No markdown.',
      userContent: `ORIGINAL TASK:\n${cleaned}\n\nCONSILIUM ASSESSMENT:\n${result.finalDiagnosis.diagnosis}: ${result.finalDiagnosis.reasoning}`,
    });
    if (assessment.error) throw new Error('SCT synthesis failed');
    return parseScriptConcordance(assessment.content);
  }

  const output = formatMastAnswer(result);
  if (output.response.length < 50) throw new Error('Clinical answer too short');
  return output;
}
