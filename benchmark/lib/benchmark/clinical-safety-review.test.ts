import {describe,it,expect} from 'vitest';
import {detectSafetySignals,requestedSafetyMode,auditManagementSafety} from './clinical-safety-review';

describe('MAST contest-only safety reviewer, OFF by default',()=>{
 it('recognizes high-risk serious drug reaction regardless of wording order',()=>{
  expect(detectSafetySignals('Grade 3 infusion reaction to nivolumab 5 days ago')).toContain('severe_drug_reaction');
  expect(detectSafetySignals('Patient had an infusion hypersensitivity reaction, grade IV')).toContain('severe_drug_reaction');
 });
 it('detects diverse safety-relevant risks without classifying ordinary cases',()=>{
  expect(detectSafetySignals('Patient on warfarin reports gastrointestinal bleeding')).toContain('anticoagulation_bleeding');
  expect(detectSafetySignals('Potassium 6.7 with ECG changes')).toContain('dangerous_electrolyte');
  expect(detectSafetySignals('AKI, renal failure, uses metformin')).toContain('renal_drug_risk');
  expect(detectSafetySignals('Pregnant patient taking isotretinoin')).toContain('pregnancy_drug_risk');
  expect(detectSafetySignals('Adult with well-controlled blood pressure')).toEqual([]);
 });
 it('never turns on the new review with an unknown environment value',()=>{
  expect(requestedSafetyMode('off')).toBe('off');
  expect(requestedSafetyMode('')).toBe('off');
  expect(requestedSafetyMode('nonsense')).toBe('off');
  expect(requestedSafetyMode('audit')).toBe('audit');
  expect(requestedSafetyMode('enforce')).toBe('enforce');
 });
 it('preserves original answer and makes no external call on ordinary or disabled case',async()=>{
  const baseline='Continue care per clinically indicated monitoring.';
  const ordinary=await auditManagementSafety({caseText:'Uncomplicated rhinitis',response:baseline,mode:'audit'});
  expect(ordinary.response).toBe(baseline);
  expect(ordinary.triggered).toEqual([]);
  expect(ordinary.costUsd).toBe(0);
  const disabled=await auditManagementSafety({caseText:'Grade 3 infusion reaction',response:baseline,mode:'off'});
  expect(disabled.response).toBe(baseline);
  expect(disabled.costUsd).toBe(0);
 });
});
