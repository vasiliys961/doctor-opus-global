import { runConsilium } from '../diagnostics/orchestrator';
import type { DiagnosticResult } from '../diagnostics/types';

export interface MastResponse { response: string }

/** Render the already structured consilium result as a clinical answer.
 * No second LLM call is necessary. Do not persist benchmark cases or outputs.
 */
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

export async function answerMastCase(caseText: string): Promise<MastResponse> {
  const cleaned = caseText.trim();
  if (!cleaned || cleaned.length > 100_000) throw new Error('Invalid clinical case length');
  const result = await runConsilium({patientId:'benchmark-anonymous',freeTextInput:cleaned});
  return formatMastAnswer(result);
}
