import {PRODUCTS,DOWNTIME,today,validDate,validMonth,daysInMonth,emptyPayload,calculate,normSnapshot,decimal,monthly} from '../team-core.mjs';
import {createEntryController} from './entry-modes-core.mjs';
import {createEntryModes} from './entry-modes.mjs';
import {makeSharedWorkbookBuilder,replaceWorkday,validateSnapshot,workbookFilename} from './shared-workbook.mjs';
import {SameWorkbookFile,LatestWorkbook,fileHandleStore} from './same-workbook-file.mjs';
import {saveXlsx,column} from '../excel-export.mjs';
// Isolated test notebook: never reads the earlier personal or boss-demo stores.
const KEY='muszaknaplo.three-modes-demo.v1';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=2)=>new Intl.NumberFormat('hu-HU',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n),hrs=n=>fmt(n/6000);
const profiles=Array.from({length:20},(_,i)=>({id:'demo-'+String(i+1).padStart(3,'0'),worker_code:'D'+String(i+1).padStart(3,'0'),display_name:'Minta dolgozó '+String(i+1).padStart(2,'0'),role:'employee',active:true}));
function initial(){const records=[];for(let i=0;i<20;i++){const p=emptyPayload();p.counts={product_3243:3+i%4,product_3474:2,product_4074:5,product_4674:4,product_5074:3,rollo:5,polc:2,tukor:3};p.downtime={downtime_64:1500};p.note='Kitalált bemutatóadat. Nem valós elszámolás.';records.push({employee_id:profiles[i].id,work_date:today(),version:1,status:'draft',payload:p,norms:normSnapshot()});}return {schemaVersion:1,bookId:'demo-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),workspace:'demo-workspace',revision:1,profiles,records};}
function validate(s){if(!s||!Array.isArray(s.records)||s.records.length>10000)throw Error('Hibás bemutatómentés.');const periods=[...new Set(s.records.map(r=>r.work_date?.slice(0,7)))];for(const period of periods)validateSnapshot({...s,month:period,records:s.records.filter(r=>r.work_date?.slice(0,7)===period)});if(!periods.length)validateSnapshot({...s,month:today().slice(0,7)});return s;}
let data,storedRaw=null,blocked=false;
try{storedRaw=localStorage.getItem(KEY);data=storedRaw?validate(JSON.parse(storedRaw)):initial();if(!storedRaw){storedRaw=JSON.stringify(data);localStorage.setItem(KEY,storedRaw);}}catch(e){data=initial();blocked=true;$('#storageWarning').hidden=false;$('#storageWarning').textContent='A helyi mentés nem olvasható vagy nem engedélyezett. Csak ebben az ablakban próbálhatsz; a régi mentést nem írjuk felül.';}
let period=today().slice(0,7),date=today(),employee=profiles[0].id,tab='Osszesito',output=null,dirtyBook=true,quick,entryController,toastTimer,buildTimer,editor=true,restoredIdentity='';
const canFile=typeof window.showSaveFilePicker==='function'&&!!crypto.subtle&&!!navigator.locks;
const store=fileHandleStore();
const file=new SameWorkbookFile({lock:async(key,fn)=>navigator.locks?navigator.locks.request(key,fn):fn(),remember:saved=>store.put(saved.target,saved),onStatus:s=>{
 $('#fileState').textContent=s.text;$('#fileState').classList.toggle('green',s.kind==='saved');
 $('#resumeFile').hidden=!file.handle||!file.paused;$('#autoLabel').hidden=!file.handle;
 if(s.kind==='error'){$('#autoSave').checked=false;notify('Excel-frissítés megállt. A mentett napadatok az appban megmaradtak.');}
}});
const latest=new LatestWorkbook(makeSharedWorkbookBuilder(),async out=>{
 // A completed build may still belong to a save before the debounce interval.
 if(out.bookId!==data.bookId||out.month!==period||out.revision!==data.revision)return;
 output=out;dirtyBook=false;$('#bookState').textContent=`Munkafüzet frissítve az appban · ${out.revision}. verzió · 20 dolgozói fül`;
 $('#downloadBook').disabled=false;$('#connectFile').disabled=!canFile;$('#resumeFile').disabled=false;
 const identity=out.bookId+'|'+out.month;
 if(!file.handle&&restoredIdentity!==identity&&canFile){restoredIdentity=identity;try{const saved=await store.get(identity);if(out.bookId!==data.bookId||out.month!==period||out.revision!==data.revision)return;await file.restore(saved,out);}catch{} }
 if(out.bookId!==data.bookId||out.month!==period||out.revision!==data.revision)return;
 if($('#autoSave').checked&&file.connected){try{await file.write(out);}catch{} }
},error=>{$('#bookState').textContent='Az Excel nem készült el: '+error.message;$('#downloadBook').disabled=true;$('#connectFile').disabled=true;});
function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
const current=()=>data.records.find(r=>r.employee_id===employee&&r.work_date===date);
const person=()=>data.profiles.find(p=>p.id===employee);
const snapshot=()=>({...structuredClone(data),demo:true,month:period,records:structuredClone(data.records.filter(r=>r.work_date.slice(0,7)===period))});
function queueBook(){dirtyBook=true;output=null;$('#bookState').textContent=(blocked?'Napadatok csak ebben az ablakban':'Napadatok mentve ezen az eszközön')+' · a közös Excel frissül…';$('#downloadBook').disabled=$('#connectFile').disabled=$('#resumeFile').disabled=true;clearTimeout(buildTimer);buildTimer=setTimeout(()=>latest.request(snapshot()),250);}
function save(mutator,expectedVersion){
 if(!editor)throw Error('A bemutató másik ablaka szerkeszt. Ebben az ablakban az adatok csak megtekinthetők.');
 if(!blocked){const newest=localStorage.getItem(KEY);if(newest!==storedRaw){if(newest){data=validate(JSON.parse(newest));storedRaw=newest;render();queueBook();}throw Error('Másik ablak módosított. A friss adatok betöltve; add hozzá újra a tételt.');}}
 const selectedProfile=person();
 if(!selectedProfile||selectedProfile.active===false)throw Error('A dolgozó nem szerkeszthet.');
 const old=current();
 if(old&&old.status!=='draft')throw Error('Ez a nap beküldött vagy lezárt. Előbb vissza kell adni javításra.');
 if(expectedVersion!==undefined&&expectedVersion!==(old?.version??0))throw Error('A nap közben megváltozott. Frissítsd a javítást.');
 const rec=old?structuredClone(old):{employee_id:employee,work_date:date,version:0,status:'draft',payload:emptyPayload(),norms:normSnapshot()};
 mutator(rec.payload);calculate(rec.payload,rec.norms);
 const next={...data,revision:data.revision+1,records:replaceWorkday(data.records,rec,old?.version??0)};
 validate(next);data=next;
 if(!blocked){try{const raw=JSON.stringify(data);localStorage.setItem(KEY,raw);storedRaw=raw;}catch{blocked=true;$('#storageWarning').textContent='A böngésző nem tudja menteni az új adatokat. Ebben az ablakban megmaradtak; a próbaadatok mentése gombbal őrizd meg őket.';$('#storageWarning').hidden=false;}}
 render();queueBook();
 return current();
}
function metrics(){const r=current(),t=calculate(r?.payload??emptyPayload(),r?.norms),s=data.profiles.reduce((s,p)=>{const m=monthly(data.records,period,p.id);return {credited:s.credited+m.credited,days:s.days+m.records.length};},{credited:0,days:0});$('#kpis').innerHTML=`<div class="kpi"><small>${esc(person().worker_code)} · napi elszámolás</small><strong>${hrs(t.credited)} <em>óra</em></strong><small>${fmt(t.norm/100)} normaperc + ${fmt(t.other/100)} egyéb perc</small></div><div class="kpi"><small>Aznap felírt darab</small><strong>${t.upper} / ${t.lower} <em>db</em></strong><small>felső / alsó · ${t.accessory} kiegészítő</small></div><div class="kpi"><small>Teljes csapat · ${period}</small><strong>${hrs(s.credited)} <em>óra</em></strong><small>20 dolgozó · ${s.days} mentett próbanap</small></div>`;}
function entries(){const r=current(),p=r?.payload??emptyPayload();$('#entries').innerHTML=PRODUCTS.filter(x=>p.counts[x.id]).map(x=>`<div class="entry"><div>${esc(x.code)}<small>${fmt((p.counts[x.id]*r.norms[x.id])/100)} perc · ${column(Number(date.slice(-2))+3)+x.row} cella</small></div><strong>${p.counts[x.id]} db</strong><button data-minus="${x.id}" aria-label="${esc(x.code)} egy darab levonása" ${editor&&(!current()||current().status==='draft')?'':'disabled'}>−</button></div>`).join('')+DOWNTIME.filter(x=>p.downtime[x.id]).map(x=>`<div class="entry"><div>${esc(x.label)}</div><strong>${fmt(p.downtime[x.id]/100)} perc</strong><button data-clear-other="${x.id}" aria-label="${esc(x.label)} törlése" ${editor&&(!current()||current().status==='draft')?'':'disabled'}>×</button></div>`).join('')||'<p class="empty">Erre a napra még nincs felírt tétel.</p>';}
function sheet(){
 const host=$('#sheetHost'),left=host.scrollLeft,top=host.scrollTop;
 if(tab==='Osszesito'){
  const sums={work:0,credited:0,upper:0,lower:0,accessory:0};
  $('#sheetTitle').textContent='Összesítő · '+period;
  host.innerHTML=`<table class="sheet"><thead><tr><th>Dolgozó</th><th>Munkaóra</th><th>Elszámolt óra</th><th>Felső db</th><th>Alsó db</th><th>Kiegészítő db</th></tr></thead><tbody>${data.profiles.map(p=>{const m=monthly(data.records,period,p.id);for(const k of Object.keys(sums))sums[k]+=m[k];return `<tr data-summary-person="${p.id}"><th><button data-sheet="${esc(p.worker_code)}">${esc(p.worker_code)}<small>${esc(p.display_name)}</small></button></th><td>${hrs(m.work)}</td><td class="value">${hrs(m.credited)}</td><td>${m.upper}</td><td>${m.lower}</td><td>${m.accessory}</td></tr>`;}).join('')}<tr class="total"><th>Teljes csapat</th><td>${hrs(sums.work)}</td><td>${hrs(sums.credited)}</td><td>${sums.upper}</td><td>${sums.lower}</td><td>${sums.accessory}</td></tr></tbody></table>`;
 }else{
  const p=data.profiles.find(p=>p.worker_code===tab),m=monthly(data.records,period,p.id),byDay=new Map(m.records.map(r=>[Number(r.work_date.slice(-2)),r])),days=daysInMonth(period);
  $('#sheetTitle').textContent=p.worker_code+' · '+p.display_name;
  const line=(title,unit,get,sum,cls='',id='')=>`<tr class="${cls}" ${id?`data-product-row="${id}"`:''}><th>${esc(title)}<small>${esc(unit)}</small></th>${Array.from({length:days},(_,i)=>{const r=byDay.get(i+1),v=r?get(r):null;return `<td data-day="${i+1}" class="${v?'value':''} ${i+1===Number(date.slice(-2))?'chosen':''}">${v==null?'':fmt(v)}</td>`;}).join('')}<td class="value">${fmt(sum)}</td></tr>`;
  let rows=line('Munkaóra','óra',r=>r.payload.workCentiMinutes/6000,m.work/6000),group='';
  for(const x of [...PRODUCTS].sort((a,b)=>a.row-b.row)){if(group!==x.group){group=x.group;rows+=`<tr class="group"><th>${esc(group)}</th><td colspan="${days+1}"></td></tr>`;}rows+=line(x.code,fmt(x.rate/100)+' perc/db',r=>r.payload.counts[x.id]||0,m.records.reduce((s,r)=>s+(r.payload.counts[x.id]||0),0),'',x.id);}
  for(const x of DOWNTIME)rows+=line(x.label,'perc',r=>(r.payload.downtime[x.id]||0)/100,m.records.reduce((s,r)=>s+(r.payload.downtime[x.id]||0),0)/100);
  rows+=line('Felső darab','Excel Darab/Nap',r=>calculate(r.payload,r.norms).upper,m.upper,'total');rows+=line('Elszámolt idő','óra',r=>calculate(r.payload,r.norms).credited/6000,m.credited/6000,'total');
  host.innerHTML=`<table class="sheet"><thead><tr><th>Termék / jogcím</th>${Array.from({length:days},(_,i)=>`<th>${i+1}.</th>`).join('')}<th>Összesen</th></tr></thead><tbody>${rows}</tbody></table>`;
 }
 host.scrollLeft=left;host.scrollTop=top;
 $('#sheetTabs').innerHTML=['Osszesito',...data.profiles.map(p=>p.worker_code)].map(x=>`<button class="${tab===x?'active':''}" data-sheet="${x}" aria-pressed="${tab===x}">${x==='Osszesito'?'Összesítő':x}</button>`).join('');
}
function render(){metrics();entries();sheet();quick?.refresh();$('#filename').textContent=workbookFilename(period);const readOnly=!editor||!!current()&&current().status!=='draft';$('#workHours').disabled=readOnly;$('#otherForm').querySelectorAll('button,input,select').forEach(e=>e.disabled=readOnly);}
function setPeriod(next,dateValue){
 if(!validMonth(next)||!validDate(dateValue))throw Error('Érvénytelen dátum.');
 if(period!==next){file.disconnect();$('#autoSave').checked=false;restoredIdentity='';}
 period=next;date=dateValue;$('#month').value=period;$('#workDate').value=date;$('#workHours').value=fmt((current()?.payload.workCentiMinutes??48000)/6000);render();queueBook();
}
$('#employee').innerHTML=data.profiles.map(p=>`<option value="${p.id}">${esc(p.worker_code+' · '+p.display_name)}</option>`).join('');
$('#otherCategory').innerHTML=DOWNTIME.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join('');
$('#month').value=period;$('#workDate').value=date;$('#workHours').value=fmt((current()?.payload.workCentiMinutes??48000)/6000);
// All three views and the correction buttons below use this one product operation path.
const entryContext=()=>({employeeId:employee,workerCode:person()?.worker_code,date,storageSaved:!blocked,editable:editor&&person()?.active!==false});
entryController=createEntryController({getContext:entryContext,getRecord:current,commitRecord:(r,v)=>save(p=>Object.assign(p,r.payload),v)});
let preferenceStorage;try{preferenceStorage=window.localStorage;}catch{preferenceStorage={getItem(){throw Error('storage');},setItem(){throw Error('storage');}};}
quick=createEntryModes($('#quickEntryHost'),{getContext:entryContext,getRecord:current,controller:entryController,storage:preferenceStorage,scope:data.bookId,onNotice:notify});
$('#fileHelp').textContent=canFile?'Egyszer válassz egy új, külön Excel-célfájlt. Ezután ugyanaz a fájl frissül, amíg az app nyitva van és engedélyezett a visszaírás. Meglévő kézzel vezetett Excelt nem írunk felül.':'Ebben a böngészőben nincs biztonságos közvetlen fájlvisszaírás. Az app munkafüzete frissül; a Letöltés csak pillanatkép. A fájlcsatlakoztatás támogatott asztali böngészőben érhető el.';
$('#employee').addEventListener('change',()=>{employee=$('#employee').value;tab=person().worker_code;$('#workHours').value=fmt((current()?.payload.workCentiMinutes??48000)/6000);render();});
$('#month').addEventListener('change',()=>{try{setPeriod($('#month').value,$('#month').value+'-01');}catch(e){notify(e.message);$('#month').value=period;}});
$('#workDate').addEventListener('change',()=>{try{const d=$('#workDate').value;setPeriod(d.slice(0,7),d);}catch(e){notify(e.message);$('#workDate').value=date;}});
$('#workHours').addEventListener('change',()=>{try{save(p=>p.workCentiMinutes=decimal($('#workHours').value,4800)*60);}catch(e){notify(e.message);$('#workHours').value=fmt((current()?.payload.workCentiMinutes??48000)/6000);}});
$('#otherForm').addEventListener('submit',e=>{e.preventDefault();try{const id=$('#otherCategory').value,n=decimal($('#otherMinutes').value);if(!n)throw Error('Nullánál több percet adj meg.');save(p=>p.downtime[id]=(p.downtime[id]||0)+n);notify('Percek elmentve ugyanahhoz a munkanaphoz.');}catch(e){notify(e.message);}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{
 if(b.dataset.sheet){tab=b.dataset.sheet;sheet();return;}
 if(b.dataset.minus){const p=PRODUCTS.find(x=>x.id===b.dataset.minus);if(!p)throw Error('Ismeretlen termék.');entryController.run({kind:'decrement',productId:p.id,position:p.position});render();return;}
 if(b.dataset.clearOther){save(p=>delete p.downtime[b.dataset.clearOther]);return;}
}catch(err){notify(err.message);}});
$('#showSummary').addEventListener('click',()=>{tab='Osszesito';sheet();});
$('#downloadBook').addEventListener('click',()=>{if(!output||dirtyBook)return;saveXlsx(output.bytes,output.filename);notify('A munkafüzet pillanatképének letöltése elindult. Ez nem fájlszinkron.');});
$('#connectFile').addEventListener('click',async()=>{
 if(!canFile||!output||dirtyBook)return;
 const out=output;try{
  // Pick before any asynchronous preparation: browsers require a user gesture.
  const handle=await window.showSaveFilePicker({id:'muszaknaplo-shared',suggestedName:out.filename,types:[{description:'Műszaknapló közös Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
  if(!output||out.bookId!==output.bookId||out.month!==period)throw Error('A hónap közben megváltozott; válassz célfájlt az új hónaphoz.');
  const result=await file.attach(handle,output);if(result.status!=='saved'&&result.status!=='unchanged')return;
  $('#autoSave').checked=true;$('#autoLabel').hidden=false;notify('A célfájl csatlakoztatva. A következő mentések ugyanazt az Excelt frissítik.');
 }catch(e){if(e.name!=='AbortError')notify(e.message);}
});
$('#resumeFile').addEventListener('click',async()=>{if(!output||dirtyBook)return;try{await file.resume(output);$('#autoSave').checked=true;}catch(e){notify(e.message);}});
$('#autoSave').addEventListener('change',async()=>{if($('#autoSave').checked&&output&&!dirtyBook){try{await file.resume(output);}catch(e){$('#autoSave').checked=false;notify(e.message);}}});
$('#backupData').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'muszaknaplo-three-modes-demo',data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Muszaknaplo_harom_nezet_probaadatok.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});
window.addEventListener('storage',e=>{if(e.key!==KEY||blocked)return;try{data=validate(JSON.parse(e.newValue));storedRaw=e.newValue;$('#workHours').value=fmt((current()?.payload.workCentiMinutes??48000)/6000);render();queueBook();}catch{notify('A másik ablak változása nem olvasható. A mostani adatokat megtartottuk.');}});
// One editor tab per demo workbook. A second tab may observe storage updates only.
if(navigator.locks){editor=false;let release;const untilClosed=new Promise(r=>release=r);addEventListener('pagehide',()=>release(),{once:true});navigator.locks.request('muszaknaplo-editor-'+data.bookId,{ifAvailable:true},async lock=>{if(!lock){$('#storageWarning').hidden=false;$('#storageWarning').textContent='A bemutató másik ablaka szerkeszt. Ez az ablak csak megtekintésre használható.';render();return;}editor=true;render();await untilClosed;});}
render();queueBook();
