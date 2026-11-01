import { test } from 'node:test';
import assert from 'node:assert/strict';
import {selectContext,parseGuidelineIndex} from './guidelines-lookup.mjs';
import {MODEL_ID,EMBEDDING_DIM} from './indexer.mjs';

test('allow only relevant NIH opportunistic-infection presentations',()=>{
 const c=['A patient with untreated HIV and Pneumocystis jirovecii pneumonia requires urgent management.',
  'A patient with advanced HIV has cerebral toxoplasmosis and seizures.',
  'Advanced HIV has severe community-acquired pneumonia and oxygen saturation 85%.',
  'A patient with disseminated Mycobacterium avium complex has CD4 of 20 cells/uL.'];
 for(const q of c)assert.equal(selectContext(q,[]).eligible,true,q);
});
test('do not inject irrelevant NIH OI chapter into general HIV exposure, PEP or unrelated illness',()=>{
 const questions=[
  'A woman reports HIV exposure during intercourse and wants guidance on post-exposure prophylaxis.',
  'Should a person who is healthy and HIV negative begin pre-exposure prophylaxis?',
  'A patient has routine asymptomatic HIV screening without respiratory or opportunistic symptoms.',
  'A patient has ordinary community acquired pneumonia but has not been diagnosed with HIV.',
  'Patient with hip osteoarthritis asks about rehabilitation and strength training.'
 ];
 for(const q of questions)assert.equal(selectContext(q,[]).eligible,false,q);
});
test('reject wrong index model and unlicensed pseudo NIH sources',()=>{
 const base={id:'a',documentId:'nih-hiv-pneumocystis-000',model:MODEL_ID,
  license:'PUBLIC-DOMAIN',sourceUrl:'https://clinicalinfo.hiv.gov/en/guidelines/example',
  vector:Array(EMBEDDING_DIM).fill(0),text:'Synthetic testing statement'};
 assert.equal(parseGuidelineIndex(JSON.stringify(base)).length,1);
 assert.throws(()=>parseGuidelineIndex(JSON.stringify({...base,license:'CLOSED'})),/Unexpected publisher/);
 assert.throws(()=>parseGuidelineIndex(JSON.stringify({...base,model:'wrong'})),/Wrong model/);
 assert.throws(()=>parseGuidelineIndex(JSON.stringify({...base,documentId:'external-private-doc'})),/Unknown guideline source/);
});
