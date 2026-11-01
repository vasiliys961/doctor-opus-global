import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {answerMastCase} from './mast';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

const OUT='internal-results/nih-rag-clinical-smoke';
const CASES=[
 {id:'synthetic-pjp',question:'A fictional 43-year-old man with newly diagnosed HIV has CD4 count 65 cells/uL, fever, exertional dyspnea, resting oxygen saturation 88%, bilateral ground-glass lung opacities, positive induced-sputum Pneumocystis PCR. No known drug allergies, creatinine 0.9 mg/dL. Provide immediate triage, diagnostic confirmation, treatment including severity assessment and when to consider adjunctive corticosteroids, preventive care and monitoring.'},
 {id:'synthetic-toxoplasma',question:'A fictional 38-year-old woman with untreated advanced HIV (CD4 42 cells/uL) has headache, new right-arm weakness and two ring-enhancing cerebral lesions with edema. Toxoplasma IgG is positive. Vital signs stable; no listed drug allergies. Describe initial evaluation, differential diagnosis, treatment strategy including how to assess response and when tissue diagnosis is needed, and actions to prevent avoidable harm.'},
];
const round=(x:number)=>Number(x.toFixed(4));
it('full clinical consilium A/B with optional NIH RAG on synthetic cases',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/responses-control.jsonl','');
  writeFileSync(OUT+'/responses-nih.jsonl','');
  writeFileSync(OUT+'/ledger.jsonl','');
  const index=process.env.NIH_RAG_INDEX_PATH;
  if(!index)throw Error('NIH_RAG_INDEX_PATH required');
  const variants=['control','nih'] as const;
  const t0=Date.now();
  let completed=0;
  for(const [i,scenario] of CASES.entries()){
    const order=i===0?variants:[...variants].reverse();
    for(const arm of order){
      const before=getDiagnosticApiUsageSnapshot();
      if(before.unpricedCalls)throw Error('Provider cost unpriced');
      if(before.costUsd>=2.4)throw Error('Soft $2.50 experiment spend cap near exhaustion');
      if(arm==='nih')process.env.MAST_GUIDELINES_RAG_INDEX_PATH=index;
      else delete process.env.MAST_GUIDELINES_RAG_INDEX_PATH;
      const start=Date.now();
      try{
        const output=await answerMastCase(scenario.question);
        if(!('response' in output)||output.response.trim().length<120)throw Error('No completed management response');
        const after=getDiagnosticApiUsageSnapshot();
        const row={caseId:scenario.id,arm,trial:1,output:output.response,
          usage:{cost:round(after.costUsd-before.costUsd),
            inputTokens:after.promptTokens-before.promptTokens,
            outputTokens:after.completionTokens-before.completionTokens},
          seconds:round((Date.now()-start)/1000),
          failedCalls:after.failedCalls-before.failedCalls};
        if(after.unpricedCalls>before.unpricedCalls)throw Error('Unpriced calls appeared');
        appendFileSync(OUT+'/responses-'+arm+'.jsonl',JSON.stringify(row)+'\n');
        appendFileSync(OUT+'/ledger.jsonl',JSON.stringify({
          caseId:row.caseId,arm,costUsd:row.usage.cost,
          seconds:row.seconds,failedCalls:row.failedCalls,status:'complete'})+'\n');
        console.log('NIH_RAG_CLINICAL_SMOKE '+JSON.stringify({
          id:scenario.id,arm,costUsd:row.usage.cost,
          seconds:row.seconds,failedCalls:row.failedCalls,answerChars:output.response.length}));
        completed++;
      } finally{delete process.env.MAST_GUIDELINES_RAG_INDEX_PATH}
    }
  }
  const usage=getDiagnosticApiUsageSnapshot();
  const summary={syntheticCases:CASES.length,completedArms:completed,
    usd:round(usage.costUsd),failedCalls:usage.failedCalls,seconds:round((Date.now()-t0)/1000),
    caveat:'Technical end-to-end demonstration with two synthetic clinical inputs, NOT a formal NOHARM clinical safety or MAST score.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('NIH_RAG_CLINICAL_SUMMARY '+JSON.stringify(summary));
  expect(completed).toBe(4);
},5400000);
