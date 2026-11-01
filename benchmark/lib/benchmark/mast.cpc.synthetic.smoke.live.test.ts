import { it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { answerMastCase } from './mast';
import { getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

type SourceCase = {case_id:string;case_summary:string;final_diagnosis:string;case_title:string;full_text?:string};
const ROOTS = [
  '../sdbench-source/data/processed_case_data/synthetic',
  '../sdbench-source/sdbench/_bundled_data/processed_case_data/synthetic',
];
const OUT = 'internal-results/cpc-synthetic-smoke';
const ROUND = (x:number) => Number(x.toFixed(5));
const BUDGET_USD = 1.5;
const CASE_LIMIT = 2;
function cases():SourceCase[] {
  const dir=ROOTS.find(x=>existsSync(x));
  if(!dir) throw Error('Open Microsoft SDBench synthetic data not found: fail closed before any API call');
  const dataset=join(dir,'dataset.json');
  const records:SourceCase[] = existsSync(dataset)
    ? JSON.parse(readFileSync(dataset,'utf8'))
    : readdirSync(dir).filter(x=>/^case_.*\.json$/.test(x)).sort().map(x=>JSON.parse(readFileSync(join(dir,x),'utf8')));
  if(records.length<CASE_LIMIT) throw Error('Too few public synthetic cases');
  return [records[0],records[Math.min(2,records.length-1)]];
}
it('two open synthetic CPC-like initial-presentation tasks: full consilium, no reference leakage',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/answers.jsonl','');
  const samples=cases();
  const sourceSha=execFileSync('git',['-C','../sdbench-source','rev-parse','HEAD'],{encoding:'utf8'}).trim();
  let completed=0, failure:string|null=null;
  const initial=getDiagnosticApiUsageSnapshot();
  for(const item of samples){
    const pre=getDiagnosticApiUsageSnapshot();
    if(pre.unpricedCalls>initial.unpricedCalls || pre.costUsd-initial.costUsd>=BUDGET_USD*0.7){failure='Budget or price tracking guard';break;}
    if(!item.case_summary || !item.final_diagnosis) {failure='Missing synthetic source fields';break;}
    // Explicitly do not pass case_title, final_diagnosis, full_text or reference rubric to the model.
    const task='Synthetic clinical reasoning pilot, NOT the official NEJM CPC-Bench. '+
      'From the INITIAL PRESENTATION ONLY, propose the leading diagnosis and two alternative diagnoses. '+
      'Explain supporting and missing findings, rank next tests, and state risks of premature closure. '+
      'Do not hallucinate patient facts.\n\nINITIAL PRESENTATION:\n'+item.case_summary;
    const started=Date.now();
    try {
      const answer=await answerMastCase(task);
      if(!('response' in answer) || answer.response.length<80)throw Error('Invalid clinical reply');
      const post=getDiagnosticApiUsageSnapshot();
      const record={caseId:String(item.case_id),source:'microsoft/sdbench synthetic',sourceSha,
        inputKind:'case_summary_only',answer:answer.response,
        referenceDiagnosisForOfflineReview:item.final_diagnosis,
        elapsedSeconds:ROUND((Date.now()-started)/1000),costUsd:ROUND(post.costUsd-pre.costUsd),
        agentFailures:post.failedCalls-pre.failedCalls,costKnown:post.unpricedCalls===pre.unpricedCalls};
      appendFileSync(OUT+'/answers.jsonl',JSON.stringify(record)+'\n');
      console.log('CPC_SYNTHETIC_CASE '+JSON.stringify({...record,answer:undefined,referenceDiagnosisForOfflineReview:undefined}));
      completed++;
      if(!record.costKnown){failure='Provider did not report costs';break;}
      if(post.costUsd-initial.costUsd>=BUDGET_USD){failure='Reached post-case budget threshold';break;}
    }catch(e){failure=String(e);console.log('CPC_SYNTHETIC_ERROR '+failure);break;}
  }
  const usage=getDiagnosticApiUsageSnapshot();
  const summary={dataset:'Microsoft SDBench synthetic initial-presentation smoke, not CPC-Bench',
    completed,planned:CASE_LIMIT,trackedCostUsd:ROUND(usage.costUsd-initial.costUsd),
    unpricedCalls:usage.unpricedCalls-initial.unpricedCalls,sourceSha,stopReason:failure,
    scoring:'No official CPC score. Physician must review saved response against diagnosis and limitations.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('CPC_SYNTHETIC_SUMMARY '+JSON.stringify(summary));
  expect(completed).toBeGreaterThan(0);
},1800000);