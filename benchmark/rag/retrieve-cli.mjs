/** Separate Node process keeps CPU ONNX model out of the Next.js webpack bundle. */
import {readFile} from 'node:fs/promises';
import {medicationEvidence} from './retrieve.mjs';
let input='';
for await (const chunk of process.stdin) {
 input += chunk.toString('utf8');
 if(input.length>130000)throw Error('RAG request too long');
}
try{
 const req=JSON.parse(input);
 if(typeof req.caseText!=='string' || typeof req.indexPath!=='string')throw Error('Invalid RAG request');
 const found=await medicationEvidence(req.caseText,req.indexPath,{limit:4,maxChars:3700});
 process.stdout.write(JSON.stringify(found)+'\n');
}catch(err){
 process.stderr.write('RAG_LOOKUP_FAILED '+String(err).slice(0,500)+'\n');
 process.exitCode=1;
}
