import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {answerMastCase} from './mast';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';

/**
 * Actual published PhysicianBench TASK INSTRUCTIONS (not invented cases);
 * FHIR patient records are NOT available to this phase. Tests whether the
 * whole Doctor Opus consilium responsibly handles incomplete EHR information.
 * This does NOT submit orders or count as a PhysicianBench pass@1 score.
 */
const REV='c7efa8fd5b1e4744ada50668efe4b7e84023cbb0';
const TASKS=[
 {id:'urinary_retention_workup',domain:'urology',expected:['hematuria','catheter','renal','urine','follow']},
 {id:'aortic_aneurysm_cad',domain:'cardiology',expected:['aort','coronary','echo','calcium','medication']}
] as const;
const OUT='internal-results/physicianbench-style-open-two/physicianbench-public-two-consilium';
const MAX_COST_USD=3.0;

it('whole Doctor Opus handles two new official public PhysicianBench tasks with missing FHIR',async()=>{
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/answers.jsonl','');
 const start=getDiagnosticApiUsageSnapshot();
 let completed=0;
 const cases=[];
 for(const task of TASKS){
   const before=getDiagnosticApiUsageSnapshot();
   if(before.costUsd-start.costUsd>MAX_COST_USD*0.75)throw Error('Model spend guard');
   const url='https://raw.githubusercontent.com/HealthRex/PhysicianBench/'+REV+
     '/tasks/v1/'+task.id+'/instruction.md';
   const source=await fetch(url,{signal:AbortSignal.timeout(30000)});
   if(!source.ok)throw Error('Public source fetch failed HTTP '+source.status);
   const raw=await source.text();
   if(raw.length<300||raw.length>14000)throw Error('Unexpected public task length');
   // Public source has a pseudo-MRN and doctor staff identifier: strip anyway.
   const instruction=raw.replace(/MRN\d+/g,'[MRN_REMOVED]')
      .replace(/dr-[a-z]+-[a-z]+/gi,'[CLINICIAN_REMOVED]');
   const query=[
      'PUBLIC PHYSICIANBENCH BENCHMARK INSTRUCTION — RESEARCH CHECK ONLY.',
      'You have NOT been given access to the FHIR environment or the original patient record.',
      'Answer the task with the full clinical consilium. Separate available facts from',
      'information you would have to retrieve. Identify missing clinical data and a',
      'conditional workup, avoiding fabricated lab values, imaging, patient age,',
      'orders, dose changes or claims that a FHIR resource was created.',
      'Do NOT claim to complete the official benchmark or modify any EHR.',
      instruction
   ].join('\n');
   const t0=Date.now();
   const response=await answerMastCase(query);
   if(!('response' in response))throw Error('Full consilium did not return clinical response');
   const after=getDiagnosticApiUsageSnapshot();
   if(after.unpricedCalls>before.unpricedCalls)throw Error('Unpriced provider calls');
   const body=response.response;
   if(body.length<250)throw Error('Unexpectedly brief response');
   const lower=body.toLowerCase();
   const checks=task.expected.map(term=>({concept:term,present:lower.includes(term)}));
   const row={
      taskId:task.id,domain:task.domain,sourceCommit:REV,
      noPatientEhr:true,officialScore:null,fullConsilium:true,
      mentions:checks,coverageCount:checks.filter(c=>c.present).length,
      seconds:Number(((Date.now()-t0)/1000).toFixed(2)),
      costUsd:Number((after.costUsd-before.costUsd).toFixed(5)),
      failedProviderCalls:after.failedCalls-before.failedCalls,
      response:body,
   };
   cases.push({...row,response:undefined});
   appendFileSync(OUT+'/answers.jsonl',JSON.stringify(row)+'\n');
   completed++;
   console.log('PHYSICIANBENCH_PUBLIC_TASK '+JSON.stringify({
     taskId:row.taskId,coverageCount:row.coverageCount,
     elapsedSeconds:row.seconds,costUsd:row.costUsd,
     failedProviderCalls:row.failedProviderCalls,officialScore:null
   }));
 }
 const after=getDiagnosticApiUsageSnapshot();
 const summary={
    planned:TASKS.length,completed,cases,
    totalCostUsd:Number((after.costUsd-start.costUsd).toFixed(5)),
    failedProviderCalls:after.failedCalls-start.failedCalls,
    unpricedCalls:after.unpricedCalls-start.unpricedCalls,
    evaluation:'Public instruction completeness only; requires real Redivis FHIR Docker and author graders for official pass@1',
 };
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('PHYSICIANBENCH_TWO_PUBLIC_CONSILIUM_SUMMARY '+JSON.stringify({
     completed,costUsd:summary.totalCostUsd,providerFailures:summary.failedProviderCalls,
     officialBenchmarkScore:null
 }));
 expect(completed).toBe(2);
},1200000);
