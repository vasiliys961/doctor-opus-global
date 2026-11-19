#!/usr/bin/env python3
"""Create a no-server, no-API, read-only Doctor Opus Academy case reviewer.

Only public pinned MAST cases and actual saved model outputs are embedded.
No model inference, no clinician chart/identifiers, no benchmark score claims.
"""
import ast
import html
import json
import pathlib
from urllib import request

ROOT=pathlib.Path("benchmark/internal-results")
OUT=ROOT/"academy-cheap-ensemble-20261119"
OUT.mkdir(parents=True,exist_ok=True)
CASES=("Card002","Derm001","GI002")
SHA="57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee"
BASE="https://raw.githubusercontent.com/ARISENetwork/mast/"+SHA+"/benchmarks/donoharm/"
def load_rows(path):
 try:
  return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
 except (FileNotFoundError,ValueError):
  return []
payload={"meta":{"title":"Doctor Opus Academy — исторические клинические задачи",
 "note":"TRAINING — synthetic/public benchmarks only, not medical advice; no clinical data, no API calls.",
 "source_sha":SHA,"case_ids":CASES,"not_clinical_validation":True},"cases":[]}
try:
 with request.urlopen(BASE+"dataset/items.jsonl",timeout=25) as r:
  rows=[json.loads(x) for x in r.read(10_000_000).decode().splitlines() if x]
 source={x["id"]:x for x in rows}
except Exception:
 source={}
free=load_rows(OUT/"free"/"responses.jsonl")
haiku=load_rows(ROOT/"haiku-all-archive-20261119"/"responses.jsonl")
nemotron=load_rows(ROOT/"standalone-nemotron12-20261119"/"nemotron-standalone12.jsonl")
opus=load_rows(ROOT/"opus-nemotron-paired-20261119"/"opus-alone.jsonl")
for cid in CASES:
 public=source.get(cid,{})
 reviews=[]
 for label,rows,kind in [
  ("Academy Free — пять функциональных ролей",free,"ensemble"),
  ("Haiku 5.5 — одна модель",haiku,"single"),
  ("Nemotron 3 Ultra — одна модель",nemotron,"single"),
  ("Opus 5.5 — одна модель",opus,"single")]:
  selected=[r for r in rows if r.get("case",r.get("id"))==cid
    and (kind=="ensemble" or r.get("arm") in (None,"standalone_12_matched"))]
  if not selected:continue
  visible=[]
  for row in selected:
   status=row.get("status") or ("ok" if row.get("response") else "not_assessed")
   visible.append({"role":row.get("role","independent response"),
    "model":row.get("model") or row.get("model_requested") or label.split(" — ")[0],
    "status":status,"response":row.get("answer") or row.get("response") or "",
    "usd":row.get("usd") if row.get("usd") is not None else (row.get("usage") or {}).get("cost"),
    "seconds":row.get("seconds") or row.get("duration_s"),"finish_reason":row.get("finish_reason")})
  reviews.append({"name":label,"kind":kind,"voices":visible})
 # Include public rubric only after inference; NEVER included in any model calls.
 try:
  with request.urlopen(BASE+f"dataset/rubrics/{cid}.json",timeout=20) as r:
   rubric=json.loads(r.read(250_000))
  exemplar=rubric.get("case",{}).get("recommendations","")
 except Exception:
  exemplar=""
 payload["cases"].append({"id":cid,"question":public.get("prompt","Original public case text unavailable; open source link"),
   "rubric":exemplar,"models":reviews})
