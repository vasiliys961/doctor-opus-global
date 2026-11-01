import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {guidelineEvidence} from './guidelines-lookup.mjs';

const path=process.argv[2]||'benchmark/rag-index-guidelines/index.jsonl';
const output=process.argv[3]||'benchmark/rag-index-guidelines/retrieval-eval.json';
const queries=[
{id:'pcp',q:'In a patient with HIV and Pneumocystis pneumonia, when is TMP-SMX recommended for treatment or prophylaxis?',expected:'nih-hiv-pneumocystis'},
{id:'pneumonia',q:'How do NIH guidelines approach community-acquired bacterial pneumonia in people with HIV and when to start antibiotics?',expected:'nih-hiv-community-pneumonia'},
{id:'toxoplasma',q:'A patient with AIDS has focal brain lesions due to toxoplasma encephalitis. Which clinical treatment guidance covers this?',expected:'nih-hiv-toxoplasmosis'},
{id:'mac',q:'What are NIH treatment principles for disseminated Mycobacterium avium complex in advanced HIV infection?',expected:'nih-hiv-mac'},
{id:'control',q:'An otherwise healthy runner has mild atraumatic hip pain and wants a sports physical examination.',expected:null},
];
const data=[];
for(const query of queries){
 const result=await guidelineEvidence(query.q,path,{limit:5});
 const hit=query.expected ? result.hits.some(x=>x.documentId.startsWith(query.expected)) : !result.found;
 data.push({id:query.id,expected:query.expected,returned:result.hits.map(x=>x.documentId),passed:hit});
 console.log('GUIDELINE_RETRIEVAL_TEST '+JSON.stringify(data.at(-1)));
 if(!hit)process.exitCode=2;
}
await mkdir(dirname(output),{recursive:true});
const accuracy=data.filter(x=>x.passed).length;
await writeFile(output,JSON.stringify({accuracy,total:data.length,tests:data},null,2)+'\n');
console.log('GUIDELINE_RETRIEVAL_SUMMARY '+JSON.stringify({passed:accuracy,total:data.length,allPassed:accuracy===data.length}));
