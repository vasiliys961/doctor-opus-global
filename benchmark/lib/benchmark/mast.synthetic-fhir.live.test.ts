import { it,expect } from 'vitest';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {SANDBOX_TASKS,runSyntheticFhirTask} from './synthetic-fhir-agent';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
const OUT='internal-results/agentic-synthetic-fhir';
const MAX_USD=0.35;
it('two real tool-loop actions against disposable FHIR-like synthetic EHR',async()=>{
  mkdirSync(OUT,{recursive:true});
  writeFileSync(OUT+'/trajectories.jsonl','');
  const initial=getDiagnosticApiUsageSnapshot();
  let attempted=0,passed=0,stopped:string|null=null;
  for(const task of SANDBOX_TASKS){
    const usage=getDiagnosticApiUsageSnapshot();
    if(usage.costUsd-initial.costUsd>MAX_USD*0.7||usage.unpricedCalls>initial.unpricedCalls){
      stopped='budget/price guard';break;
    }
    const started=Date.now();
    const result=await runSyntheticFhirTask(task);
    attempted++;
    if(result.passed)passed++;
    const row={...result,elapsedSeconds:Math.round((Date.now()-started)/10)/100};
    appendFileSync(OUT+'/trajectories.jsonl',JSON.stringify(row)+'\n');
    console.log('MAST_FHIR_CASE '+JSON.stringify({...row,toolSequence:undefined}));
  }
  const used=getDiagnosticApiUsageSnapshot();
  const summary={planned:SANDBOX_TASKS.length,attempted,passed,
    billedUsd:Math.round((used.costUsd-initial.costUsd)*100000)/100000,
    unpricedCalls:used.unpricedCalls-initial.unpricedCalls,stopped,
    disclaimer:'Synthetic FHIR-like tool-loop only: NOT official MedAgentBench or PhysicianBench.'};
  writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
  console.log('MAST_FHIR_SUMMARY '+JSON.stringify(summary));
  expect(attempted).toBeGreaterThan(0);
},900000);