data=json.dumps(payload,ensure_ascii=False).replace("</","<\\/").replace("<","\\u003c").replace("\u2028","\\u2028")
page=r"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Doctor Opus Academy — Public Clinical Case Replay</title>
<style>
:root{color-scheme:light;--bg:#f5f7fa;--panel:#fff;--txt:#182231;--muted:#526074;--line:#dbe1e9;--accent:#21477c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.55 system-ui,-apple-system,sans-serif}
header{background:#172d49;color:#fff;padding:21px 4%;display:flex;gap:18px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
header h1{font-size:22px;line-height:1.25;margin:0 0 6px}header p{margin:0;opacity:.84;max-width:760px;font-size:13px}
.pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.045em;border:1px solid #aab9ca;border-radius:30px;padding:6px 11px;white-space:nowrap}
main{max-width:1340px;margin:0 auto;padding:23px 4%;display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px}
h2{font-size:18px;margin:0 0 12px}h3{font-size:15px;margin:5px 0 10px}
.sidebar,.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:17px;box-shadow:0 2px 7px #172d4908}
.sidebar{height:fit-content}.sidebar button,.controls button{cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--txt);padding:10px 12px;border-radius:8px;font:inherit;text-align:left}
.sidebar button{display:block;width:100%;margin:7px 0}.sidebar button.active,.controls button.active{background:#e9f1fb;color:#163963;border-color:#96b5db}
.grid{display:grid;gap:16px}.case{white-space:pre-wrap;overflow-wrap:anywhere}.note{color:var(--muted);font-size:13px}.controls{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:13px}.status{font-size:12px;color:#486184}
.voice{border-top:1px solid var(--line);padding-top:13px;margin-top:13px}.voice:first-child{border-top:0;padding-top:0}
.voice pre{font:13px/1.58 ui-sans-serif,system-ui;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}
small{color:var(--muted)}details summary{cursor:pointer;font-weight:600}.footer{font-size:12px;color:#536579;margin-top:12px}
@media(max-width:820px){main{grid-template-columns:1fr}.sidebar{display:flex;flex-wrap:wrap;gap:8px}.sidebar h2{width:100%}.sidebar button{width:auto}}
</style></head><body>
<header><div><h1>Doctor Opus Academy · Clinical Research Replay</h1><p>Учебное воспроизведение реально полученных ответов на публичные клинические случаи. Никаких новых API-вызовов, клинических назначений или доступа к рабочим данным.</p></div><span class="pill">TRAINING · NOT FOR CLINICAL USE</span></header>
<main><aside class="sidebar"><h2>Публичные случаи</h2><div id="case-nav"></div><div class="footer">Результаты сохранены из GitHub Actions. Отсутствующий ответ не равен ошибке диагноза.</div></aside>
<div class="grid"><section class="card"><h2 id="case-title"></h2><div id="case-question" class="case"></div></section>
<section class="card"><h2>Сравнить ответы</h2><div id="tabs" class="controls"></div><div id="voices"></div></section>
<section class="card"><details><summary>Показать исходные ориентиры MAST для врача-рецензента</summary><p class="note">Ориентиры доступны только после генерации ответов и не передавались моделям. Они не заменяют современные клинические рекомендации или независимую экспертизу.</p><div id="rubric" class="case"></div></details></section></div></main>
<script type="application/json" id="data">__PAYLOAD__</script>
<script>
const d=JSON.parse(document.getElementById('data').textContent);
let ci=0,mi=0;
function el(tag,text,cls){const z=document.createElement(tag);if(text!==undefined)z.textContent=text;if(cls)z.className=cls;return z;}
function update(){
 const c=d.cases[ci];document.getElementById('case-title').textContent=c.id+' · исходная публичная задача';
 document.getElementById('case-question').textContent=c.question;
 document.getElementById('rubric').textContent=c.rubric||'Рубрика источника недоступна';
 const nav=document.getElementById('case-nav');nav.replaceChildren();
 d.cases.forEach((row,i)=>{const b=el('button',row.id,i===ci?'active':'');b.onclick=()=>{ci=i;mi=0;update()};nav.appendChild(b)});
 const tabs=document.getElementById('tabs');tabs.replaceChildren();
 c.models.forEach((m,i)=>{const b=el('button',m.name,i===mi?'active':'');b.onclick=()=>{mi=i;update()};tabs.appendChild(b)});
 const container=document.getElementById('voices');container.replaceChildren();
 if(!c.models.length){container.append(el('p','Ответы для этого случая недоступны. Это не нулевая клиническая оценка.','note'));return}
 if(mi>=c.models.length)mi=0;
 const m=c.models[mi];
 container.append(el('p',m.kind==='ensemble'?'Четыре независимые роли → итоговый синтез. Смотрите реальные статусы.':'Ответ одной модели, без оркестрации.','note'));
 m.voices.forEach(v=>{
  const section=el('section',undefined,'voice');
  section.append(el('h3',v.role+' · '+v.model));
  section.append(el('div','Статус: '+v.status+' · API: '+(v.usd==null?'стоимость не указана':'$'+Number(v.usd).toFixed(6))+(v.seconds==null?'':' · '+v.seconds+' с'),'status'));
  section.append(el('pre',v.response||'Нет завершённого ответа; не интерпретировать как отсутствие клинического знания.'));
  container.append(section)
 });
}
update();
</script></body></html>"""
path=OUT/"academy-replay-public.html"
path.write_text(page.replace("__PAYLOAD__",data),encoding="utf-8")
print(json.dumps({"file":str(path),"bytes":path.stat().st_size,
    "case_count":len(payload["cases"]),"recovered_models_by_case":{c["id"]:len(c["models"]) for c in payload["cases"]}},
    ensure_ascii=False))
