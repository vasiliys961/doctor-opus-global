import { it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { answerMastCase } from './mast';
import { getDiagnosticApiFailureSummary, getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';

type SyntheticCase = {case_id:number;initial_presentation:string;final_diagnosis:string;case_title:string};
const OUT='internal-results/cpc-roundcap-pilot';
const DATA_DIR='../sdbench-source/data/processed_case_data/synthetic';
const LIMIT_USD=1.25; // measured-cost guard between complete cases, not provider hard cap
const ROUND=(n:number)=>Number(n.toFixed(5));

function deltaErrors(before:Record<string,number>,after:Record<string,number>):Record<string,number>{
  const out:Record<string,number>={};
  for(const [key,value] of Object.entries(after)){
    const delta=value-(before[key]||0);
    if(delta>0)out[key]=delta;
  }
  return out;
}
function publicSyntheticCases():SyntheticCase[]{
  if(!existsSync(DATA_DIR))throw Error('Synthetic SDBench data missing; abort before inference');
  const paths=readdirSync(DATA_DIR).filter(f=>/^case_.*\.json$/.test(f)).sort();
  if(paths.length<4)throw Error('Need at least four synthetic cases');
  const chosen=(process.env.MAST_CPC_CASE_IDS||'0,2').split(',').map(x=>Number(x.trim()));
  if(chosen.length<1 || chosen.length>2 || chosen.some(id=>!Number.isInteger(id)||id<0||id>=paths.length) || new Set(chosen).size!==chosen.length)
    throw Error('Invalid preregistered case selection');
  return chosen.map(index=>JSON.parse(readFileSync(join(DATA_DIR,paths[index]),'utf8')) as SyntheticCase);
}

it('contest-only 1-round full-consilium CPC-like A/B: 2 original synthetic open cases',async()=>{
  if(process.env.MAST_CONSILIUM_ROUND_CAP!=='1')throw Error('Round-cap pilot requires explicit env opt-in');
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/answers.jsonl','');
  const cases=publicSyntheticCases();
  const sourceSha=execFileSync('git',['-C','../sdbench-source','rev-parse','HEAD'],{encoding:'utf8'}).trim();
  writeFileSync(OUT+'/preregistration.json',JSON.stringify({
    mode:'one debate round; original full consilium and management synthesis unchanged',
    baseline:'Original 2-round workflow 41287641769',caseIds:cases.map(x=>x.case_id),
    sourceRepo:'microsoft/sdbench',sourceSha,budgetGuardUsd:LIMIT_USD,
    note:'Public synthetic CPC-like tasks; not official NEJM CPC-Bench.'
  },null,2));
  const beginning=getDiagnosticApiUsageSnapshot();
  let completed=0,stopReason:string|null=null;
  for(const item of cases){
    const before=getDiagnosticApiUsageSnapshot();
    const beforeErrors=getDiagnosticApiFailureSummary();
    if(before.costUsd-beginning.costUsd>LIMIT_USD*0.68 || before.unpricedCalls>beginning.unpricedCalls){
      stopReason='Budget or price tracking guard';break;
    }
    if(!item.initial_presentation || item.initial_presentation.length<500)throw Error('Initial presentation missing');
    const prompt='Synthetic clinical reasoning pilot, NOT official CPC-Bench. From the INITIAL PRESENTATION ONLY, provide leading diagnosis and two alternatives, supporting and conflicting evidence, discriminative next tests and uncertainty. Do not invent facts.\n\nINITIAL PRESENTATION:\n'+item.initial_presentation;
    const started=Date.now();
    try{
      const answer=await answerMastCase(prompt);
      if(!('response' in answer) || answer.response.length<80)throw Error('Empty or malformed diagnostic response');
      const after=getDiagnosticApiUsageSnapshot();
      const record={
        caseId:item.case_id,sourceSha,roundCap:1,rawInputLength:item.initial_presentation.length,
        response:answer.response,referenceDiagnosisForOfflineReview:item.final_diagnosis,
        elapsedSeconds:ROUND((Date.now()-started)/1000),
        costUsd:ROUND(after.costUsd-before.costUsd),
        failedProviderCalls:after.failedCalls-before.failedCalls,
        failureKinds:deltaErrors(beforeErrors,getDiagnosticApiFailureSummary()),
        pricedCalls:after.pricedCalls-before.pricedCalls,
        unpricedCalls:after.unpricedCalls-before.unpricedCalls
      };
      appendFileSync(OUT+'/answers.jsonl',JSON.stringify(record)+'\n');
      console.log('CPC_ROUNDCAP_CASE '+JSON.stringify({...record,response:undefined,referenceDiagnosisForOfflineReview:undefined}));
      completed++;
      if(record.unpricedCalls>0){stopReason='Unpriced call';break;}
      if(after.costUsd-beginning.costUsd>=LIMIT_USD){stopReason='Reached spending threshold';break;}
    }catch(error){
      stopReason='Provider or format error';
      console.log('CPC_ROUNDCAP_CASE_FAILURE '+JSON.stringify({caseId:item.case_id,stopReason}));
      break;
    }
  }
  const all=getDiagnosticApiUsageSnapshot();
  const summary={
    completed,planned:cases.length,measuredCostUsd:ROUND(all.costUsd-beginning.costUsd),
    failedCalls:all.failedCalls-beginning.failedCalls,
    failureKinds:getDiagnosticApiFailureSummary(),
    unpricedCalls:all.unpricedCalls-beginning.unpricedCalls,stopReason,
    disclaimer:'Synthetic clinical cases, physician review required; not official CPC score; no guaranteed hard spending cap.'
  };
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('CPC_ROUNDCAP_SUMMARY '+JSON.stringify(summary));
  expect(completed).toBe(cases.length);
},1800000);
