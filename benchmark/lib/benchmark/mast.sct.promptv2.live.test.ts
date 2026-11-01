import { it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { answerMastCase } from './mast';
import { buildOfficialSctPrompt } from './sct-internal-cases';
import { getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

/**
 * Small, preregistered 20-case SCT V2 pilot (official OPEN questions).
 * IDs were sampled by Python Random(20261101) without inspecting rubric scores.
 * Compare to the already SAVED 174-answer original response artifact offline;
 * never call the baseline model again. This is exploratory and not a new MAST score.
 */
const CASE_IDS = ['1','7','12','13','16','24','30','33','35','37','57','71','85','91','101','299','310','328','344','351'] as const;
const DATA_COMMIT = '57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee';
const ROOT = 'https://raw.githubusercontent.com/ARISENetwork/mast/' + DATA_COMMIT + '/benchmarks/sct/dataset/';
const OUT = 'internal-results/sct-prompt-v2';
const BUDGET_USD = 0.35;
type Item = {id:string;scenario:string;hypothesis:string;new_information:string;source:string};
type Rubric = {id:string;expert_distribution:number[]};
const round=(x:number)=>Number(x.toFixed(5));

async function readJsonl<T>(filename:string):Promise<T[]> {
  const res = await fetch(ROOT + filename, {signal:AbortSignal.timeout(25000)});
  if (!res.ok) throw Error('Public SCT dataset download failed HTTP '+res.status);
  return (await res.text()).trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s) as T);
}

it('MAST SCT 20 cases: alternative hypothesis-type prompt, low-cost, no baseline rerun',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/answers.jsonl','');
  writeFileSync(OUT+'/preregistration.json',JSON.stringify({
    sourceCommit:DATA_COMMIT,caseIds:CASE_IDS,arms:'v2 only, compare to archived original',
    selection:'seeded random from 174 public IDs, not outcome-based',
    scoring:'expert distribution used ONLY after answer generation',
    budgetUsd:BUDGET_USD,baselineDefaultUnchanged:true
  },null,2));
  const [items,rubrics] = await Promise.all([readJsonl<Item>('items.jsonl'),readJsonl<Rubric>('rubrics.jsonl')]);
  const byId=new Map(items.map(x=>[x.id,x]));
  const reference=new Map(rubrics.map(x=>[x.id,x.expert_distribution]));
  if(items.length!==174||rubrics.length!==174)throw Error('Pinned SCT dataset changed');
  const beginning=getDiagnosticApiUsageSnapshot();
  const scores:number[]=[];
  let failed=0,stopReason:string|null=null;
  process.env.MAST_SCT_REASONING_V2='true';
  try {
    for(const id of CASE_IDS){
      const item=byId.get(id),dist=reference.get(id);
      if(!item||!dist||dist.length!==5)throw Error('Source missing case '+id);
      const pre=getDiagnosticApiUsageSnapshot();
      if(pre.unpricedCalls>beginning.unpricedCalls || pre.costUsd-beginning.costUsd>BUDGET_USD*0.75) {
        stopReason='Price unavailable or budget guard activated';break;
      }
      const started=Date.now();
      try {
        const response=await answerMastCase(buildOfficialSctPrompt(item));
        if(!('Rating' in response))throw Error('Wrong SCT schema');
        const post=getDiagnosticApiUsageSnapshot();
        if(post.unpricedCalls>pre.unpricedCalls){stopReason='Unpriced provider call';break;}
        const score=dist[response.Rating+2]/Math.max(...dist);
        const row={id,source:item.source,rating:response.Rating,rationale:response.Rationale,
          score:round(score),seconds:round((Date.now()-started)/1000),
          billedUsd:round(post.costUsd-pre.costUsd),attemptedCalls:post.pricedCalls-pre.pricedCalls};
        appendFileSync(OUT+'/answers.jsonl',JSON.stringify(row)+'\n');
        console.log('SCT_V2_CASE '+JSON.stringify({...row,rationale:undefined}));
        scores.push(score);
      }catch(e){
        failed++;
        appendFileSync(OUT+'/answers.jsonl',JSON.stringify({id,error:String(e)})+'\n');
        console.log('SCT_V2_FAILURE '+JSON.stringify({id,error:String(e)}));
        if(failed>=3){stopReason='Three failures';break;}
      }
    }
  } finally {delete process.env.MAST_SCT_REASONING_V2;}
  const usage=getDiagnosticApiUsageSnapshot();
  const report={sourceCommit:DATA_COMMIT,planned:CASE_IDS.length,completed:scores.length,failed,
    meanCompleted:scores.length?round(scores.reduce((a,b)=>a+b,0)/scores.length):null,
    scoreMissingAsZero:round(scores.reduce((a,b)=>a+b,0)/CASE_IDS.length),
    billedUsd:round(usage.costUsd-beginning.costUsd),
    unpricedCalls:usage.unpricedCalls-beginning.unpricedCalls,
    stopReason,warning:'Exploratory open sample. Baseline must be compared offline using matching original case IDs. Not official MAST Clinical Reasoning dimension.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(report,null,2));
  console.log('SCT_V2_SUMMARY '+JSON.stringify(report));
  expect(scores.length).toBeGreaterThan(0);
},1800000);
