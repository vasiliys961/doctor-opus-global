/** Evidence hand-off from ECG Opus original waveform + NeuroKit2.
 * NOT ECGFounder 150-score inference and NOT ecgdeli 531-vector inference.
 * Values in source CSV may be uncalibrated. No diagnosis labels enter prompt.
 */
export type ECGOpusMeasuredSignal={
 available:true;
 method:'ECG Opus NeuroKit2';
 beats:number;
 heart_rate_bpm:number|null;
 rr_ms:number|null;
 rr_min_ms:number|null;
 rr_max_ms:number|null;
 pq_ms:number|null;
 qrs_ms:number|null;
 qt_ms:number|null;
 qtc_bazett_ms:number|null;
 premature_beats:number|null;
 ecgfounder_executed:false;
 source_units_uncalibrated:true;
};
const PARAMETERS=['heart_rate_bpm','rr_ms','rr_min_ms','rr_max_ms','pq_ms','qrs_ms','qt_ms','qtc_bazett_ms','premature_beats'] as const;
export function validateECGOpusMeasuredSignal(data:unknown):asserts data is ECGOpusMeasuredSignal{
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('No digital ECG evidence');
 const x=data as Record<string,unknown>;
 if(x.available!==true||x.method!=='ECG Opus NeuroKit2'||
    x.ecgfounder_executed!==false||x.source_units_uncalibrated!==true||
    typeof x.beats!=='number'||!Number.isInteger(x.beats)||x.beats<3||x.beats>100)
   throw Error('Digital ECG measurement origin not verified');
 for(const field of PARAMETERS){
  const value=x[field];
  if(value!==null && (typeof value!=='number'||!Number.isFinite(value)||value<0))
    throw Error('Invalid digital ECG measurement '+field);
 }
}
export function formatECGOpusDigitalEvidence(data:unknown):string{
 validateECGOpusMeasuredSignal(data);
 // No source filename, original label or patient identifiers transferred.
 const values=Object.fromEntries(
   ['beats',...PARAMETERS].map(k=>[k,data[k as keyof ECGOpusMeasuredSignal]])
 );
 const rrSpreadRatio=data.rr_min_ms!==null&&data.rr_max_ms!==null&&data.rr_min_ms>0
  ?Number((data.rr_max_ms/data.rr_min_ms).toFixed(2)):null;
 return JSON.stringify({
  origin:'automated NeuroKit2 measurements of original 12-lead digital signal',
  measurements:values,
  derivedResearchChecks:{rrMaxToMinRatio:rrSpreadRatio,
   interpretation:'A wide RR range may suggest cycle-length variability OR beat-detection error; inspect the waveform before diagnosing AF/flutter or declaring regularity.'},
  limitations:[
   'NeuroKit2 delineation is algorithmic and has NOT been manually verified',
   'Do not diagnose organized atrial activity or report a valid PR solely from an auto-computed PQ when atrial rhythm is irregular or P waves are not convincingly present',
   'QTc Bazett may be unreliable during marked tachycardia or irregular RR',
   'Amplitude and ST values are in source waveform units: not calibrated millimetres',
   'ECGFounder model was NOT executed and no 531-feature model was run'
  ]
 });
}
