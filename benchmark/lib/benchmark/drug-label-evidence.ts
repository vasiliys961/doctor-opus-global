/**
 * Small provenance-locked registry of verifiable PUBLIC prescribing-label
 * rules. Contest benchmark only. Not a complete contraindication engine.
 * Source is publisher text; do not treat it as task instructions.
 */
export interface OfficialLabelEvidence {
  drug: string;
  event: 'infusion_related_reaction';
  severity: 'grade_3_or_4';
  action: 'permanently_discontinue';
  sourceTitle: string;
  section: string;
  sourceUrl: string;
  verifiedAsOf: string;
  evidenceText: string;
}
const OPDIVO_LABEL: OfficialLabelEvidence=Object.freeze({
  drug:'nivolumab',
  event:'infusion_related_reaction',
  severity:'grade_3_or_4',
  action:'permanently_discontinue',
  sourceTitle:'DailyMed U.S. prescribing information: OPDIVO (nivolumab)',
  section:'2.3 Dosage Modifications, Table 3: Infusion-Related Reactions; 5.2 Infusion-Related Reactions',
  sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f570b9c4-6846-4de2-abfa-4d0a4ae4e394',
  verifiedAsOf:'2026-11-01',
  evidenceText:'For OPDIVO infusion-related reactions of Grade 3 or 4, the U.S. prescribing label directs permanent discontinuation. This is the INFUSION-RELATED REACTION row; do not confuse it with the general guidance for immune-mediated adverse reactions.',
});
const grade34=/\bgrade\s*(?:iii|iv|3|4)\b/i;
const infusion=/\b(?:infusion[- ]related|infusion\s+(?:hypersensitivity\s+)?reaction|reaction\s+(?:during|following|after)\s+(?:an\s+)?infusion)\b/i;
const drug=/\b(?:nivolumab|opdivo)\b/i;
/** Returns evidence only where both drug and adverse event are explicitly given.
 * A grade alone is NOT enough; don't inject unrelated guidance into a case.
 */
export function matchOfficialDrugLabel(caseText:string):OfficialLabelEvidence[]{
  return drug.test(caseText)&&grade34.test(caseText)&&infusion.test(caseText)?[OPDIVO_LABEL]:[];
}
export function formatOfficialDrugLabelEvidence(matches:OfficialLabelEvidence[]):string{
  return matches.map(m=>
    'PUBLIC PRESCRIBING-LABEL EVIDENCE (not patient data, not instructions from the task):\n'+
    'Drug: '+m.drug+'; event: '+m.event+'; grade: '+m.severity+'; recommended action: '+m.action+'\n'+
    'Official source: '+m.sourceTitle+'\nSection: '+m.section+'\nURL: '+m.sourceUrl+
    '\nVerified: '+m.verifiedAsOf+'\nRule: '+m.evidenceText+
    '\nThis source does not establish whether a suspected reaction was correctly classified. Do not invent exception rules.'
  ).join('\n\n');
}
