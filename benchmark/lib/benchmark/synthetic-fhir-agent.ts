/**
 * Research-only tool-enabled clinical agent for a disposable synthetic FHIR-like
 * memory sandbox. NOT MedAgentBench/PhysicianBench, not an actual hospital EHR.
 * Deliberately no network I/O, persistent patient data, or production imports.
 */
import { callDiagnosticAgent } from '../diagnostics/llm-client';
import { MODELS } from '../openrouter';

type Obs={code:string;value:number;unit:string;effectiveDateTime:string};
export type Task={
  id:string;patientId:string;instruction:string;observations:Obs[];
  expectedCodes:string[];expectedUrgency?:'urgent';
};
type Action={tool:'get_observations'|'create_service_request'|'escalate_urgency'|'finish';code?:string;reason?:string};
export type FhirRun={
  taskId:string;requests:string[];urgency:string[];steps:number;
  passed:boolean;reason:string;costUsd:number;failedCalls:number;
  toolSequence:Array<{tool:string;code?:string;ok:boolean}>;
};
const TASKS:Task[]=[
  {id:'hyponatremia-workup',patientId:'synthetic-001',
   instruction:'Review the patient laboratory results and enter appropriate initial diagnostic tests to classify newly identified hyponatremia. Adult, clinically stable, no seizures.',
   observations:[{code:'serum-sodium',value:124,unit:'mmol/L',effectiveDateTime:'2026-10-31T10:00:00Z'},
     {code:'serum-potassium',value:4.3,unit:'mmol/L',effectiveDateTime:'2026-10-31T10:00:00Z'}],
   expectedCodes:['serum-osmolality','urine-osmolality','urine-sodium']},
  {id:'hyperkalemia-urgent',patientId:'synthetic-002',
   instruction:'Review the new laboratory results and arrange immediate appropriate bedside evaluation of this potentially dangerous electrolyte abnormality; explicitly flag urgency.',
   observations:[{code:'serum-potassium',value:6.5,unit:'mmol/L',effectiveDateTime:'2026-10-31T10:00:00Z'},
     {code:'serum-creatinine',value:2.6,unit:'mg/dL',effectiveDateTime:'2026-10-31T10:00:00Z'}],
   expectedCodes:['12-lead-ecg','repeat-serum-potassium'],expectedUrgency:'urgent'}
];
export const SANDBOX_TASKS=TASKS;
const allowedCodes=new Set(['serum-osmolality','urine-osmolality','urine-sodium','12-lead-ecg',
  'repeat-serum-potassium','tsh','serum-cortisol']);
const SYS=[
'You are a clinical EHR agent in a disposable synthetic FHIR-like test. No real patient care.',
'Use EXACTLY one JSON action per turn, with keys "tool", optional "code", optional "reason".',
'Valid tools: get_observations (read first); create_service_request (draft diagnostic order);',
'escalate_urgency (flag urgent clinical risk); finish (end when done).',
'Allowed order codes: serum-osmolality, urine-osmolality, urine-sodium, 12-lead-ecg,',
'repeat-serum-potassium, tsh, serum-cortisol.',
'Do not fabricate laboratory values. Choose tests based on data actually read.',
'This is a diagnostic-action task, not permission to prescribe or independently treat.',
'Respond ONLY with one valid JSON object. No markdown.'
].join('\n');

function parseAction(s:string):Action|null{
  const m=s.match(/\{[\s\S]*\}/);if(!m)return null;
  try{
    const v=JSON.parse(m[0]) as Action;
    if(!['get_observations','create_service_request','escalate_urgency','finish'].includes(v.tool))return null;
    if(v.tool==='create_service_request' && (!v.code||!allowedCodes.has(v.code)))return null;
    return v;
  }catch{return null;}
}
export function runSyntheticFhirTool(state:{read:boolean;orders:string[];flags:string[]},action:Action,task:Task) {
  if(action.tool==='get_observations'){
    state.read=true;
    return {ok:true,response:{resourceType:'Bundle',type:'searchset',entry:task.observations.map(o=>({
      resource:{resourceType:'Observation',status:'final',subject:{reference:'Patient/'+task.patientId},
        code:{text:o.code},valueQuantity:{value:o.value,unit:o.unit},effectiveDateTime:o.effectiveDateTime}
    }))}};
  }
  if(!state.read)return {ok:false,response:{error:'Must read observations before performing actions'}};
  if(action.tool==='create_service_request'){
    const code=action.code!;
    if(!state.orders.includes(code))state.orders.push(code);
    return{ok:true,response:{resourceType:'ServiceRequest',status:'draft',subject:{reference:'Patient/'+task.patientId},
      code:{text:code},id:'synthetic-draft-'+state.orders.length}};
  }
  if(action.tool==='escalate_urgency'){
    state.flags.push('urgent');
    return{ok:true,response:{resourceType:'Flag',status:'active',code:{text:'urgent-clinician-review'}}};
  }
  return {ok:true,response:{done:true}};
}
export async function runSyntheticFhirTask(task:Task,maxSteps=9):Promise<FhirRun>{
  const state={read:false,orders:[] as string[],flags:[] as string[]};
  const log:Array<{tool:string;code?:string;ok:boolean}>=[];
  const context:string[]=[];
  let costUsd=0,failedCalls=0,reason='step-limit';
  for(let step=0;step<maxSteps;step++){
    const call=await callDiagnosticAgent({systemPrompt:SYS,model:MODELS.GEMINI_3_FLASH,maxTokens:450,
      userContent:'Patient id: '+task.patientId+'\nTask: '+task.instruction+'\nPrevious tool history:\n'+
        context.slice(-6).join('\n')+'\nWhat is your next tool call? Return one JSON action only.'});
    costUsd+=call.costUsd;
    if(call.error){failedCalls++;reason='provider-error';break;}
    const action=parseAction(call.content);
    if(!action){failedCalls++;reason='invalid-action-json';break;}
    if(action.tool==='finish'){reason='finished';break;}
    const output=runSyntheticFhirTool(state,action,task);
    log.push({tool:action.tool,code:action.code,ok:output.ok});
    context.push(JSON.stringify({action,response:output.response}));
    if(!output.ok){reason='tool-error';break;}
  }
  const passed=task.expectedCodes.every(code=>state.orders.includes(code)) &&
    (!task.expectedUrgency || state.flags.includes(task.expectedUrgency)) &&
    state.read;
  return{taskId:task.id,requests:state.orders,urgency:state.flags,steps:log.length,
    passed,reason,costUsd,failedCalls,toolSequence:log};
}
