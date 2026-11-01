import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {callDiagnosticAgent,getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
import {MODELS} from '../openrouter';

/** REAL authors' FHIR backend and multi-step new_patient_tasks task1.
 * The agent chooses whether to order CT after seeing actual EHR procedures;
 * reference solution never enters model input. All writes are to ephemeral Docker.
 */
const SOURCE='../medagentbench-source/medagentbench_v2/src/MedAgentBench/data/medagentbench/new_patient_tasks.json';
const IDS=['task1_1','task1_2'] as const;
const FHIR='http://127.0.0.1:8080/fhir';
const OUT='internal-results/medagentv2-ct-orders';
type Task={id:string;instruction:string;context:string;eval_MRN:string};
type Action={tool:'search_procedures'|'create_ct_order'|'finish';patientId?:string;codes?:string[];code?:string;note?:string;answer?:string};
const SYSTEM=[
'You are Doctor Opus, a clinical EHR agent for a PUBLIC MedAgentBench v2 task.',
'The real FHIR EHR tool calls are run against a disposable academic simulation, not a patient-care system.',
'Decide what to do from retrieved procedure dates. Do not invent dates or assume a procedure is recent.',
'Today is 2026-11-01; use a 365-day lookback for 12 months. Search before any order.',
'Use one valid JSON action per turn:',
'{"tool":"search_procedures","patientId":"S...","codes":["IMGCT0491","IMGIL0001"]}',
'{"tool":"create_ct_order","patientId":"S...","code":"74177","note":"Renal mass follow-up"}',
'{"tool":"finish","answer":"summary"}',
'Do not make an order when it is not indicated; do order when the latest eligible study is older than 12 months.',
'Use only source task information. Respond valid JSON ONLY.'
].join('\n');
function parse(s:string):Action|null {
 const m=s.match(/\{[\s\S]*\}/);if(!m)return null;
 try{
  const x=JSON.parse(m[0]) as Action;
  if(x.tool==='search_procedures'&&x.patientId&&Array.isArray(x.codes))return x;
  if(x.tool==='create_ct_order'&&x.patientId&&x.code==='74177'&&typeof x.note==='string')return x;
  if(x.tool==='finish')return x;
  return null;
 }catch{return null;}
}
async function tool(a:Action,task:Task):Promise<{result:unknown;posted?:any}> {
 if(a.patientId!==task.eval_MRN)throw Error('Wrong patient ID');
 if(a.tool==='search_procedures'){
  const query=new URLSearchParams({patient:a.patientId!,code:'IMGCT0491,IMGIL0001',_count:'5000',_format:'json'});
  const resp=await fetch(FHIR+'/Procedure?'+query,{signal:AbortSignal.timeout(25000)});
  if(!resp.ok)throw Error('FHIR Procedure failed HTTP '+resp.status);
  const bundle=await resp.json() as any;
  if(bundle.resourceType!=='Bundle')throw Error('Not FHIR Bundle');
  const procedures=(Array.isArray(bundle.entry)?bundle.entry:[]).slice(0,100).map((e:any)=>{
   const x=e.resource;
   return {code:x.code,performedDateTime:x.performedDateTime,performedPeriod:x.performedPeriod,
    lastUpdated:x.meta?.lastUpdated};
  });
  return {result:{resourceType:'Bundle',procedures}};
 }
 if(a.tool==='create_ct_order'){
  if(!/renal mass follow-up/i.test(a.note!))throw Error('Order lacks case indication');
  const now=new Date().toISOString();
  const payload={
   resourceType:'ServiceRequest',status:'active',intent:'order',priority:'routine',
   subject:{reference:'Patient/'+a.patientId},
   code:{coding:[{system:'http://www.ama-assn.org/go/cpt',code:'74177',
     display:'CT abdomen and pelvis with IV contrast'}]},
   authoredOn:now,occurrenceDateTime:now,
   note:[{text:a.note}]
  };
  const resp=await fetch(FHIR+'/ServiceRequest',{method:'POST',headers:{'Content-Type':'application/fhir+json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  if(!resp.ok)throw Error('FHIR ServiceRequest POST HTTP '+resp.status);
  const result=await resp.json();
  return {result:{resourceType:'ServiceRequest',accepted:!!result.id},posted:payload};
 }
 throw Error('Unknown action');
}
it('official v2 new 2026 multi-step CT follow-up action tasks with FHIR and author grading',async()=>{
 const cases=JSON.parse(readFileSync(SOURCE,'utf8')) as Task[];
 if(cases.length!==300)throw Error('Wrong official v2 case source');
 mkdirSync(OUT,{recursive:true});writeFileSync(OUT+'/answers.jsonl','');
 const starting=getDiagnosticApiUsageSnapshot();let attempted=0;
 for(const id of IDS){
  const task=cases.find(x=>x.id===id);
  if(!task)throw Error('No official case '+id);
  const history:Array<{role:string;content:string}>=[];
  const prior:string[]=[];let finished=false,errors=0,toolsUsed=0,posts=0;
  const start=Date.now(),before=getDiagnosticApiUsageSnapshot();
  for(let i=0;i<6;i++){
   const ans=await callDiagnosticAgent({model:MODELS.SONNET,maxTokens:550,reasoningEffort:'low',
    systemPrompt:SYSTEM,userContent:'TASK:\n'+task.instruction+'\nCONTEXT:\n'+task.context+
      '\nFHIR RESULTS:\n'+prior.slice(-4).join('\n')+'\nReturn next JSON action'});
   if(ans.error){errors++;break;}
   const action=parse(ans.content);
   if(!action){errors++;break;}
   if(action.tool==='finish'){finished=true;break;}
   try{
    const r=await tool(action,task);
    if(r.posted){
      posts++;history.push({role:'agent',content:'POST '+FHIR+'/ServiceRequest\n'+JSON.stringify(r.posted)});
      history.push({role:'agent',content:'POST request accepted'});
    }
    toolsUsed++;prior.push(JSON.stringify({action,result:r.result}));
   }catch{errors++;break;}
  }
  const after=getDiagnosticApiUsageSnapshot();
  const record={taskId:id,finished,errors,toolsUsed,posts,history,
   seconds:(Date.now()-start)/1000,costUsd:Number((after.costUsd-before.costUsd).toFixed(5)),
   authorDataset:'new_patient_tasks', model:MODELS.SONNET};
  appendFileSync(OUT+'/answers.jsonl',JSON.stringify(record)+'\n');
  console.log('MAST_MEDAGENT_V2_CT_CASE '+JSON.stringify({...record,history:undefined}));
  attempted++;
  if(after.costUsd-starting.costUsd>0.30 || after.unpricedCalls>starting.unpricedCalls)break;
 }
 const end=getDiagnosticApiUsageSnapshot();
 const summary={attempted,planned:IDS.length,billedUsd:Number((end.costUsd-starting.costUsd).toFixed(5)),
  scoring:'Author new_refsol.task1 grader in next step, without any answer leakage'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('MAST_MEDAGENT_V2_CT_SUMMARY '+JSON.stringify(summary));
 expect(attempted).toBeGreaterThan(0);
},900000);
