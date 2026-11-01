import { test } from 'node:test';
import assert from 'node:assert/strict';
import {extractSections, fetchDrug} from './fetch-openfda.mjs';

const rec={set_id:'00000000-1111-2222-3333-444444444444',effective_time:'20261001',
  openfda:{generic_name:['warfarin sodium'],product_type:['HUMAN PRESCRIPTION DRUG']},
  contraindications:['Patients with active major bleeding should not take this anticoagulant. A prolonged description sufficient for safe extraction and traceability.'],
  drug_interactions:['Concurrent use of drugs affecting hemostasis may increase bleeding risk; assess and monitor relevant medicines.'],
  warnings_and_precautions:['Discuss the risk of bleeding and select appropriate patient monitoring; clinical conditions may require adjustment.']
};
test('extract real FDA record fields into open-licensed section documents',()=>{
 const a=extractSections('warfarin',rec,'https://api.fda.gov/drug/label.json');
 assert.equal(a.length,3);
 assert.deepEqual(a.map(d=>d.section),['contraindications','warnings and precautions','drug interactions']);
 assert.ok(a.every(d=>d.license==='CC0'&&d.sourceSetId===rec.set_id&&d.text.length>=100));
 assert.ok(a.every(d=>d.url.includes('dailymed.nlm.nih.gov')));
 assert.throws(()=>extractSections('apixaban',rec,'https://api.fda.gov'),/Not a matching generic/);
});
test('fetch query selects matching human prescription product and date',async()=>{
 let hit='';
 const fake=async(url)=>{hit=url;return {ok:true,json:async()=>({results:[rec]})}};
 const docs=await fetchDrug('warfarin',{fetchImpl:fake});
 assert.ok(hit.includes('openfda.generic_name'));
 assert.ok(hit.includes('_exists_%3Acontraindications'));
 assert.equal(docs.length,3);
});
