import {it, expect} from 'vitest';
import {mkdirSync, appendFileSync, writeFileSync} from 'node:fs';
import {answerMastCase} from './mast';
import {SCT_PILOT_CASES, buildOfficialSctPrompt} from './sct-internal-cases';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

const OUT='internal-results/sct-pilot';
const BUDGET_USD=2;
const round=(n:number)=>Number(n.toFixed(5));

it('official SCT eight-case private pilot, expert-consensus scoring',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/answers.jsonl','');
  let completed=0;
  let failures=0;
  let weightedScoreSum=0;
  let stopReason:string|null=null;
  for(const item of SCT_PILOT_CASES){
    const before=getDiagnosticApiUsageSnapshot();
    if(before.unpricedCalls>0){stopReason='Unpriced LLM calls; cannot enforce budget';break;}
    if(before.costUsd>=BUDGET_USD*0.8){stopReason='Near pilot budget';break;}
    const started=Date.now();
    try{
      const prompt=buildOfficialSctPrompt(item);
      const answer=await answerMastCase(prompt);
      if(!('Rating' in answer))throw new Error('SCT route returned management response instead of Rating');
      const after=getDiagnosticApiUsageSnapshot();
      const d=item.expert_distribution as readonly number[];
      const max=Math.max(...d);
      const score=max>0?d[answer.Rating+2]/max:0;
      weightedScoreSum+=score;
      completed++;
      const row={id:item.id,source:item.source,rating:answer.Rating,rationale:answer.Rationale,
        expertDistribution:d,expertMode:d.indexOf(max)-2,sctScore:round(score),
        durationSeconds:round((Date.now()-started)/1000),
        billedUsd:round(after.costUsd-before.costUsd),pricedCalls:after.pricedCalls-before.pricedCalls,
        unpricedCalls:after.unpricedCalls-before.unpricedCalls};
      appendFileSync(OUT+'/answers.jsonl',JSON.stringify(row)+'\n');
      console.log('SCT_PILOT_CASE '+JSON.stringify({...row,rationale:undefined,expertDistribution:undefined}));
      if(row.unpricedCalls>0){stopReason='Missing actual cost for a successful call';break;}
    }catch(e){
      failures++;
      const error=e instanceof Error?e.message:'unknown error';
      appendFileSync(OUT+'/answers.jsonl',JSON.stringify({id:item.id,error})+'\n');
      console.log('SCT_PILOT_ERROR '+JSON.stringify({id:item.id,error}));
    }
  }
  const usage=getDiagnosticApiUsageSnapshot();
  const summary={planned:SCT_PILOT_CASES.length,completed,failures,
    meanSctScore:completed?round(weightedScoreSum/completed):null,
    actualApiCostUsd:round(usage.costUsd),pricedCalls:usage.pricedCalls,
    unpricedCalls:usage.unpricedCalls,failedCalls:usage.failedCalls,
    stoppedReason:stopReason,
    note:'Small convenience sample, no CI. Official comparator uses 174 open SCT items.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('SCT_PILOT_SUMMARY '+JSON.stringify(summary));
  expect(completed).toBeGreaterThanOrEqual(1);
},1200000);
