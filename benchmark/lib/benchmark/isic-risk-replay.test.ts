import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {assessDermoscopicTriage} from './derm-risk-triage';

it('score frozen ISIC ten-image reports without any provider calls',()=>{
 const lines=readFileSync('../isic-source/internal-results/isic2016-ten/answers.jsonl','utf8').trim().split('\n');
 const rows=lines.map(line=>JSON.parse(line));
 expect(rows.length).toBe(10);
 const decisions=rows.map(r=>{
  const t=assessDermoscopicTriage({observation:r.observation,prediction:r.prediction});
  return {id:r.id,actual:r.groundTruth,predicted:r.prediction,
   needsReview:t.triage!=='benign_appearing',reason:t.reasons};
 });
 const count=(label:string,flag:boolean)=>decisions.filter(x=>x.actual===label&&x.needsReview===flag).length;
 const summary={total:10,malignantReviewed:count('malignant',true),
  benignReviewed:count('benign',true),
  benignCleared:count('benign',false),
  originalCorrect:decisions.filter(x=>x.actual===x.predicted).length,
  newModelCalls:0,newApiCostUsd:0,
  caveat:'In-sample review triage, not diagnostic reclassification or external validation'};
 mkdirSync('internal-results/isic-triage',{recursive:true});
 writeFileSync('internal-results/isic-triage/replay.json',JSON.stringify({summary,decisions},null,2));
 console.log('MAST_ISIC_TRIAGE '+JSON.stringify(summary));
 expect(summary.malignantReviewed).toBe(5);
},120000);
