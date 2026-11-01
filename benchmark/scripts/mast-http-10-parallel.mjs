import fs from 'node:fs';
import {performance} from 'node:perf_hooks';

const endpoint='http://127.0.0.1:3000/api/benchmark/mast';
const token=process.env.MAST_BENCHMARK_TOKEN;
if(!token)throw Error('Missing internal load-test token');
const variants=[
 ['fever and cough','new focal right lower lobe consolidation','community-acquired pneumonia'],
 ['acute pleuritic pain','new wedge-shaped opacity with small effusion','pulmonary embolism'],
 ['dysuria and frequency','nitrite-positive urine','acute urinary infection'],
 ['severe headache and stiff neck','neutrophilic CSF pleocytosis','bacterial meningitis'],
 ['fatigue, pale conjunctiva','MCV 65 fL and serum ferritin 4','iron deficiency anemia'],
 ['polyuria and thirst','fasting glucose 240 mg/dL','diabetes mellitus'],
 ['joint pain and morning stiffness','anti-CCP strongly positive','rheumatoid arthritis'],
 ['episodic palpitations','ECG shows atrial fibrillation','atrial fibrillation'],
 ['unilateral calf swelling','compression ultrasound shows noncompressible popliteal vein','deep venous thrombosis'],
 ['fever and dyspnea','CT shows bilateral peripheral ground glass','viral pneumonia']
];
const tasks=variants.map(([scenario,info,hypothesis],i)=>({
 id:'http-load-'+(i+1),prompt:'# Script Concordance Testing\n\n## Scenario\nAn adult patient with '+scenario+'.\n\n## Hypothesis\n'+hypothesis+'\n\n## Additional Information\n'+info+'.'
}));
const t0=performance.now();
const results=await Promise.all(tasks.map(async task=>{
 const start=performance.now();
 try {
  const response=await fetch(endpoint,{method:'POST',
   headers:{authorization:'Bearer '+token,'content-type':'text/plain'},
   body:task.prompt,signal:AbortSignal.timeout(270000)});
  const json=await response.json();
  const valid=response.ok && Number.isInteger(json.Rating) &&
    json.Rating>=-2 && json.Rating<=2 && typeof json.Rationale==='string'&&json.Rationale.length>0;
  return {id:task.id,httpStatus:response.status,valid,seconds:Number(((performance.now()-start)/1000).toFixed(3)),
   modelError:response.ok?null:json.error||'invalid-output'};
 }catch(e){return{id:task.id,httpStatus:null,valid:false,
  seconds:Number(((performance.now()-start)/1000).toFixed(3)),
  modelError:e instanceof Error?e.name:'unknown'};}
}));
const elapsed=(performance.now()-t0)/1000;
const times=results.map(r=>r.seconds).sort((a,b)=>a-b);
const percentile=p=>times[Math.ceil(p*times.length)-1];
const summary={concurrency:10,completed:results.length,valid:results.filter(x=>x.valid).length,
 failed:results.filter(x=>!x.valid).length,wallSeconds:Number(elapsed.toFixed(3)),
 p50Seconds:percentile(0.5),p95Seconds:percentile(0.95),maxSeconds:times.at(-1),
 successUnder300:results.every(x=>x.valid&&x.seconds<300),
 costUsd:null,note:'10 synthetic SCT-style cases for end-to-end HTTP capacity, NOT clinical benchmark scoring.'};
fs.mkdirSync('internal-results/http-load-10',{recursive:true});
fs.writeFileSync('internal-results/http-load-10/report.json',JSON.stringify({summary,results},null,2));
console.log('MAST_HTTP_LOAD_SUMMARY '+JSON.stringify(summary));
if(!summary.successUnder300)process.exitCode=1;
