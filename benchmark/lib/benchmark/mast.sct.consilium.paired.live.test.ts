import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {answerMastCase} from './mast';
import {buildOfficialSctPrompt} from './sct-internal-cases';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

const ROOT='https://raw.githubusercontent.com/ARISENetwork/mast/57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee/benchmarks/sct/dataset/';
const OUT='internal-results/sct-consilium-paired';
const CASE_IDS=['6','22','43','64']; // predeclared across different clinical specialties
const BUDGET_USD=2.50;
type Item={id:string;scenario:string;hypothesis:string;new_information:string};
type Rubric={id:string;expert_distribution:number[]};
const round=(v:number)=>Number(v.toFixed(5));

async function load<T>(name:string):Promise<T[]> {
 const r=await fetch(ROOT+name,{signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Pinned public SCT HTTP '+r.status);
 return (await r.text()).split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x) as T);
}

it('paired original SCT fast path versus actual whole Doctor Opus consilium',async()=>{
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/answers.jsonl','');
 const [items,rubrics]=await Promise.all([load<Item>('items.jsonl'),load<Rubric>('rubrics.jsonl')]);
 const source=new Map(items.map(x=>[x.id,x]));
 const expert=new Map(rubrics.map(x=>[x.id,x.expert_distribution]));
 writeFileSync(OUT+'/preregistration.json',JSON.stringify({caseIds:CASE_IDS,
   design:'same original public SCT prompt, single-model fast path against full multiagent consilium, alternating arm order',
   scoring:'expert_distribution[rating+2] / max(expert_distribution); no rubric or expert distribution reaches models',
   datasetCommit:'57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee',budgetUsd:BUDGET_USD},null,2));
 const beforeAll=getDiagnosticApiUsageSnapshot();
 let complete=0;
 const outputs:Record<string,Record<string,number>>={};
 for(const [i,id] of CASE_IDS.entries()){
   const item=source.get(id),distribution=expert.get(id);
   if(!item||!distribution||distribution.length!==5)throw Error('Pinned SCT source incomplete for '+id);
   const order=i%2===0?['fast','consilium']:['consilium','fast'];
   outputs[id]={};
   for(const arm of order){
     const before=getDiagnosticApiUsageSnapshot();
     if(before.costUsd-beforeAll.costUsd>=BUDGET_USD*0.85)
       throw Error('Predeclared SCT spending cap; stopped before next call');
     const start=Date.now();
     try{
       if(arm==='consilium')process.env.MAST_SCT_FULL_CONSILIUM='true';
       else delete process.env.MAST_SCT_FULL_CONSILIUM;
       const response=await answerMastCase(buildOfficialSctPrompt(item));
       if(!('Rating' in response)||response.Rating < -2||response.Rating > 2)
         throw Error('Not a valid SCT rating');
       const usage=getDiagnosticApiUsageSnapshot();
       if(usage.unpricedCalls>before.unpricedCalls)throw Error('Provider cost unavailable');
       const score=distribution[response.Rating+2]/Math.max(...distribution);
       const result={caseId:id,arm,rating:response.Rating,rationale:response.Rationale,
         score:round(score),seconds:round((Date.now()-start)/1000),
         costUsd:round(usage.costUsd-before.costUsd),agentFailures:usage.failedCalls-before.failedCalls};
       appendFileSync(OUT+'/answers.jsonl',JSON.stringify(result)+'\n');
       console.log('SCT_CONSILIUM_PAIR '+JSON.stringify({...result,rationale:undefined}));
       outputs[id][arm]=score;
       complete++;
     }finally{delete process.env.MAST_SCT_FULL_CONSILIUM}
   }
 }
 const differences=CASE_IDS.map(id=>outputs[id].consilium-outputs[id].fast);
 const usage=getDiagnosticApiUsageSnapshot();
 const report={completed:complete,planned:CASE_IDS.length*2,
   nPairs:CASE_IDS.length,fastScore:round(CASE_IDS.reduce((s,id)=>s+outputs[id].fast,0)/CASE_IDS.length),
   consiliumScore:round(CASE_IDS.reduce((s,id)=>s+outputs[id].consilium,0)/CASE_IDS.length),
   pairedDelta:round(differences.reduce((a,b)=>a+b,0)/CASE_IDS.length),
   wins:differences.filter(x=>x>0).length,losses:differences.filter(x=>x<0).length,
   ties:differences.filter(x=>x===0).length,
   costUsd:round(usage.costUsd-beforeAll.costUsd),
   failedProviderCalls:usage.failedCalls-beforeAll.failedCalls,
   limitation:'Exploratory four public SCT cases, not full 174-item clinical reasoning leaderboard or CPC-Bench.'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(report,null,2));
 console.log('SCT_CONSILIUM_PAIR_SUMMARY '+JSON.stringify(report));
 expect(complete).toBe(8);
},5400000);
