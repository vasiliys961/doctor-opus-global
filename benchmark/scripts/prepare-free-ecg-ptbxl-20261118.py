# Source algorithm copied from consilium scripts/prepare-ecg-comparison.py @ 9443e67
"""Pinned public PTB-XL test ECGs. No private app data or model API calls."""
import ast,csv,hashlib,json,pathlib,urllib.request,time
ROOT=pathlib.Path('benchmark/internal-results/ecg-ptbxl-20261118')
SOURCE='https://physionet.org/files/ptb-xl/1.0.3/'
# Exact pinned public PTB-XL metadata: run without local Mac dependencies.
(ROOT/'source').mkdir(parents=True,exist_ok=True)
for filename in ('ptbxl_database.csv','scp_statements.csv'):
 target=ROOT/'source'/filename
 if not target.exists():
  with urllib.request.urlopen(SOURCE+filename,timeout=60) as response: target.write_bytes(response.read())
rows=list(csv.DictReader((ROOT/'source/ptbxl_database.csv').open()))
statements=list(csv.DictReader((ROOT/'source/scp_statements.csv').open()))
mi={r[''] for r in statements if r['diagnostic_class']=='MI'}
groups=[('NORM',3),('AFIB',3),('CRBBB',3),('CLBBB',3),('1AVB',3),('LVH',3),('MI',2)]
used=set();selected=[]
def tags(row):return ast.literal_eval(row['scp_codes'])
def eligible(row,target):
 c=tags(row)
 if row['strat_fold']!='10' or row['validated_by_human']!='True' or row['patient_id'] in used:return False
 if any(row[field].strip() for field in ['baseline_drift','static_noise','burst_noise','electrodes_problems']):return False
 present={key for key in ['CRBBB','CLBBB','1AVB','LVH'] if c.get(key,-1)>=80}
 if 'AFIB' in c:present.add('AFIB')
 if any(c.get(key,-1)>=80 for key in mi):present.add('MI')
 if target=='NORM':return c.get('NORM')==100 and set(c)<=set(['NORM','SR'])
 if present!={target}:return False
 if target=='MI' and not any(word in row['report'].lower() for word in ['infarct','infarkt']):return False
 return True
for target,count in groups:
 candidates=sorted((r for r in rows if eligible(r,target)),key=lambda r:int(r['ecg_id']))
 for row in candidates:
  if row['patient_id'] in used:continue
  used.add(row['patient_id']);selected.append((target,row));count-=1
  if count==0:break
 if count:raise RuntimeError('Insufficient examples: '+target)
