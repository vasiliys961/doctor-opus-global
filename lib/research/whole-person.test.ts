import { describe, expect, it } from 'vitest';
import { summarizeCohort, type ResearchDataset } from './whole-person';
const example: ResearchDataset = {
  patients: [{patientId:'p1',cohort:'A'},{patientId:'p2',cohort:'A'},{patientId:'p3',cohort:'B'}],
  observations: [
    {patientId:'p1',recordedAt:'2026-01-01',code:'systolic_bp',value:140,unit:'mmHg',source:'visit',reviewed:true},
    {patientId:'p1',recordedAt:'2026-02-01',code:'systolic_bp',value:130,unit:'mmHg',source:'visit',reviewed:true},
    {patientId:'p2',recordedAt:'2026-01-01',code:'systolic_bp',value:160,unit:'mmHg',source:'visit',reviewed:false},
    {patientId:'p3',recordedAt:'2026-01-01',code:'systolic_bp',value:120,unit:'mmHg',source:'visit',reviewed:true},
  ],
};
describe('whole-person cohort summary',()=>{
  it('includes reviewed measurements and counts missingness by patient',()=>{
    const s=summarizeCohort(example,'A');
    expect(s).toEqual({patients:2,observations:2,excludedUnreviewed:1,byCode:{systolic_bp:{patients:1,observations:2,mean:135,min:130,max:140,missingPatients:1}}});
  });
  it('rejects mixed units',()=>{
    const data=structuredClone(example);data.observations[1].unit='kPa';
    expect(()=>summarizeCohort(data)).toThrow('Mixed measurement units');
  });
  it('rejects duplicated IDs',()=>{
    expect(()=>summarizeCohort({...example,patients:[example.patients[0],example.patients[0]]})).toThrow();
  });
});
