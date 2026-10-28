/**
 * Whole-person longitudinal cohort analytics.
 * Research-only: no patient-facing risk score, no causal inference.
 * Inputs must be de-identified and authorized for research.
 */
export type ResearchObservation = {
  patientId: string;
  recordedAt: string;
  code: string;
  value: number;
  unit: string;
  source: string;
  reviewed: boolean;
};
export type PatientContext = {
  patientId: string;
  cohort?: string;
  language?: string;
  ageYears?: number;
  accessToCare?: string;
};
export type ResearchDataset = { patients: PatientContext[]; observations: ResearchObservation[] };
export type CohortSummary = {
  patients: number;
  observations: number;
  byCode: Record<string, { patients: number; observations: number; mean: number; min: number; max: number; missingPatients: number }>;
  excludedUnreviewed: number;
};
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s) && Number.isFinite(Date.parse(s));
export function summarizeCohort(input: ResearchDataset, cohort?: string): CohortSummary {
  if (!Array.isArray(input.patients) || !Array.isArray(input.observations)) throw new Error('Invalid dataset');
  const patients = input.patients.filter(p => !cohort || p.cohort === cohort);
  const ids = new Set(patients.map(p => p.patientId));
  if (ids.size !== patients.length || [...ids].some(id => !id.trim())) throw new Error('Duplicate or missing patient identifiers');
  const relevant = input.observations.filter(o => ids.has(o.patientId));
  const excludedUnreviewed = relevant.filter(o => !o.reviewed).length;
  const included = relevant.filter(o => o.reviewed);
  const byCode: CohortSummary['byCode'] = {};
  const codes = [...new Set(included.map(o => o.code))];
  for (const code of codes) {
    const values = included.filter(o => o.code === code);
    if (values.some(o => !Number.isFinite(o.value) || !validDate(o.recordedAt) || !o.unit || !o.source)) throw new Error('Invalid observation');
    const units = new Set(values.map(o => o.unit));
    if (units.size !== 1) throw new Error('Mixed measurement units for ' + code);
    const observedIds = new Set(values.map(o => o.patientId));
    const numeric = values.map(o => o.value);
    byCode[code] = {
      patients: observedIds.size,
      observations: values.length,
      mean: numeric.reduce((s,v) => s+v,0)/numeric.length,
      min: Math.min(...numeric),
      max: Math.max(...numeric),
      missingPatients: patients.length - observedIds.size,
    };
  }
  return { patients: patients.length, observations: included.length, byCode, excludedUnreviewed };
}
