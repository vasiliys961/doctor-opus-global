import { it, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { callDiagnosticAgent, getDiagnosticApiUsageSnapshot } from '../diagnostics/llm-client';
import { MODELS } from '../openrouter';

/**
 * True official MedAgentBench v2 PUBLIC tasks + authors' FHIR EHR Docker backend.
 * A 2-task READ-ONLY smoke of the contest's clinical tool-action adapter.
 * Not an official MedAgentBench v2 full score.
 * No task answer/reference or grader instructions go to the agent.
 */
const TEST_SOURCE='../medagentbench-source/medagentbench_v2/src/MedAgentBench/data/medagentbench/test_data_v2.json';
const FHIR='http://127.0.0.1:8080/fhir';
const SELECTED=['task1_1','task2_1'] as const;
const OUT='internal-results/medagentbench-v2-real-fhir';
type Task={id:string;instruction:string;context:string;sol?:string[];eval_MRN?:string};
type Action={
  tool:'find_patient'|'get_patient'|'finish';
  given?:string; family?:string; birthdate?:string; mrn?:string; answer?:string;
};
const SYS=[
'You are Doctor Opus, an EHR clinical agent executing a PUBLIC MedAgentBench v2 task on a synthetic FHIR server.',
'You must use actual FHIR tools, not memorized patient records or guesses.',
'One structured JSON action PER TURN. Allowed actions:',
'{"tool":"find_patient","given":"...","family":"...","birthdate":"YYYY-MM-DD"} to search a patient',
'{"tool":"get_patient","mrn":"..."} to fetch a patient by MRN',
'{"tool":"finish","answer":"..."} to answer from TOOL RESULT ONLY.',
'If search is empty, answer Patient not found. For age compute completed years at timestamp in task context.',
'Never invent patient details, demographics or outputs. Respond valid JSON ONLY.',
].join('\n');
function parseAction(s:string):Action|null {
 const m=s.match(/\{[\s\S]*\}/);if(!m)return null;
 try {
  const x=JSON.parse(m[0]) as Action;
  if(!['find_patient','get_patient','finish'].includes(x.tool))return null;
  if(x.tool==='find_patient'&&(!x.given||!x.family||!x.birthdate))return null;
  if(x.tool==='get_patient'&&!x.mrn)return null;
  if(x.tool==='finish'&&typeof x.answer!=='string')return null;
  return x;
 }catch{return null;}
}
function stripPatient(patient:any):Record<string,unknown> {
 return {
  resourceType:'Patient',
  id:patient.id,
  identifier:Array.isArray(patient.identifier) ? patient.identifier.map((i:any)=>({system:i.system,value:i.value})) : [],
  birthDate:patient.birthDate||null,
  name:Array.isArray(patient.name) ? patient.name.map((n:any)=>({family:n.family,given:n.given})) : []
 };
}
async function doFhir(a:Action):Promise<unknown> {
 const q=new URLSearchParams();
 if(a.tool==='find_patient'){
  q.set('given',a.given!);q.set('family',a.family!);q.set('birthdate',a.birthdate!);
 }
 if(a.tool==='get_patient'){
  q.set('_id',a.mrn!);
 }
 const u=FHIR+'/Patient?'+q.toString();
 const resp=await fetch(u,{signal:AbortSignal.timeout(13000)});
 if(!resp.ok)throw Error('FHIR Patient API HTTP '+resp.status);
 const body=await resp.json() as any;
 if(body.resourceType!=='Bundle') throw Error('Expected FHIR Bundle');
 const entries=Array.isArray(body.entry)?body.entry.slice(0,5):[];
 return {resourceType:'Bundle',total:body.total ?? entries.length,
   patients:entries.map((e:any)=>stripPatient(e.resource))};
}
function ageAt(dateOfBirth:string,dateOfTest:string):number {
 const y=new Date(dateOfTest),birth=new Date(dateOfBirth);
 let years=y.getUTCFullYear()-birth.getUTCFullYear();
 const bMonth=birth.getUTCMonth(),bDay=birth.getUTCDate();
 if(y.getUTCMonth()<bMonth || (y.getUTCMonth()===bMonth&&y.getUTCDate()<bDay))years--;
 return years;
}
it('official v2 tasks 1_1 and 2_1: REAL FHIR patient reads through clinical LLM tool loop',async()=>{
 mkdirSync(OUT,{recursive:true});
 writeFileSync(OUT+'/answers.jsonl','');
 const source=JSON.parse(readFileSync(TEST_SOURCE,'utf8')) as Task[];
 if(source.length!==300)throw Error('Official v2 task count mismatch; refusing inference');
 const begin=getDiagnosticApiUsageSnapshot();const results=[];
 for(const id of SELECTED){
  const t=source.find(x=>x.id===id);
  if(!t)throw Error('Missing official task '+id);
  const calls:Array<{tool:string;success:boolean}>=[];
  const messages:string[]=[];let answer='',errors=0,firstResult:any=null;
  const started=Date.now(),before=getDiagnosticApiUsageSnapshot();
  for(let step=0;step<5;step++){
   const c=await callDiagnosticAgent({
    systemPrompt:SYS,
    userContent:'OFFICIAL TASK:\n'+t.instruction+'\nCONTEXT:\n'+t.context+
      '\nPREVIOUS FHIR RESULTS:\n'+messages.slice(-3).join('\n')+
      '\nReturn one JSON action:',
    model:MODELS.SONNET,maxTokens:480,reasoningEffort:'low'
   });
   if(c.error){errors++;break;}
   const a=parseAction(c.content);
   if(!a){errors++;break;}
   if(a.tool==='finish'){answer=a.answer!.trim();break;}
   try{
    const data=await doFhir(a);
    if(!firstResult)firstResult=data;
    calls.push({tool:a.tool,success:true});
    messages.push(JSON.stringify({action:a,toolResult:data}));
   }catch(e){errors++;calls.push({tool:a.tool,success:false});break;}
  }
  // Reference stays outside model context; this task's official exact-match label.
  let expected:string|null=null;
  if(id==='task1_1')expected=t.sol?.[0]||null;
  if(id==='task2_1'){
    const patient=firstResult?.patients?.[0];
    if(patient?.birthDate && patient?.id===t.eval_MRN)
      expected=String(ageAt(patient.birthDate,'2023-11-13T10:15:00+00:00'));
  }
  const scored=expected!==null && answer===expected;
  const after=getDiagnosticApiUsageSnapshot();
  const row={taskId:id,answer,expected,passed:scored,officialSource:true,referenceHiddenFromAgent:true,
    tools:calls,model:MODELS.SONNET,modelErrors:errors,
    seconds:Math.round((Date.now()-started)/10)/100,
    modelUsd:Math.round((after.costUsd-before.costUsd)*100000)/100000};
  appendFileSync(OUT+'/answers.jsonl',JSON.stringify(row)+'\n');
  console.log('MAST_MEDAGENT_V2_CASE '+JSON.stringify({...row,answer:'[masked]',expected:'[masked]'}));
  results.push(row);
  if(after.costUsd-begin.costUsd>0.20 || after.unpricedCalls>begin.unpricedCalls)break;
 }
 const after=getDiagnosticApiUsageSnapshot();
 const summary={planned:2,attempted:results.length,passed:results.filter(x=>x.passed).length,
  meanSeconds:results.length?results.reduce((a,b)=>a+b.seconds,0)/results.length:null,
  costUsd:Math.round((after.costUsd-begin.costUsd)*100000)/100000,
  unpricedCalls:after.unpricedCalls-begin.unpricedCalls,
  caveat:'Official v2 public tasks and official FHIR backend, but custom two-task agent adapter/scoring; not official full benchmark'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('MAST_MEDAGENT_V2_SUMMARY '+JSON.stringify(summary));
 expect(results.length).toBeGreaterThan(0);
},900000);
