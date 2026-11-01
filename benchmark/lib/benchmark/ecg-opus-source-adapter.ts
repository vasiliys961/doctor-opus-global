/** Contest-only ECG Opus source interface, NOT the narrow ecgdeli 531-vector.
 * Original engine: vasiliys961/ecg-opus-global backend/app.py +
 * ecg_engine/ecgfounder.py; 12-lead ~10s waveform -> ECGFounder 150 scores
 * and NeuroKit measurements. Model weights live OUTSIDE GitHub and are required.
 * A sigmoid score must never be represented as a calibrated diagnosis probability.
 */
import type {EvidenceItem} from './source-bound-evidence';

const LEADS=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export type ECGFounderScore={label:string;score:number};
export type ECGOpusSignalEvidence={
 sourceId:string;model:'ECGFounder';classCount:150;inputSamples:5000;
 leadOrder:string[];scores:ECGFounderScore[];
 measurements:Record<string,unknown>;limitations:string[];
};

/** Validate *actual* returned digital output; fail closed if weights unavailable.
 * Deliberately does not transform images/PDFs into fake raw waveforms.
 */
export function adaptECGOpusDigital(sourceId:string,raw:unknown):ECGOpusSignalEvidence{
 if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(sourceId)||
   !raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid ECG source');
 const x=raw as Record<string,unknown>;
 if(x.model!=='ECGFounder'||x.class_count!==150||x.input_samples!==5000||
   !Array.isArray(x.lead_order)||JSON.stringify(x.lead_order)!==JSON.stringify(LEADS)||
   !Array.isArray(x.scores)||x.scores.length<1||x.scores.length>150)
  throw Error('ECGFounder raw model result unavailable/unverified');
 const seen=new Set<string>(),scores:ECGFounderScore[]=[];
 for(const item of x.scores){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Malformed ECGFounder score');
  const s=item as Record<string,unknown>;
  if(typeof s.label!=='string'||!s.label||s.label.length>150||seen.has(s.label)||
     typeof s.score!=='number'||!Number.isFinite(s.score)||s.score<0||s.score>1)
     throw Error('Invalid ECGFounder sigmoid score');
  seen.add(s.label);
  scores.push({label:s.label,score:s.score});
 }
 if(!x.measurements||typeof x.measurements!=='object'||Array.isArray(x.measurements))
  throw Error('NeuroKit measurements unavailable; no inference-only fallback');
 // No unverified numeric interpretation: handoff only untouched measurement JSON
 // and scores; the reviewing cardiologist must validate units and wave boundaries.
 return {sourceId,model:'ECGFounder',classCount:150,inputSamples:5000,
  leadOrder:LEADS.slice(),scores,measurements:x.measurements as Record<string,unknown>,
  limitations:['Sigmoid scores are not calibrated probabilities or established diagnoses',
    'Measured ST amplitudes use signal-file units, not paper millimetres',
    'Unreviewed leads and uncertain delineations must not be called normal']};
}
export function toECGSourceEvidence(e:ECGOpusSignalEvidence):EvidenceItem[]{
 return [{
   id:'ecgfounder:'+e.sourceId,sourceId:e.sourceId,modality:'ecg',
   bodyRegion:'heart',finding:JSON.stringify({
     model:e.model,topScores:e.scores.slice(0,20),
     measurements:e.measurements,interpretation:'machine_measured_unverified'
   }).slice(0,4800),status:'observed',coverage:'partial',
   model:'PKUDigitalHealth/ECGFounder',limitations:e.limitations,
 }];
}

/** Workers run in a private runner with genuine ECGFounder weights. Never
 * default to an external URL, or send raw ECG to an arbitrary public host.
 */
export async function fetchECGOpusLocalSignal(
 sourceId:string,signal:number[][],samplingRate:number,
 endpoint:string|undefined
):Promise<ECGOpusSignalEvidence>{
 if(!endpoint||!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(endpoint))
  throw Error('Explicit loopback ECG Opus worker required');
 if(signal.length!==12||!Number.isFinite(samplingRate)||samplingRate<100||samplingRate>2000||
    signal.some(lead=>!Array.isArray(lead)||lead.length<samplingRate*8||
    lead.length>samplingRate*12||lead.some(x=>typeof x!=='number'||!Number.isFinite(x))))
  throw Error('ECGFounder requires finite 8–12 sec 12-lead waveform');
 const response=await fetch(endpoint+'/api/ecg/signal',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({signal,sampling_rate:samplingRate,lead_names:LEADS}),
  signal:AbortSignal.timeout(120_000),
 });
 if(!response.ok)throw Error('Local ECG Opus worker unavailable or weights missing');
 return adaptECGOpusDigital(sourceId,await response.json());
}
