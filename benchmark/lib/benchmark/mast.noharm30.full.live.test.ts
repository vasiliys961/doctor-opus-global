import { it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { answerMastCase } from './mast';
import { getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

/**
 * INTERNAL FULL-SYSTEM NOHARM baseline.
 * Every uncached answer goes through answerMastCase -> runConsilium (selected
 * specialists, skeptic, conditional debate, physician-oriented synthesis).
 * This is NEVER the SCT fast path and NEVER a standalone LLM comparison.
 * Expert rubrics stay outside inference and are not visible to the model.
 * Old cached answers were generated with the same pipeline and case prompts.
 */
const SOURCE_COMMIT='57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee';
const SOURCE='https://raw.githubusercontent.com/ARISENetwork/mast/'+SOURCE_COMMIT+'/benchmarks/donoharm/dataset/items.jsonl';
const OUT='internal-results/noharm-30-system';
const PREVIOUS=process.env.NOHARM_EXISTING_ANSWERS||'internal-results/noharm-30-cache/answers.jsonl';
const HARD_SOFT_CAP_USD=8;
const round=(x:number)=>Number(x.toFixed(5));

type OfficialCase={id:string;prompt:string;metadata:{perturb_id:number|null;open:boolean}};
type Answer={id:string;trial:1;response:string;usage:{cost:number;prompt_tokens:number;completion_tokens:number};cached?:boolean};
type Ledger={id:string;status:string;costUsd:number;elapsedSeconds:number;agentApiFailures:number;callCount:number;source:string;error?:string};

async function fetchPublicCases():Promise<OfficialCase[]>{
 const res=await fetch(SOURCE,{signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error('Official NOHARM dataset unavailable: '+res.status);
 return (await res.text()).split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x) as OfficialCase)
   .filter(x=>x.metadata?.perturb_id===null&&x.metadata?.open);
}
it('real Doctor Opus multiagent consilium on all 30 open NOHARM cases',async()=>{
 mkdirSync(OUT,{recursive:true});
 const responsesFile=OUT+'/doctor-opus-consilium.jsonl';
 const ledgerFile=OUT+'/ledger.jsonl';
 writeFileSync(responsesFile,'');
 writeFileSync(ledgerFile,'');
 const cases=await fetchPublicCases();
 if(cases.length!==30)throw Error('Expected exactly 30 official baseline NOHARM cases, got '+cases.length);
 const previous=new Map<string,Answer>();
 if(existsSync(PREVIOUS)){
   for(const line of readFileSync(PREVIOUS,'utf8').split(/\r?\n/).filter(Boolean)){
     try {
       const row=JSON.parse(line);
       if(typeof row.id==='string' && typeof row.response==='string' && row.response.trim().length>=150 && cases.some(c=>c.id===row.id)){
         previous.set(row.id,{id:row.id,trial:1,response:row.response,usage:{
           cost:Number(row.costUsd||0),prompt_tokens:Number(row.inputTokens||0),
           completion_tokens:Number(row.outputTokens||0)},cached:true});
       }
     }catch{/* ignore corrupted prior record */}
   }
 }
 let completed=0,reused=0,failed=0,stoppedReason:string|null=null;
 const started=Date.now();
 for(const item of cases){
   if(previous.has(item.id)){
     const answer=previous.get(item.id)!;
     appendFileSync(responsesFile,JSON.stringify(answer)+'\n');
     appendFileSync(ledgerFile,JSON.stringify({id:item.id,status:'reused-prior-system-run',costUsd:0,elapsedSeconds:0,agentApiFailures:0,callCount:0,source:'github-actions-run-41233224457'})+'\n');
     completed++;reused++;
     continue;
   }
   const before=getDiagnosticApiUsageSnapshot();
   if(before.unpricedCalls>0){stoppedReason='Some provider calls had unknown billing';break;}
   // Cap is between cases (a case can issue parallel LLM calls), not bank-level hard limit.
   if(before.costUsd>=HARD_SOFT_CAP_USD*0.85){stoppedReason='Spending near configured $8 limit';break;}
   const t=Date.now();
   try{
     const result=await answerMastCase(item.prompt);
     if(!('response' in result) || result.response.trim().length<150)throw Error('Missing or too-short management plan');
     const after=getDiagnosticApiUsageSnapshot();
     const response:Answer={id:item.id,trial:1,response:result.response,usage:{
       cost:round(after.costUsd-before.costUsd),
       prompt_tokens:after.promptTokens-before.promptTokens,
       completion_tokens:after.completionTokens-before.completionTokens}};
     const ledger:Ledger={id:item.id,status:'done',costUsd:response.usage.cost,
       elapsedSeconds:round((Date.now()-t)/1000),
       agentApiFailures:after.failedCalls-before.failedCalls,
       callCount:after.pricedCalls-before.pricedCalls,
       source:'current-full-system'};
     appendFileSync(responsesFile,JSON.stringify(response)+'\n');
     appendFileSync(ledgerFile,JSON.stringify(ledger)+'\n');
     completed++;
     console.log('NOHARM30_CASE '+JSON.stringify(ledger));
     if(after.unpricedCalls>before.unpricedCalls){stoppedReason='Unknown actual billed amount on a successful case';break;}
     if(after.costUsd>=HARD_SOFT_CAP_USD){stoppedReason='Reached configured $8 spending limit';break;}
   }catch(e){
     failed++;
     const after=getDiagnosticApiUsageSnapshot();
     const ledger:Ledger={id:item.id,status:'failed',costUsd:round(after.costUsd-before.costUsd),
       elapsedSeconds:round((Date.now()-t)/1000),
       agentApiFailures:after.failedCalls-before.failedCalls,
       callCount:after.pricedCalls-before.pricedCalls,
       source:'current-full-system',error:e instanceof Error?e.message:'unknown'};
     appendFileSync(ledgerFile,JSON.stringify(ledger)+'\n');
     console.log('NOHARM30_ERROR '+JSON.stringify(ledger));
     if(failed>=3){stoppedReason='Three case failures; stopping to diagnose';break;}
   }
 }
 const u=getDiagnosticApiUsageSnapshot();
 const summary={benchmark:'First Do NOHARM open 30 baseline cases, k=1',
   system:'Doctor Opus Consilium full multiagent pathway',sourceCommit:SOURCE_COMMIT,
   planned:cases.length,completed,reused,failed,generatedNow:completed-reused,
   incrementalBilledUsd:round(u.costUsd),pricedCalls:u.pricedCalls,
   unpricedCalls:u.unpricedCalls,apiFailures:u.failedCalls,
   elapsedSeconds:round((Date.now()-started)/1000),
   stoppedReason,officialScoreReady:completed===30&&failed===0,
   caveat:'No score until the official two-stage Gemini judge processes complete outputs. A 30-case k=1 score is not the MAST k=11 330-variant leaderboard score.'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('NOHARM30_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBe(30);
 expect(failed).toBe(0);
},9000000);
