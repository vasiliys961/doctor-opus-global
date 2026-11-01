import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explicitlyNamedMedications,parseIndex,renderEvidence,medicationEvidence} from './retrieve.mjs';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MODEL_ID,EMBEDDING_DIM} from './indexer.mjs';

const v=(n)=>Array.from({length:EMBEDDING_DIM},(_,i)=>i===n?127:0);
const u='https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=abc';
const rows=[
 {id:'w1',documentId:'openfda-warfarin-contraindications',title:'FDA warfarin',license:'CC0',sourceUrl:u,section:'contraindications',model:MODEL_ID,vector:v(0),text:'Warfarin safety precautions including risk from bleeding disorders and relevant patient history.'},
 {id:'w2',documentId:'openfda-warfarin-drug_interactions',title:'FDA warfarin',license:'CC0',sourceUrl:u,section:'drug interactions',model:MODEL_ID,vector:v(1),text:'Warfarin interactions with other medicines need review.'},
 {id:'a1',documentId:'openfda-apixaban-contraindications',title:'FDA apixaban',license:'CC0',sourceUrl:u,section:'contraindications',model:MODEL_ID,vector:v(2),text:'Apixaban is associated with major bleeding risk.'},
];
test('index validates the specified model, source and license',()=>{
 assert.equal(parseIndex(rows.map(r=>JSON.stringify(r)).join('\n')).length,3);
 assert.throws(()=>parseIndex(JSON.stringify({...rows[0],license:'Copyright'})),/Unsupported RAG provenance/);
 assert.throws(()=>parseIndex(JSON.stringify({...rows[0],vector:v(0).slice(1)})),/Wrong embedding/);
});
test('do not retrieve unrelated drug information',()=>{
 assert.deepEqual(explicitlyNamedMedications('Patient using warfarin',rows),['warfarin']);
 assert.deepEqual(explicitlyNamedMedications('Patient in shock',rows),[]);
 assert.deepEqual(explicitlyNamedMedications('Patient on apixaban and warfarin',rows),['apixaban','warfarin']);
});
test('semantic filtering retains citations and refuses invented source',async()=>{
 const d=await mkdtemp(join(tmpdir(),'doc-opus-rag-'));
 try{
   const path=join(d,'index.jsonl');
   await writeFile(path,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
   const result=await medicationEvidence('Warfarin treatment and bleeding risk',path,{
     embedQuery:async()=>Float32Array.from(v(0).map(x=>x/127))});
   assert.equal(result.drugs[0],'warfarin');
   assert.ok(result.hits.length>0);
   assert.ok(result.hits.every(x=>x.title.includes('warfarin')));
   assert.ok(result.evidence.includes('dailymed.nlm.nih.gov'));
   const empty=await medicationEvidence('No medication history provided',path,{embedQuery:async()=>{throw Error('Should not embed')}})
   assert.equal(empty.evidence,'');
 }finally{await rm(d,{recursive:true,force:true})}
});
