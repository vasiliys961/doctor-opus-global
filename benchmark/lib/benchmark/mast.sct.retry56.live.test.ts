import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {answerMastCase} from './mast';
import {buildOfficialSctPrompt} from './sct-internal-cases';
import {getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
const OUT='internal-results/sct-retry-56';
const ROOT='https://raw.githubusercontent.com/ARISENetwork/mast/57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee/benchmarks/sct/dataset/';
async function getRow(file:string,id:string):Promise<Record<string,unknown>>{
 const r=await fetch(ROOT+file,{signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Official dataset HTTP '+r.status);
 const row=(await r.text()).split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)).find(x=>x.id===id);
 if(!row)throw Error('Official case not found');
 return row;
}
it('retry only SCT #56 once with exactly the same model pipeline',async()=>{
 mkdirSync(OUT,{recursive:true});
 const item=await getRow('items.jsonl','56');
 const before=getDiagnosticApiUsageSnapshot();
 let found:{Rating:number;Rationale:string}|null=null;
 let error='';
 for(let attempt=1;attempt<=2;attempt++){
   try{
     const response=await answerMastCase(buildOfficialSctPrompt(item as {scenario:string;hypothesis:string;new_information:string}));
     if(!('Rating' in response))throw Error('Unexpected output type');
     found=response;
     break;
   }catch(e){error=e instanceof Error?e.message:'unknown error';}
 }
 const usage=getDiagnosticApiUsageSnapshot();
 const rubric=await getRow('rubrics.jsonl','56');
 const distribution=rubric.expert_distribution as number[];
 const score=found?distribution[found.Rating+2]/Math.max(...distribution):0;
 const output={id:'56',rating:found?.Rating??null,rationale:found?.Rationale??null,score,
   attempts:usage.pricedCalls-before.pricedCalls,
   billedUsd:Number((usage.costUsd-before.costUsd).toFixed(5)),
   error:found?null:error};
 writeFileSync(OUT+'/result.json',JSON.stringify(output,null,2));
 console.log('SCT_RETRY_56 '+JSON.stringify({...output,rationale:undefined}));
 expect(found).not.toBeNull();
},180000);
