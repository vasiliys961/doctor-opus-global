// Contest-only bootstrap: evaluate two genuine PhysicianBench public instructions via full consilium in the already runnable EHR-style CI job.
import './physicianbench-two-public-consilium.live.test';
import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {runPhysicianStyleCase,PHYSICIAN_STYLE_CASES} from './physicianbench-simulated-ehr';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
const OUT='internal-results/physicianbench-style-open-two';
it('2 public PhysicianBench-style workflows with fictional clinical EHR and actual model tool calls',async()=>{
 mkdirSync(OUT,{recursive:true});writeFileSync(OUT+'/trajectories.jsonl','');
 const start=getDiagnosticApiUsageSnapshot();let completed=0;
 for(const task of PHYSICIAN_STYLE_CASES){
  const before=getDiagnosticApiUsageSnapshot();
  if(before.costUsd-start.costUsd>0.30 || before.unpricedCalls>start.unpricedCalls)break;
  const t0=Date.now();
  const r=await runPhysicianStyleCase(task);
  const record={...r,sourceTask:task.sourceTask,elapsedSeconds:(Date.now()-t0)/1000};
  appendFileSync(OUT+'/trajectories.jsonl',JSON.stringify(record)+'\n');
  console.log('MAST_PHYSICIAN_STYLE_CASE '+JSON.stringify({...record,note:'[saved in artifact]'}));
  if(r.completed)completed++;
 }
 const end=getDiagnosticApiUsageSnapshot();
 const summary={planned:2,attempted:PHYSICIAN_STYLE_CASES.length,completed,
  costUsd:Number((end.costUsd-start.costUsd).toFixed(5)),
  providerFailures:end.failedCalls-start.failedCalls,
  unpricedCalls:end.unpricedCalls-start.unpricedCalls,
  caveat:'FICTIONAL EHR. Public PhysicianBench task styles, no official patient data or checkpoints. Not a PhysicianBench score.'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('MAST_PHYSICIAN_STYLE_SUMMARY '+JSON.stringify(summary));
 expect(completed).toBeGreaterThan(0);
},900000);
