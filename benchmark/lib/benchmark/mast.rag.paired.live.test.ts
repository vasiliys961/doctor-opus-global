import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {answerMastCase} from './mast';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

/**
 * Paired evaluation of the WHOLE Doctor Opus consilium with/without FDA RAG.
 * Four fixed distinct public, untested NOHARM perturbation families; k=1.
 * FDA corpus contains no MAST prompts, answers, rubrics or grader feedback.
 * Neither arm receives the other's answers. Alternating arm order mitigates
 * transient provider effects. Clinical scoring is a separate blind judge job.
 */
const SOURCE='https://raw.githubusercontent.com/ARISENetwork/mast/57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee/benchmarks/donoharm/dataset/items.jsonl';
const BASE_IDS=['Endo009','GI002','GI004','Heme010'] as const;
const OUT='internal-results/noharm-rag-paired';
const CAP_USD=4.00;
type Case={id:string;prompt:string;metadata:{base_id:string;perturb_id:number|null;open:boolean}};
const round=(x:number)=>Number(x.toFixed(5));

it('paired full consilium on predeclared new NOHARM medication perturbations',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/answers-control.jsonl','');
  writeFileSync(OUT+'/answers-rag.jsonl','');
  writeFileSync(OUT+'/ledger.jsonl','');
  const response=await fetch(SOURCE,{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error('Pinned public benchmark unavailable: '+response.status);
  const cases=(await response.text()).split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s) as Case);
  // Predeclared algorithm selects the lexicographically first untested variant
  // explicitly containing an FDA-indexed generic from each distinct family.
  const drug=/\b(warfarin|apixaban|amiodarone|isotretinoin|spironolactone|metformin)\b/i;
  const planned=BASE_IDS.map(base=>{
    const candidates=cases.filter(x=>x.metadata?.base_id===base&&x.metadata.perturb_id!==null&&x.metadata.open&&drug.test(x.prompt))
      .sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
    if(!candidates.length)throw Error('Missing untested public medication-perturbed case family '+base);
    return candidates[0];
  });
  const study={mode:'full-consilium-paired-v2-without-versus-with-licensed-fda-rag',
    publicDatasetCommit:'57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee',
    cases:planned.map(c=>({id:c.id,baseId:c.metadata.base_id,perturbId:c.metadata.perturb_id})),
    evaluationProtocol:'same clinical task, alternating arm order; independent OpenRouter Gemini NOHARM scorer post hoc; NOT a leaderboard submission',
    ragIndexPath:process.env.RAG_INDEX_PATH||'',maxNewApiCostUsd:CAP_USD};
  writeFileSync(OUT+'/preregistration.json',JSON.stringify(study,null,2));
  if(!process.env.OPENROUTER_API_KEY)throw Error('OpenRouter API key missing');
  const indexPath=process.env.RAG_INDEX_PATH;
  if(!indexPath)throw Error('RAG_INDEX_PATH required');
  let successfulPairs=0;
  let errorCount=0;
  const t0=Date.now();
  for(const [i,clinicalCase] of planned.entries()){
    const order=(i%2===0?['control','rag']:['rag','control']) as Array<'control'|'rag'>;
    let pairOkay=true;
    for(const arm of order){
      const before=getDiagnosticApiUsageSnapshot();
      if(before.costUsd>=CAP_USD*0.85)throw Error('Predeclared $4 soft spending cap reached before next patient case');
      const start=Date.now();
      try{
        if(arm==='rag')process.env.MAST_RAG_INDEX_PATH=indexPath;
        else delete process.env.MAST_RAG_INDEX_PATH;
        const answer=await answerMastCase(clinicalCase.prompt);
        if(!('response' in answer)||answer.response.trim().length<100)throw Error('Incomplete management plan');
        const after=getDiagnosticApiUsageSnapshot();
        const cost=round(after.costUsd-before.costUsd);
        if(after.unpricedCalls>before.unpricedCalls)throw Error('Unpriced provider call: actual spend unknown');
        const out={id:clinicalCase.id,trial:1,response:answer.response,
          usage:{cost,prompt_tokens:after.promptTokens-before.promptTokens,completion_tokens:after.completionTokens-before.completionTokens}};
        appendFileSync(OUT+'/answers-'+arm+'.jsonl',JSON.stringify(out)+'\n');
        const ledger={id:clinicalCase.id,arm,status:'complete',costUsd:cost,
          failedProviderCalls:after.failedCalls-before.failedCalls,
          pricedCalls:after.pricedCalls-before.pricedCalls,
          seconds:round((Date.now()-start)/1000)};
        appendFileSync(OUT+'/ledger.jsonl',JSON.stringify(ledger)+'\n');
        console.log('MAST_RAG_PAIR_CASE '+JSON.stringify(ledger));
      }catch(err){
        pairOkay=false;
        errorCount++;
        const ledger={id:clinicalCase.id,arm,status:'failed',
          reason:err instanceof Error?err.message.slice(0,400):'unknown',
          seconds:round((Date.now()-start)/1000)};
        appendFileSync(OUT+'/ledger.jsonl',JSON.stringify(ledger)+'\n');
        console.log('MAST_RAG_PAIR_ERROR '+JSON.stringify(ledger));
        if(errorCount>=2)throw Error('Paired test aborted after two errors');
      }finally{delete process.env.MAST_RAG_INDEX_PATH}
    }
    if(pairOkay)successfulPairs++;
    if(getDiagnosticApiUsageSnapshot().costUsd>=CAP_USD)throw Error('Paired test stopped at soft $4 cost cap');
  }
  const usage=getDiagnosticApiUsageSnapshot();
  const summary={successfulPairs,plannedPairs:planned.length,errorCount,totalCostUsd:round(usage.costUsd),
    failedProviderCalls:usage.failedCalls,unpricedCalls:usage.unpricedCalls,
    elapsedSeconds:round((Date.now()-t0)/1000),cohort:study.cases};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('MAST_RAG_PAIR_SUMMARY '+JSON.stringify(summary));
  expect(successfulPairs).toBe(4);
  expect(errorCount).toBe(0);
},5400000);
