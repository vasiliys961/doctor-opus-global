/**
 * Small open-structure PhysicianBench-LIKE simulation: public task styles
 * (HealthRex/PhysicianBench) with FICTIONAL chart fixtures.
 * This is NOT the original gated Stanford EHR and must not be scored as
 * official PhysicianBench. Intended to expose agent/tool/clinical note defects.
 */
import { callDiagnosticAgent } from '../diagnostics/llm-client';
import { MODELS } from '../openrouter';

type Section='demographics'|'medications'|'clinical_data';
type Event={tool:string;section?:string;ok:boolean};
type ToolAction={tool:'get_chart'|'write_management_note'|'finish';section?:Section;note?:string};
export type SyntheticPhysicianTask={
 id:string;sourceTask:string;question:string;
 chart:Record<Section,unknown>;
 expectedConcepts:Array<{name:string;test:RegExp}>;
};
export const PHYSICIAN_STYLE_CASES:SyntheticPhysicianTask[]=[
 {
  id:'diabetes-a1c-deintensification',
  sourceTask:'HealthRex/PhysicianBench/tasks/v1/diabetes_a1c_improvement/instruction.md',
  question:'A patient has dramatically improved HbA1c after previous hospitalization. Review available EHR data, assess possible overtreatment and hypoglycemia, and write a risk-conscious diabetes medication plan with monitoring.',
  chart:{
   demographics:{patientId:'fictional-pb-001',age:61,sex:'female',medicalHistory:['type 2 diabetes','CKD stage 3a']},
   medications:{active:[{drug:'glipizide',dose:'10 mg twice daily'},{drug:'insulin glargine',dose:'24 units nightly'},{drug:'metformin',dose:'500 mg twice daily'}]},
   clinical_data:{observations:[{code:'HbA1c',date:'2021-03-15',value:11.5,unit:'%'},{code:'HbA1c',date:'2022-01-07',value:5.2,unit:'%'},{code:'self-monitored glucose',value:'repeated 56–72 mg/dL, episodes of shakiness'}],encounter:'Clinically stable, outpatient review; no acute neurologic symptoms'}
  },
  expectedConcepts:[
   {name:'a1c-trend',test:/A1C|HbA1c|glycated hemoglobin/i},
   {name:'hypoglycemia-safety',test:/hypoglyc|low (blood )?glucose/i},
   {name:'sulfonylurea-review',test:/glipizide|sulfonylurea/i},
   {name:'insulin-review',test:/glargine|insulin/i},
   {name:'deintensification',test:/reduc|de.?intensif|discontinu|stop|adjust|taper/i},
   {name:'follow-up',test:/follow.?up|monitor|recheck|repeat.*A1C/i}
  ]
 },
 {
  id:'adrenal-replacement-redflags',
  sourceTask:'HealthRex/PhysicianBench/tasks/v1/adrenal_insufficiency_symptoms/instruction.md',
  question:'A patient with primary adrenal insufficiency reports worsening fatigue, BP instability and tachycardia on replacement therapy. Review the EHR, write a management and monitoring note, and address red flags and escalation.',
  chart:{
   demographics:{patientId:'fictional-pb-002',age:45,sex:'female',medicalHistory:['autoimmune primary adrenal insufficiency']},
   medications:{active:[{drug:'hydrocortisone',dose:'10 mg AM + 5 mg afternoon'},{drug:'fludrocortisone',dose:'0.1 mg every morning'}]},
   clinical_data:{observations:[{code:'blood pressure',value:'88/60 mmHg'},{code:'heart rate',value:'112/min'},{code:'sodium',value:130,unit:'mmol/L'},{code:'potassium',value:5.5,unit:'mmol/L'},{code:'plasma renin',value:'above reference'}],encounter:'Worsening nausea, fatigue, and reduced appetite with presyncope; no confirmed intercurrent infection'}
  },
  expectedConcepts:[
   {name:'existing-hydrocortisone',test:/hydrocortisone/i},
   {name:'mineralocorticoid',test:/fludrocortisone|mineralocorticoid/i},
   {name:'hemodynamic-risk',test:/hypotensi|low blood pressure|88\/60|presyncop/i},
   {name:'urgent-assessment',test:/emergenc|urgent|adrenal crisis|immediate/i},
   {name:'electrolyte-evidence',test:/sodium|potassium|hyponatr|hyperkal|electrolyte/i},
   {name:'monitor-follow-up',test:/follow.?up|monitor|reassess|recheck/i}
  ]
 }
];
const PROMPT=[
 'You are the PhysicianBench-style EHR agent for a FICTIONAL clinical chart.',
 'Make exactly one tool call per turn using JSON only (no Markdown, no extra text).',
 'Valid tools: {"tool":"get_chart","section":"demographics|medications|clinical_data"};',
 '{"tool":"write_management_note","note":"complete plain-English assessment and plan"};',
 '{"tool":"finish"}.',
 'You MUST retrieve each of the three chart sections before writing the note.',
 'Do not hallucinate results not in the chart. Note contradictory findings, uncertainty,',
 'severe safety risks, drug interactions, indications for urgent human physician review,',
 'and monitoring. Write a structured physician note based ONLY on retrieved facts.',
 'This sandbox never sends real prescriptions and no patient data is real.'
].join('\n');
export type PhysicianStyleResult={
 id:string;note:string;events:Event[];readSections:string[];completed:boolean;errors:string[];
 checklist:Array<{concept:string;met:boolean}>;
 passed:number;total:number;costUsd:number;steps:number;
};
function parseAction(text:string):ToolAction|null{
 const first=text.indexOf('{'),last=text.lastIndexOf('}');
 if(first<0||last<=first)return null;
 try{
  const a=JSON.parse(text.slice(first,last+1)) as ToolAction;
  if(!a||!['get_chart','write_management_note','finish'].includes(a.tool))return null;
  if(a.tool==='get_chart' && !['demographics','medications','clinical_data'].includes(String(a.section)))return null;
  if(a.tool==='write_management_note' && (typeof a.note!=='string'||a.note.length<100))return null;
  return a;
 }catch{return null;}
}
export async function runPhysicianStyleCase(task:SyntheticPhysicianTask):Promise<PhysicianStyleResult>{
 const read=new Set<Section>(),events:Event[]=[],errors:string[]=[];
 const history:string[]=[];let note='',done=false,cost=0,steps=0;
 for(let step=0;step<8;step++){
  // The previous pilot fetched all clinical facts correctly but the free-form
  // LLM tool schema broke while trying to wrap a long physician note in JSON.
  // When chart review is complete, generate the note as PLAIN TEXT through a
  // dedicated clinical writing step; the application performs the file write.
  // This is a deterministic workflow boundary, not a clinical correctness fix.
  if(read.size===3 && !note){
   const draft=await callDiagnosticAgent({
    model:MODELS.SONNET,maxTokens:2400,reasoningEffort:'low',
    systemPrompt:[
     'You are a physician drafting an assessment and plan from a FICTIONAL EHR.',
     'Write plain-text sections: Relevant chart evidence, Assessment, Medication or testing plan, Safety/red flags, Follow-up.',
     'Use ONLY the provided chart. Explicitly reconcile old vs recent findings.',
     'If urgently unstable, prioritize emergency evaluation and avoid unsafe routine outpatient dose changes.',
     'Explain why an intervention is needed or why it must be deferred to urgent clinician assessment.',
     'Do not output JSON or instructions to tools. No fabricated results or actual electronic prescriptions.'
    ].join('\\n'),
    userContent:'PUBLIC PHYSICIANBENCH-STYLE TASK: '+task.question+
      '\\nSYNTHETIC CHART AFTER COMPLETED TOOL READS:\\n'+JSON.stringify(task.chart)
   });
   steps++;cost+=draft.costUsd;
   if(draft.error || draft.content.trim().length<180){
    errors.push('clinical-note-generation-failed');break;
   }
   note=draft.content.trim();
   events.push({tool:'write_management_note',ok:true});
   done=true;
   break;
  }
  const call=await callDiagnosticAgent({
   model:MODELS.SONNET,maxTokens:400,reasoningEffort:'low',
   systemPrompt:PROMPT,
   userContent:'PUBLIC TASK STYLE (not original patient): '+task.sourceTask+
     '\nClinical instruction: '+task.question+'\nPrevious tool events:\n'+history.slice(-5).join('\n')+
     '\nYour next JSON tool call:'
  });
  steps++;cost+=call.costUsd;
  if(call.error){errors.push('provider-error');break;}
  const a=parseAction(call.content);
  if(!a){errors.push('invalid-tool-schema');break;}
  if(a.tool==='get_chart'){
   const section=a.section!;
   read.add(section);events.push({tool:a.tool,section,ok:true});
   history.push(JSON.stringify({action:a,result:task.chart[section]}));
   continue;
  }
  if(a.tool==='write_management_note'){
   if(read.size!==3){events.push({tool:a.tool,ok:false});errors.push('wrote-before-reading-chart');break;}
   note=a.note!;events.push({tool:a.tool,ok:true});
   history.push(JSON.stringify({action:{tool:a.tool},result:{saved:true,bytes:note.length}}));
   continue;
  }
  if(a.tool==='finish'){
   done=!!note;events.push({tool:a.tool,ok:done});
   if(!done)errors.push('finished-without-note');
   break;
  }
 }
 const checklist=task.expectedConcepts.map(x=>({concept:x.name,met:x.test.test(note)}));
 return {id:task.id,note,events,readSections:[...read],completed:done,errors,
  checklist,passed:checklist.filter(x=>x.met).length,total:checklist.length,costUsd:cost,steps};
}
