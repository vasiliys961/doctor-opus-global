import {it,expect} from 'vitest';
import {matchOfficialDrugLabel,formatOfficialDrugLabelEvidence} from './drug-label-evidence';
it('retrieves the precise official OPDIVO infusion rule when drug, event and severe grade are given',()=>{
 const evidence=matchOfficialDrugLabel('After cycle 3 nivolumab, a grade 3 infusion reaction occurred; patient is asking about another dose');
 expect(evidence).toHaveLength(1);
 expect(evidence[0].action).toBe('permanently_discontinue');
 expect(evidence[0].sourceUrl).toMatch(/^https:\/\/dailymed\.nlm\.nih\.gov\//);
 expect(formatOfficialDrugLabelEvidence(evidence)).toContain('not patient data');
});
it('does not confuse generic immune-mediated toxicities or grade-2 infusion effects with grade-3/4 infusion reactions',()=>{
 expect(matchOfficialDrugLabel('Nivolumab, grade 3 immune-mediated pneumonitis')).toEqual([]);
 expect(matchOfficialDrugLabel('Opdivo caused grade 2 infusion reaction')).toEqual([]);
 expect(matchOfficialDrugLabel('Grade 3 infusion reaction with an unspecified drug')).toEqual([]);
 expect(matchOfficialDrugLabel('Nivolumab with no adverse event')).toEqual([]);
});
it('matches alternative infusional reaction phrasing without inventing an event',()=>{
 expect(matchOfficialDrugLabel('Grade IV infusion hypersensitivity reaction after OPDIVO')).toHaveLength(1);
});
