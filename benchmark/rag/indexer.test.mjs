import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chunkDocument,assertPublicDocument,quantizeInt8,retrieve,similarity,MODEL_ID,EMBEDDING_DIM} from './indexer.mjs';

const sample={id:'sample',title:'Synthetic public document',license:'CC0',privacy:'public',
  text:Array(55).fill('This is a fully synthetic test statement with enough words for segmentation.').join(' ')};

test('rejects private or unlicensed document material',()=>{
  assert.doesNotThrow(()=>assertPublicDocument(sample));
  assert.throws(()=>assertPublicDocument({...sample,privacy:'private'}),/Private source blocked/);
  assert.throws(()=>assertPublicDocument({...sample,license:'commercial-textbook'}),/Unlicensed or private/);
  assert.throws(()=>assertPublicDocument({...sample,url:'http://insecure.example'}),/HTTPS source/);
});
test('deterministic chunks preserve citation information and checksum',()=>{
  const chunks=chunkDocument(sample,220,8);
  assert.ok(chunks.length>2);
  assert.ok(chunks.every(x=>x.text.length<=220 && x.contentSha256.length===64 && x.license==='CC0'));
  assert.deepEqual(chunks,chunkDocument(sample,220,8));
  assert.equal(new Set(chunks.map(x=>x.id)).size,chunks.length);
});
test('384-dimensional parent-compatible Int8 vectors and retrieval',()=>{
  const a=new Float32Array(EMBEDDING_DIM);a[0]=0.5;a[1]=-0.5;
  const q=quantizeInt8(a);
  assert.equal(q.length,384);assert.equal(q[0],64);assert.equal(q[1],-63);
  const score=similarity(a,q);
  assert.ok(score>0.49 && score<0.51);
  const rows=[{id:'good',model:MODEL_ID,vector:q},{id:'bad',model:MODEL_ID,vector:Array(384).fill(0)},
    {id:'wrong-model',model:'unknown',vector:q}];
  const result=retrieve(a,rows,2);
  assert.deepEqual(result.map(r=>r.id),['good','bad']);
});
