import { it, expect } from 'vitest';
import { answerMastCase } from './mast';
const cases = [["dka","A 21-year-old with type 1 diabetes missed insulin, vomiting, abdominal pain, Kussmaul breathing, glucose 480 mg/dL, pH 7.12, bicarbonate 9 mmol/L, positive serum ketones. Most likely diagnosis?","ketoacidos"],["pe","A 53-year-old 9 days after knee replacement develops sudden dyspnea, pleuritic chest pain, tachycardia 125 bpm, oxygen saturation 88%, unilateral calf swelling. CT angiogram reveals segmental filling defects in pulmonary arteries. Most likely diagnosis?","pulmonary embol"],["acs","A 62-year-old develops 45 minutes of crushing substernal chest pain and diaphoresis. ECG shows ST elevations in II, III and aVF with reciprocal depression in I and aVL. Most likely diagnosis?","myocardial infarct|stemi"],["meningitis","A 19-year-old has fever 39.5 C, severe headache, neck stiffness, confusion, petechial rash, CSF neutrophilic pleocytosis with low glucose. Most likely diagnosis?","meningitis|meningococ"],["thyroid","A 34-year-old woman has palpitations, tremor, weight loss despite increased appetite, exophthalmos, diffusely enlarged thyroid, suppressed TSH and elevated free T4. Most likely diagnosis?","graves|hyperthyroid"],["iron","A 43-year-old woman reports fatigue and pica, microcytic anemia MCV 68 fL, ferritin 6 ng/mL, elevated TIBC. Most likely diagnosis?","iron.deficien"],["chf","A 71-year-old has progressive orthopnea, bilateral leg edema, elevated JVP, crackles, BNP 2000 pg/mL, echo LVEF 28%. Most likely diagnosis?","heart failure|hfref|systolic"],["pancreatitis","A 48-year-old after heavy alcohol intake has severe epigastric pain radiating to back, vomiting, lipase 1500 U/L and peripancreatic inflammation on CT. Most likely diagnosis?","pancreatitis"],["addison","A 37-year-old woman has chronic fatigue, weight loss, skin hyperpigmentation, hypotension, sodium 126, potassium 5.9, low morning cortisol and high ACTH. Most likely diagnosis?","adrenal insufficien|addison"],["stroke","A 68-year-old with atrial fibrillation suddenly develops right facial droop, right arm weakness and expressive aphasia. Non-contrast CT shows no hemorrhage. Most likely diagnosis?","ischemic stroke|cerebral infarct|middle cerebral artery|mca stroke"]] as Array<[string,string,string]>;
it('runs 10 synthetic clinical cases through Doctor Opus multi-agent consilium', async()=>{
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing');
  const results: Array<{id:string,ms:number,chars:number,match:boolean,hasRationale:boolean,failed:boolean}> = [];
  for (const [id, clinicalCase, expected] of cases) {
    const begin=Date.now();
    try {
      const response=await answerMastCase(clinicalCase);
      const output='response' in response ? response.response : response.Rationale;
      results.push({id,ms:Date.now()-begin,chars:output.length,match:new RegExp(expected,'i').test(output),hasRationale:/Rationale:/i.test(output),failed:false});
    } catch(e) { results.push({id,ms:Date.now()-begin,chars:0,match:false,hasRationale:false,failed:true}); }
    console.log('CASE_METRIC '+JSON.stringify(results[results.length-1]));
  }
  console.log('SUMMARY '+JSON.stringify({total:results.length,completed:results.filter(x=>!x.failed).length,matched:results.filter(x=>x.match).length,elapsedMs:results.reduce((s,x)=>s+x.ms,0)}));
  expect(results.every(x=>!x.failed)).toBe(true);
}, 1800000);
