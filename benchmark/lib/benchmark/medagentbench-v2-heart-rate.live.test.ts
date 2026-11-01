import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {callDiagnosticAgent,getDiagnosticApiUsageSnapshot} from '../diagnostics/llm-client';
import {MODELS} from '../openrouter';

/** Author's NEW v2 multi-step tasks, real authors' FHIR backend.
 * Official Python grading in next workflow step, not heuristic task labels.
 */
const PATH='../medagentbench-source/medagentbench_v2/src/MedAgentBench/data/medagentbench/new_patient_tasks.json';
const IDS=['task3_1','task3_2'] as const;
const FHIR='http://127.0.0.1:8080/fhir';
const OUT='internal-results/medagentv2-advanced';
type Task={id:string;instruction:string;context:string;eval_MRN:string};
type Action={tool:'get_observations'|'finish';mrn?:string;code?:string;answer?:number[]};
const SYSTEM=[
'You are Doctor Opus as an EHR clinician agent, using the authentic MedAgentBench v2 FHIR server.',
'Choose one JSON tool action per response. Call get_observations first.',
'{"tool":"get_observations","mrn":"S...","code":"HEARTRATE"} fetches real patient Observations.',
'{"tool":"finish","answer":[mean_6h,mean_12h]} ends the task. Return numbers in bpm, -1 if none.',
'Calculate averages from effectiveDateTime within 6h and 12h of the timestamp in the task.',
'Do not use dates later than task NOW and do not invent measurements.',
'Respond ONLY valid JSON. Do not expose private data or judge reference.'
].join('\n');
function action(s:string):Action|null{
 const match=s.match(/\{[\s\S]*\}/);if(!match)return null;
 try{const r=JSON.parse(match[0]) as Action;
  if(r.tool==='get_observations'&&typeof r.mrn==='string'&&r.code==='HEARTRATE')return r;
  if(r.tool==='finish'&&Array.isArray(r.answer)&&r.answer.length===2&&r.answer.every(x=>typeof x==='number'))return r;
  return null;
 }catch{return null;}
}
function extractNow(s:string):string {
 const match=s.match(/\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d\+00:00/);
 if(!match)throw Error('No task-relative timestamp');return match[0];
}
async function observations(mrn:string,code:string,now:string){
 const q=new URLSearchParams({patient:mrn,code,_count:'5000',_format:'json'});
 const response=await fetch(FHIR+'/Observation?'+q,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('FHIR Observation HTTP '+response.status);
 const bundle=await response.json() as any;
 if(bundle.resourceType!=='Bundle')throw Error('Not a FHIR Bundle');
 const all=Array.isArray(bundle.entry)?bundle.entry:[];
 const nowMs=Date.parse(now);
 const relevant=all.map((e:any)=>e.resource).filter((x:any)=>{
  const t=Date.parse(x.effectiveDateTime||'');
  return Number.isFinite(t)&&t>=nowMs-12*3600e3 && t<=nowMs &&
    typeof x.valueQuantity?.value==='number' &&
    (!x.meta?.lastUpdated || Date.parse(x.meta.lastUpdated)<=Date.parse('2025-01-01T00:00:00Z'));
 }).map((o:any)=>({timestamp:o.effectiveDateTime,bpm:o.valueQuantity.value}));
 return {resourceType:'Bundle',observations:relevant,now,windowHours:[6,12]};
}
it('author v2 new patient tasks 3_1/3_2; actions against true FHIR server, official scorer offline',async()=>{
 const src=JSON.parse(readFileSync(PATH,'utf8')) as Task[];
 if(src.length!==300)throw Error('Wrong official new-task source');
 mkdirSync(OUT,{recursive:true});writeFileSync(OUT+'/answers.jsonl','');
 const usage=getDiagnosticApiUsageSnapshot();let completed=0;
 for(const id of IDS){
  const t=src.find(x=>x.id===id);
  if(!t)throw Error('Missing official task '+id);
  const now=extractNow(t.context);const prior:string[]=[];let final:number[]|null=null,errors=0;
  const start=Date.now(),before=getDiagnosticApiUsageSnapshot();let usedTools=0;
  for(let step=0;step<5;step++){
   const result=await callDiagnosticAgent({model:MODELS.SONNET,maxTokens:650,reasoningEffort:'low',
    systemPrompt:SYSTEM,userContent:'OFFICIAL TASK:\n'+t.instruction+'\nCONTEXT:\n'+t.context+
      '\nFHIR HISTORY:\n'+prior.slice(-2).join('\n')+'\nNext JSON action:'});
   if(result.error){errors++;break;}
   const a=action(result.content);
   if(!a){errors++;break;}
   if(a.tool==='finish'){final=a.answer!;break;}
   if(a.mrn!==t.eval_MRN){errors++;break;}
   try{
    const o=await observations(a.mrn!,a.code!,now);
    prior.push(JSON.stringify({action:a,result:o}));usedTools++;
   }catch{errors++;break;}
  }
  const after=getDiagnosticApiUsageSnapshot();
  const row={taskId:id,answer:final,errors,usedTools,seconds:(Date.now()-start)/1000,
    modelUsd:Number((after.costUsd-before.costUsd).toFixed(5)),
    noPostRequests:true,source:'official new_patient_tasks.json',model:MODELS.SONNET};
  appendFileSync(OUT+'/answers.jsonl',JSON.stringify(row)+'\n');
  console.log('MAST_MEDAGENT_V2_ADVANCED_CASE '+JSON.stringify(row));
  if(final)completed++;
  if(after.costUsd-usage.costUsd>0.25 || after.unpricedCalls>usage.unpricedCalls)break;
 }
 const after=getDiagnosticApiUsageSnapshot();
 const sum={planned:IDS.length,answered:completed,costUsd:Number((after.costUsd-usage.costUsd).toFixed(5)),
   grading:'next step: authors new_refsol.task3 and official FHIR backend'};
 writeFileSync(OUT+'/summary.json',JSON.stringify(sum,null,2));
 console.log('MAST_MEDAGENT_V2_ADVANCED_SUMMARY '+JSON.stringify(sum));
 expect(completed).toBeGreaterThan(0);
},900000);
