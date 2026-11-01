/** Isolated NIH clinical guideline lookup; reads patient question from stdin. */
import {guidelineEvidence} from './guidelines-lookup.mjs';
let input='';
for await (const chunk of process.stdin){
 input+=chunk.toString('utf8');
 if(input.length>130000)throw Error('Guideline RAG input exceeds safe limit');
}
try{
 const req=JSON.parse(input);
 if(typeof req.caseText!=='string'||typeof req.indexPath!=='string')throw Error('Bad request');
 const found=await guidelineEvidence(req.caseText,req.indexPath,{limit:5});
 process.stdout.write(JSON.stringify(found)+'\n');
}catch(err){
 process.stderr.write('NIH_GUIDELINE_RAG_ERROR '+String(err).slice(0,500)+'\n');
 process.exitCode=1;
}