# Interleave categories before inference; order is independent of model responses.
selected=sorted(selected,key=lambda item:(sum(1 for t,r in selected if t==item[0] and int(r['ecg_id'])<int(item[1]['ecg_id'])),dict((g,i) for i,(g,_) in enumerate(groups))[item[0]]))
(ROOT/'waveforms').mkdir(exist_ok=True);(ROOT/'images').mkdir(exist_ok=True)
cases=[]
for index,(target,row) in enumerate(selected,1):
 name=f'ecg-{index:02d}';stem=row['filename_hr'];files=[]
 for ext in ['hea','dat']:
  dest=ROOT/'waveforms'/f'{name}.{ext}'
  if not dest.exists():
   with urllib.request.urlopen(SOURCE+stem+'.'+ext,timeout=40) as response:dest.write_bytes(response.read())
  files.append({'file':str(dest.relative_to(ROOT)),'source':SOURCE+stem+'.'+ext,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
 cases.append({'id':name,'ecgId':int(row['ecg_id']),'referencePrimary':target,'scpCodes':tags(row),'referenceReport':row['report'],'validatedByHuman':True,'fold':10,'sourceStem':stem,'files':files})
 print(name,target,row['ecg_id'],flush=True)
manifest={'source':'https://physionet.org/content/ptb-xl/1.0.3/','version':'1.0.3','selection':'First eligible IDs in human-validated held-out fold 10, one patient each, no marked signal-quality problems; interleaved fixed categories before inference. Targeted small sample, not representative clinical prevalence. Selected categories mutually exclusive among the seven evaluated categories at confidence >=80 for diagnostic tags; rhythm AFIB uses presence, since rhythm 0 denotes unknown likelihood, not absence.','classes':[g for g,_ in groups],'cases':cases}
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Images reconstructed from public 500-Hz waveforms, without report, labels or identifiers.
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
for c in cases:
 header=(ROOT/'waveforms'/f"{c['id']}.hea").read_text().splitlines();first=header[0].split();n=int(first[1]);fs=float(first[2]);length=int(first[3])
 if n!=12 or fs!=500:raise RuntimeError('Unexpected signal geometry')
 data=np.fromfile(ROOT/'waveforms'/f"{c['id']}.dat",dtype='<i2')
 if data.size!=n*length:raise RuntimeError('WFDB sample count mismatch')
 data=data.reshape(length,n).astype(float);leads={}
 for i,line in enumerate(header[1:n+1]):
  fields=line.split()
  if fields[1]!='16':raise RuntimeError('Unsupported WFDB sample format')
  gainpart=fields[2].split('/')[0];gain=float(gainpart.split('(')[0]);baseline=float(gainpart.split('(')[1].rstrip(')')) if '(' in gainpart else float(fields[4])
  leads[fields[-1].upper()]=(data[:,i]-baseline)/gain
 fig,ax=plt.subplots(figsize=(13.5,7.5),dpi=180);fig.subplots_adjust(left=.015,right=.985,bottom=.025,top=.97)
 ax.set_xlim(-13,252);ax.set_ylim(-5,145);ax.set_aspect('equal')
 for x in np.arange(0,251,1):ax.axvline(x,color='#efb7bb' if x%5==0 else '#f7dfe1',lw=.55 if x%5==0 else .23,zorder=0)
 for y in np.arange(0,141,1):ax.axhline(y,color='#efb7bb' if y%5==0 else '#f7dfe1',lw=.55 if y%5==0 else .23,zorder=0)
 layout=[['I','AVR','V1','V4'],['II','AVL','V2','V5'],['III','AVF','V3','V6']]
 for row,group in enumerate(layout):
  baseline=113-row*32
  for col,lead in enumerate(group):
   y=leads[lead][:int(2.5*fs)];x=np.arange(len(y))/fs*25+col*62.5
   ax.plot(x,baseline+10*y,color='black',lw=.63);ax.text(col*62.5+1,baseline+13,lead,fontsize=9,weight='bold')
  ax.plot([-11,-9,-9,-4,-4,-2],[baseline,baseline,baseline+10,baseline+10,baseline,baseline],color='black',lw=.8)
 rhythm=leads['II'];ax.plot(np.arange(length)/fs*25,14+rhythm*10,color='black',lw=.63);ax.text(1,27,'II · 10 s',fontsize=9,weight='bold')
 ax.text(0,139,'25 mm/s    10 mm/mV    500 Hz    12 leads: simultaneous 0–2.5 s; rhythm II: 0–10 s',fontsize=9)
 ax.axis('off');file=ROOT/'images'/f"{c['id']}.jpg";fig.savefig(file,format='jpg',dpi=180,pil_kwargs={'quality':90});plt.close(fig)
 from PIL import Image
 with Image.open(file) as image:width,height=image.size
 c.update(image=str(file.relative_to(ROOT)),imageSha256=hashlib.sha256(file.read_bytes()).hexdigest(),width=width,height=height,samplingRate=500,durationSeconds=length/fs,rendering={'speedMmSec':25,'gainMmMv':10,'layout':'3x4 simultaneous 2.5-second lead strips plus full 10-second II rhythm','noPatientMetadataOrLabels':True})
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('Rendered',len(cases),'calibrated public ECG images.')
