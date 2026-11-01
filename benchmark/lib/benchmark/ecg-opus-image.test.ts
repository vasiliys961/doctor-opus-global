import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../diagnostics/llm-client',()=>({callDiagnosticAgent:vi.fn()}));
import {callDiagnosticAgent} from '../diagnostics/llm-client';
import {analyzeECGOpusImage,validateECGImage} from './ecg-opus-image';
const mocked=vi.mocked(callDiagnosticAgent);
beforeEach(()=>mocked.mockReset());
afterEach(()=>mocked.mockReset());
it('Gemini and original-pixels Claude Opus, not text-only or 531 model',async()=>{
 mocked
  .mockResolvedValueOnce({content:'Source visual observation: 12 leads, electrical rhythm observed',costUsd:0.01,error:null} as never)
  .mockResolvedValueOnce({content:'ECG findings: sinus rhythm is a hypothesis; precise measurements unknown, calibration not visible.',costUsd:0.02,error:null} as never);
 const original='AQIDBA==';
 const r=await analyzeECGOpusImage({image:{base64:original,mimeType:'image/png'}});
 expect(mocked).toHaveBeenCalledTimes(2);
 for(const call of mocked.mock.calls){
  const data=call[0].userContent;
  expect(JSON.stringify(data)).toContain('data:image/png;base64,'+original);
 }
 expect(mocked.mock.calls[0][0].model).toMatch(/gemini/);
 expect(mocked.mock.calls[1][0].model).toMatch(/opus/);
 expect(r.digitalECGFounderExecuted).toBe(false);
 expect(r.models).toHaveLength(2);
 expect(r.costUsd).toBeCloseTo(0.03);
});
it('Reject malformed/unbounded images before any paid call',async()=>{
 expect(()=>validateECGImage({image:{base64:'https://example.com',mimeType:'image/png'}})).toThrow();
 expect(mocked).not.toHaveBeenCalled();
});
