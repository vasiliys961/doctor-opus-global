import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { answerMastCase } from './mast';
import { buildOfficialSctPrompt } from './sct-internal-cases';
import { getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

const REFERENCE_COMMIT = '57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee';
const ROOT = 'https://raw.githubusercontent.com/ARISENetwork/mast/' + REFERENCE_COMMIT + '/benchmarks/sct/dataset/';
const OUT = 'internal-results/sct-full';
const LIMIT_USD = 3;
const PRECISION = (n:number) => Number(n.toFixed(5));

type Question = {id:string;scenario:string;hypothesis:string;new_information:string;source:string};
type Rubric = {id:string;expert_distribution:number[]};

async function getJsonl<T>(url:string): Promise<T[]> {
  const r = await fetch(url, {signal: AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error('Official public dataset fetch failed: HTTP '+r.status);
  return (await r.text()).trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x) as T);
}

function percentile(sorted:number[],p:number):number {
  return sorted[Math.max(0,Math.min(sorted.length-1,Math.floor(p*(sorted.length-1))))];
}
function bootstrap95(scores:number[],n=2000):[number,number] {
  let seed=1337;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const samples:number[]=[];
  for(let b=0;b<n;b++){
    let sum=0;
    for(let i=0;i<scores.length;i++) sum+=scores[Math.floor(random()*scores.length)];
    samples.push(sum/scores.length);
  }
  samples.sort((a,b)=>a-b);
  return [PRECISION(percentile(samples,0.025)),PRECISION(percentile(samples,0.975))];
}

/** Internal-only standalone SCT test: original open prompts -> Doctor Opus -> blind expert scoring.
 * No expert_distribution is sent to the model. We do not edit the original Doctor Opus Global.
 */
it('official full open SCT (174): measured bill and expert alignment',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/answers.jsonl','');
  const [items,rubrics] = await Promise.all([
    getJsonl<Question>(ROOT+'items.jsonl'),
    getJsonl<Rubric>(ROOT+'rubrics.jsonl')
  ]);
  if(items.length!==174 || rubrics.length!==174) throw new Error('Unexpected SCT public dataset size');
  const expert = new Map(rubrics.map(x=>[x.id,x.expert_distribution]));
  const scores:number[]=[];
  let completed=0, failures=0, stopReason:string|null=null;
  let consecutiveFailures=0;
  const began=Date.now();
  for(const item of items){
    const before=getDiagnosticApiUsageSnapshot();
    if(before.unpricedCalls){stopReason='Actual OpenRouter billing unavailable; stop';break;}
    if(before.costUsd>=LIMIT_USD*0.85){stopReason='Reached 85 percent of budget cap';break;}
    const distribution=expert.get(item.id);
    if(!distribution||distribution.length!==5) throw new Error('Expert rubric missing for '+item.id);
    const started=Date.now();
    try{
      const answer=await answerMastCase(buildOfficialSctPrompt(item as Parameters<typeof buildOfficialSctPrompt>[0]));
      if(!('Rating' in answer)) throw new Error('Wrong response schema');
      const after=getDiagnosticApiUsageSnapshot();
      const max=Math.max(...distribution);
      const value=max>0?distribution[answer.Rating+2]/max:0;
      const record={
        id:item.id, source:item.source, rating:answer.Rating, rationale:answer.Rationale,
        score:PRECISION(value), expertMode:distribution.indexOf(max)-2,
        expertDistribution:distribution,
        elapsedSeconds:PRECISION((Date.now()-started)/1000),
        apiCostUsd:PRECISION(after.costUsd-before.costUsd),
        costKnown:before.unpricedCalls===after.unpricedCalls
      };
      appendFileSync(OUT+'/answers.jsonl',JSON.stringify(record)+'\n');
      scores.push(value);
      completed++;
      consecutiveFailures=0;
      if(completed%20===0)console.log('SCT_FULL_PROGRESS '+JSON.stringify({completed,total:items.length,meanScore:PRECISION(scores.reduce((a,b)=>a+b,0)/completed),billedUsd:PRECISION(after.costUsd),elapsedSeconds:PRECISION((Date.now()-began)/1000)}));
      if(!record.costKnown){stopReason='Cost not returned for some successful calls';break;}
      if(after.costUsd>=LIMIT_USD){stopReason='Reached budget cap';break;}
    }catch(e){
      failures++;
      consecutiveFailures++;
      const error=e instanceof Error?e.message:'unknown';
      appendFileSync(OUT+'/answers.jsonl',JSON.stringify({id:item.id,error})+'\n');
      console.log('SCT_FULL_CASE_ERROR '+JSON.stringify({id:item.id,error}));
      if(consecutiveFailures>=6){stopReason='Six consecutive failed cases';break;}
    }
  }
  const usage=getDiagnosticApiUsageSnapshot();
  const mean=completed?scores.reduce((a,b)=>a+b,0)/completed:null;
  const report={
    benchmark:'MAST SCT public subset',sourceCommit:REFERENCE_COMMIT,totalItems:174,
    completed,failures,scoreMeanCompleted:mean===null?null:PRECISION(mean),
    missingAsZeroScore:PRECISION(scores.reduce((a,b)=>a+b,0)/174),
    ci95Completed:completed===174?bootstrap95(scores):null,
    costUsd:PRECISION(usage.costUsd),pricedCalls:usage.pricedCalls,
    unpricedCalls:usage.unpricedCalls,apiFailures:usage.failedCalls,
    elapsedSeconds:PRECISION((Date.now()-began)/1000),stopReason,
    referenceModels:{gpt55:0.745,claudeOpus47:0.756,gemini31Pro:0.721},
    warning:'Only completed=174 and failures=0 permits comparable mean to public SCT references.'
  };
  writeFileSync(OUT+'/summary.json',JSON.stringify(report,null,2));
  console.log('SCT_FULL_SUMMARY '+JSON.stringify(report));
  expect(completed).toBeGreaterThan(0);
},2400000);
