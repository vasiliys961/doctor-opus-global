/**
 * Benchmark-only classification of explicit clinical action directives.
 * Deterministic lexical preflight, not a medication safety or diagnosis engine.
 * It cannot rule out contraindications or infer all clinical conditions.
 */
export type ActionDisposition = 'avoid' | 'conditional' | 'defer' | 'recommend-now' | 'information-only';
export interface ActionTag {
  text: string;
  disposition: ActionDisposition;
  conditionalOn?: string;
  needsClinicianReview: boolean;
  evidence: string;
}
const CONDITIONAL = /^(?:if|when|provided (?:that)?|only if|once|upon|in case of)\b/i;
const AVOID = /^(?:do not|don't|avoid|never|contraindicated|must not|should not|withhold|stop|discontinue)\b/i;
const DEFER = /^(?:defer|postpone|wait until|hold off|delay)\b/i;
const ACTION = /^(?:start|initiate|administer|prescribe|give|order|obtain|perform|begin|refer|arrange|consider|recommend|monitor|repeat|continue|treat)\b/i;
const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+/;
function normalize(s: string): string {
  return s.replace(/^[-*\d.)\s]+/, '').trim();
}
function findConditional(text: string): string | undefined {
  const match = text.match(/^(?:if|when|provided (?:that)?|only if|once|upon|in case of)\s+(.+?)(?:,|\bthen\b)/i);
  return match?.[1]?.trim();
}
export function tagClinicalAction(input: string): ActionTag {
  const text = normalize(input);
  const condition = findConditional(text);
  let disposition: ActionDisposition = 'information-only';
  let evidence = 'No explicit action imperative detected';
  const core = condition ? text.slice(text.indexOf(',') + 1).trim() : text;
  // Negated instructions have priority over action verbs.
  if (AVOID.test(core) || AVOID.test(text)) {
    disposition = 'avoid'; evidence = 'Explicit prohibition, withholding or discontinuation';
  } else if (DEFER.test(core)) {
    disposition = 'defer'; evidence = 'Explicit delay or deferral';
  } else if (condition && ACTION.test(core.replace(/^then\s+/i, ''))) {
    disposition = 'conditional'; evidence = 'Explicit condition preceding directive';
  } else if (ACTION.test(core)) {
    disposition = 'recommend-now'; evidence = 'Unconditional action verb (includes soft recommendations)';
  } else if (condition) {
    disposition = 'conditional'; evidence = 'Conditional sentence, action unclear';
  }
  return {text, disposition, ...(condition ? {conditionalOn: condition} : {}),
    needsClinicianReview: disposition === 'conditional' || disposition === 'recommend-now' || disposition === 'information-only',
    evidence};
}
export function tagClinicalPlan(plan: string): ActionTag[] {
  return plan.split(SENTENCE_SPLIT).map(normalize).filter(Boolean).map(tagClinicalAction);
}
/** Route safety review, not clinical validation. */
export function reviewClinicalPlan(plan: string) {
  const actions = tagClinicalPlan(plan);
  return {actions, counts: Object.fromEntries(
    (['avoid', 'conditional', 'defer', 'recommend-now', 'information-only'] as const)
      .map(k => [k, actions.filter(a => a.disposition === k).length])
  ), requiresClinicalReview: actions.some(a => a.needsClinicianReview)};
}
