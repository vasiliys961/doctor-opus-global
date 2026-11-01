import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../diagnostics/llm-client',()=>({callDiagnosticAgent:vi.fn()}));
import {callDiagnosticAgent} from '../diagnostics/llm-client';
import {formatECGOpusDigitalEvidence} from './ecg-opus-digital-evidence';
import {analyzeECGOpusImage} from './ecg-opus-image';
const digital={available:true as const,method:'ECG Opus NeuroKit2' as const,beats:25,
 heart_rate_bpm:156.2,rr_ms:384,rr_min_ms:330,rr_max_ms:636,
 pq_ms:114,qrs_ms:131.2,qt_ms:308,qtc_bazett_ms:497,
 premature_beats:0,ecgfounder_executed:false as const,source_units_uncalibrated:true as const};
beforeEach(()=>vi.mocked(callDiagnosticAgent).mockReset());
it('requires real measured origin and excludes fictitious ECGFounder execution',()=>{
 expect(()=>formatECGOpusDigitalEvidence({...digital,ecgfounder_executed:true})).toThrow();
 expect(()=>formatECGOpusDigitalEvidence({...digital,heart_rate_bpm:NaN})).toThrow();
 expect(()=>formatECGOpusDigitalEvidence({...digital,available:false})).toThrow();
 expect(formatECGOpusDigitalEvidence(digital)).toContain('NeuroKit2');
});
it('Gemini remains blind to all digital values; only Opus receives measured numbers and original pixels',async()=>{
 const mock=vi.mocked(callDiagnosticAgent);
 mock.mockResolvedValueOnce({content:'Independent original-pixels observation with uncertain organized P waves',costUsd:0.02,error:null} as never)
  .mockResolvedValueOnce({content:'Rhythm is fast and irregular; AF remains possible. Algorithm PQ may be invalid without clear P waves.',costUsd:0.06,error:null} as never);
 const input={image:{base64:'AQIDBA==',mimeType:'image/png' as const},digitalMeasurements:digital};
 const result=await analyzeECGOpusImage(input);
 expect(mock).toHaveBeenCalledTimes(2);
 const primary=JSON.stringify(mock.mock.calls[0][0].userContent);
 const secondary=JSON.stringify(mock.mock.calls[1][0].userContent);
 expect(primary).not.toContain('156.2');
 expect(secondary).toContain('156.2');
 expect(primary).toContain('data:image/png;base64,AQIDBA==');
 expect(secondary).toContain('data:image/png;base64,AQIDBA==');
 expect(result.originalSignalNeuroKitMeasured).toBe(true);
 expect(result.digitalECGFounderExecuted).toBe(false);
});
