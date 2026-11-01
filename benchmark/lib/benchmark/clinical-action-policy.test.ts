import {describe, expect, it} from 'vitest';
import {reviewClinicalPlan, tagClinicalAction} from './clinical-action-policy';

describe('benchmark clinical-action policy: lexical tagging, not a medical safety verdict', () => {
  it.each([
    ['If prolactinoma is confirmed, start cabergoline.', 'conditional'],
    ['When cardioversion becomes indicated, initiate anticoagulation.', 'conditional'],
    ['Avoid tretinoin in this patient.', 'avoid'],
    ['Do not administer this drug.', 'avoid'],
    ['Defer treatment until specialist evaluation.', 'defer'],
    ['Start treatment now.', 'recommend-now'],
    ['Treatment may be appropriate after assessment.', 'information-only'],
  ] as const)('%s -> %s', (input, expected) => {
    expect(tagClinicalAction(input).disposition).toBe(expected);
  });
  it('preserves conditions rather than turning conditional therapy into immediate prescription', () => {
    const tag=tagClinicalAction('If prolactinoma is confirmed, start cabergoline.');
    expect(tag.conditionalOn).toBe('prolactinoma is confirmed');
    expect(tag.disposition).not.toBe('recommend-now');
  });
  it('does not claim that a safe drug was proven', () => {
    const report=reviewClinicalPlan('Start aspirin now.\nAvoid aspirin in this patient.');
    expect(report.requiresClinicalReview).toBe(true);
    expect(report.counts['avoid']).toBe(1);
    expect(report.counts['recommend-now']).toBe(1);
  });
});
