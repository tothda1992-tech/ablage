/** Connected staging client. No demo role switching, fake login, or embedded passwords. */
import {PILOT_CONFIG} from './pilot-config.mjs';
import {createSessionClient} from './team-access.mjs';
import {createPilotApi,pilotConfigValid} from './pilot-api.mjs';
import {createDurableWorkdays,durableKey} from './durable-workdays.mjs';
import {createEntryController} from './entry-modes-core.mjs';
import {createEntryModes} from './entry-modes.mjs';
import {PRODUCTS,DOWNTIME,today,validDate,emptyPayload,calculate,decimal,count,monthly,daysInMonth,STATUS} from '../team-core.mjs';
import {readSharedManifest,workbookFilename} from './shared-workbook.mjs';
import {SameWorkbookFile,fileHandleStore} from './same-workbook-file.mjs';
import {saveXlsx} from '../excel-export.mjs';
const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=2)=>new Intl.NumberFormat('hu-HU',{maximumFractionDigits:d}).format(n),hours=n=>fmt(n/6000);
let actor=null,api=null,queue=null,entry=null,date=today(),people=[],remote=[],selected='',locked=false,releaseLock=null,syncing=false,bookOutput=null,bookBusy=false,file=null,store=null,pollTimer=null,syncTimer=null,toastTimer=null,conflict=null,epoch=0,lastBookAttempt=0,restoredFileTarget=null;
let storage;try{storage=localStorage;}catch{}
const project=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(PILOT_CONFIG.url)?new URL(PILOT_CONFIG.url).hostname.split('.')[0]:'unconfigured';
const session=createSessionClient(PILOT_CONFIG,{onClear:clearSession});
function clearSession(){
 epoch++;clearTimeout(syncTimer);clearInterval(pollTimer);queue?.close();queue=null;entry=null;actor=null;api=null;people=[];remote=[];selected='';bookOutput=null;bookBusy=false;syncing=false;restoredFileTarget=null;file?.disconnect();file=null;store=null;releaseLock?.();releaseLock=null;locked=false;
 $('#signedIn').hidden=true;$('#loginSection').hidden=false;$('#entryHost').innerHTML='';$('#sheetHost').innerHTML='';$('#managerDays').innerHTML='';$('#employeeSelect').innerHTML='';$('#actorName').textContent='';$('#kpis').innerHTML='';$('#conflictDialog').close();$('#conflictDetails').innerHTML='';conflict=null;
}
function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
function error(e){$('#message').textContent=e.message||String(e);$('#message').hidden=false;}
function current(){if(actor?.role==='employee'&&queue)return queue.record(date);return remote.find(r=>r.employee_id===selected&&r.work_date===date)??null;}
function allRecords(){if(actor?.role==='employee'&&queue)return Object.keys(queue.inspect().days).map(d=>queue.record(d));return remote;}
function ctx(){return {employeeId:actor?.id??'signed-out',date,editable:!!queue&&locked&&queue.editable(date)};}
function assertEpoch(e){if(e!==epoch||!actor)throw Error('A munkamenet megváltozott.');}
async function lockFor(key){
 if(!navigator.locks||!storage)return false;
 return new Promise(resolve=>{navigator.locks.request(key,{ifAvailable:true},async lock=>{if(!lock){resolve(false);return;}let done;const wait=new Promise(r=>done=r);releaseLock=done;resolve(true);await wait;}).catch(()=>resolve(false));});
}
function requestSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync().catch(error),350);}
function updateView(){
 if(!actor)return;const r=current(),t=calculate(r?.payload??emptyPayload(),r?.norms);const p=people.find(p=>p.id===selected)??actor;
 $('#kpis').innerHTML=`<div class="kpi"><small>Napi elszámolt idő</small><strong>${hours(t.credited)} <em>óra</em></strong><small>${fmt(t.norm/100)} normaperc + ${fmt(t.other/100)} egyéb perc</small></div><div class="kpi"><small>Felső / alsó</small><strong>${t.upper} / ${t.lower} <em>db</em></strong><small>${t.accessory} kiegészítő</small></div><div class="kpi"><small>Munkanap állapota</small><strong style="font-size:22px">${esc(r?STATUS[r.status]:'Nincs mentve')}</strong><small>${esc(p.worker_code)} · ${date}</small></div>`;
 if(actor.role==='employee'){
  const s=queue?.status(date)??{kind:'error',text:'Másik ablak szerkeszt, vagy nem érhető el a helyi mentés.'};const pending=queue?.pendingCount()??0;
  $('#syncState').className='pilot-sync '+(s.kind==='pending'?'pending':['empty','synced'].includes(s.kind)?'':'error');$('#syncState').textContent=s.text+(pending?` ${pending} nap vár központi visszaigazolásra.`:'');
  $('#submitDay').disabled=!queue?.editable(date)||!r;$('#retry').disabled=!locked;$('#showConflict').hidden=!['conflict','denied','invalid'].includes(s.kind);
  $('#workHours').disabled=!queue?.editable(date);for(const control of $('#otherForm').elements)control.disabled=!queue?.editable(date);for(const control of $('#notesForm').elements)control.disabled=!queue?.editable(date);
  entry?.refresh();
 }else{$('#syncState').className='pilot-sync';$('#syncState').textContent='Vezetői nézet · csak a központból lekért adatokat mutatja.';}
 for(const [id,value] of [['workHours',fmt((r?.payload.workCentiMinutes??48000)/6000)],['brazil',r?.payload.brazilCount??0],['spoiler',r?.payload.spoiler??''],['note',r?.payload.note??'']]){const el=$('#'+id);if(document.activeElement!==el)el.value=value;}
 renderSheet();if(actor.role==='manager')renderManager();$('#connectionState').textContent=navigator.onLine?'Online · bejelentkezett próba':'Nincs internet · a központi visszaigazolás várakozik';
}
function renderSheet(){
 const month=date.slice(0,7),n=daysInMonth(month),records=allRecords().filter(r=>r.employee_id===selected&&r.work_date.startsWith(month)),by=new Map(records.map(r=>[Number(r.work_date.slice(-2)),r]));
 const row=(label,get,kind='')=>{let sum=0;return `<tr><th>${esc(label)}</th>${Array.from({length:n},(_,i)=>{const r=by.get(i+1),v=r?get(r):null;if(typeof v==='number')sum+=v;return `<td class="${v?'filled':''}">${v==null?'':typeof v==='number'?fmt(v):esc(v)}</td>`;}).join('')}<td class="sum">${kind==='text'?'':fmt(sum)}</td></tr>`;};
 const used=PRODUCTS.filter(p=>records.some(r=>r.payload.counts[p.id]));const rows=row('Munkaóra',r=>r.payload.workCentiMinutes/6000)+used.map(p=>row(p.code,r=>r.payload.counts[p.id]??0)).join('')+DOWNTIME.filter(p=>records.some(r=>r.payload.downtime[p.id])).map(p=>row(p.label+' (perc)',r=>(r.payload.downtime[p.id]??0)/100)).join('')+row('Elszámolt óra',r=>calculate(r.payload,r.norms).credited/6000)+row('Állapot',r=>STATUS[r.status],'text');
 $('#sheetTitle').textContent=(people.find(p=>p.id===selected)?.display_name??actor.display_name)+' · '+month;
 $('#sheetHost').innerHTML=`<table class="pilot-table"><thead><tr><th>Termék / jogcím</th>${Array.from({length:n},(_,i)=>`<th>${i+1}.</th>`).join('')}<th>Összesen</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderManager(){
 const rows=remote.filter(r=>r.work_date.startsWith(date.slice(0,7))).sort((a,b)=>b.work_date.localeCompare(a.work_date)||a.employee_id.localeCompare(b.employee_id));
 $('#managerDays').innerHTML=rows.map(r=>`<div class="pilot-day"><div><strong>${esc(people.find(p=>p.id===r.employee_id)?.display_name??r.employee_id)}</strong><small>${r.work_date} · ${esc(STATUS[r.status])} · ${hours(calculate(r.payload,r.norms).credited)} óra · v${r.version}</small></div>${r.status==='submitted'?`<button class="primary" data-decision="approve" data-person="${r.employee_id}" data-date="${r.work_date}">Jóváhagyás</button>`:''}${r.status!=='draft'?`<button data-decision="reopen" data-person="${r.employee_id}" data-date="${r.work_date}">Visszaadás javításra</button>`:''}</div>`).join('')||'<p class="muted">Ebben a hónapban még nincs központba mentett munkanap.</p>';
}
async function sync({force=false}={}){
 if(syncing||!actor||!navigator.onLine)return;const e=epoch,a=api;syncing=true;
 try{
  if(queue&&locked)await queue.flush(f=>a.send(f),{force});assertEpoch(e);
  const data=await a.month(date.slice(0,7));assertEpoch(e);remote=data;
  if(queue&&locked)queue.hydrate(data);updateView();$('#lastRead').textContent='Központi lekérés: '+new Date().toLocaleTimeString('hu-HU');
  if(actor.role==='manager')await updateBook();
 }catch(err){if(e===epoch)error(err);}finally{if(e===epoch)syncing=false;}
}
async function updateBook(manual=false){
 if(!actor||actor.role!=='manager'||bookBusy)return;const e=epoch,a=api,month=date.slice(0,7);bookBusy=true;
 try{
  let j=await a.job(month);assertEpoch(e);if(month!==date.slice(0,7))return;
  if(!j||j.generation!==j.processed_generation){
   $('#bookState').textContent='Az adatok központban vannak · a közös Excel frissítésre vár.';$('#downloadBook').disabled=true;$('#connectFile').disabled=true;
   // This pilot uses foreground authenticated refresh. Cron is not enabled.
   if(manual||Date.now()-lastBookAttempt>30000){lastBookAttempt=Date.now();await a.book(month,'refresh');assertEpoch(e);j=await a.job(month);assertEpoch(e);}
  }
  if(!j||j.generation!==j.processed_generation)return;
  if(!bookOutput||bookOutput.month!==month||bookOutput.revision!==j.generation){
   const blob=await a.book(month,'download');assertEpoch(e);const bytes=new Uint8Array(await blob.arrayBuffer());assertEpoch(e);if(month!==date.slice(0,7))return;
   const m=readSharedManifest(bytes);if(!m||m.workspace!==actor.workspace_id||m.bookId!==actor.workspace_id||m.month!==month||m.revision<j.generation)throw Error('A központi Excel azonosítója vagy verziója nem egyezik.');
   bookOutput={...m,bytes,filename:workbookFilename(month)};
   const target=m.bookId+'|'+month;
   if(store&&file&&restoredFileTarget!==target){restoredFileTarget=target;try{const saved=await store.get(target);assertEpoch(e);if(month===date.slice(0,7)&&saved)await file.restore(saved,bookOutput);}catch(err){assertEpoch(e);}}
   if($('#autoSave').checked&&file?.connected)await file.write(bookOutput);assertEpoch(e);
  }
  $('#bookState').textContent=`Központi Excel naprakész · ${bookOutput.revision}. verzió · ugyanaz a havi mesterpéldány.`;$('#filename').textContent=workbookFilename(month);$('#downloadBook').disabled=false;$('#connectFile').disabled=!window.showSaveFilePicker||!navigator.locks;
 }catch(err){if(e===epoch){$('#bookState').textContent='Excel-frissítés nem igazolt: '+err.message;$('#downloadBook').disabled=true;$('#connectFile').disabled=true;}}
 finally{if(e===epoch)bookBusy=false;}
}
async function signIn(code,password){
 const p=await session.signIn(code,password);actor=p;selected=p.id;api=createPilotApi(session,()=>actor);const e=epoch;
 const readiness=await api.rpc('pilot_readiness',{});assertEpoch(e);if(readiness.schema_version!==7||readiness.environment!=='staging')throw Error('A próbaháttér telepítése még nem teljes.');
 people=await api.profiles();assertEpoch(e);if(actor.role==='manager')selected=people.find(p=>p.role==='employee')?.id??'';
 if(actor.role==='employee'){
  locked=await lockFor(durableKey(project,actor));assertEpoch(e);
  if(locked){queue=createDurableWorkdays({storage,project,getActor:()=>actor,canWrite:()=>locked,onChange:()=>{updateView();}});queue.retryAuth();}
  entry=createEntryModes($('#entryHost'),{getContext:ctx,getRecord:current,storage,scope:'pilot-'+project,controller:createEntryController({getContext:ctx,getRecord:current,commitRecord:(r,version)=>{const result=queue.commit(date,r.payload,version);requestSync();return result;}}),onNotice:notify});
 }else{
  store=fileHandleStore('muszaknaplo.pilot.file.v1.'+project+'.'+actor.id);
  file=new SameWorkbookFile({lock:(key,fn)=>navigator.locks.request(key,fn),remember:s=>store.put(s.target,s),onStatus:s=>{if(!actor)return;$('#fileState').textContent=s.text;$('#autoLabel').hidden=!file?.handle;$('#resumeFile').hidden=!file?.paused;if(s.kind==='error')$('#autoSave').checked=false;}});
 }
 $('#actorName').textContent=actor.display_name+' · '+actor.worker_code;$('#actorRole').textContent=actor.role==='manager'?'Vezetői teszthozzáférés':'Dolgozói teszthozzáférés';
 $('#workerPicker').hidden=actor.role!=='manager';$('#employeeArea').hidden=actor.role!=='employee';$('#managerArea').hidden=actor.role!=='manager';$('#hourLabel').hidden=actor.role!=='employee';
 $('#employeeSelect').innerHTML=people.filter(p=>p.role==='employee').map(p=>`<option value="${p.id}">${esc(p.worker_code+' · '+p.display_name)}</option>`).join('');$('#employeeSelect').value=selected;
 $('#loginSection').hidden=true;$('#signedIn').hidden=false;$('#message').hidden=true;updateView();await sync({force:true});assertEpoch(e);pollTimer=setInterval(()=>{if(document.visibilityState!=='hidden')sync().catch(error);},15000);
}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;$('#loginError').hidden=true;
 try{await signIn(f.elements.code.value,f.elements.password.value);}catch(err){session.clear();$('#loginError').textContent=err.message;$('#loginError').hidden=false;}finally{f.elements.password.value='';b.disabled=false;}});
$('#logout').addEventListener('click',async()=>{if(queue?.pendingCount()&&!confirm('Van még központba nem küldött módosítás. A sor ezen a készüléken megmarad, de elküldéséhez ugyanazzal a fiókkal újra be kell lépned. Kijelentkezel?'))return;const ok=await session.signOut();notify(ok?'Kijelentkeztél.':'A helyi munkamenet lezárult. A szerveroldali kijelentkezést internet nélkül nem tudtuk igazolni.');});
$('#reloadData').onclick=()=>sync({force:true});$('#retry').onclick=()=>sync({force:true});$('#refreshBook').onclick=()=>updateBook(true);
$('#workDate').value=date;$('#workDate').addEventListener('change',()=>{if(!validDate($('#workDate').value)){$('#workDate').value=date;return;}const oldMonth=date.slice(0,7);date=$('#workDate').value;if(date.slice(0,7)!==oldMonth){bookOutput=null;file?.disconnect();restoredFileTarget=null;$('#autoSave').checked=false;}updateView();sync();});
$('#employeeSelect').addEventListener('change',()=>{selected=$('#employeeSelect').value;updateView();});
function editPayload(fn){if(!queue)return;const r=current(),p=structuredClone(r?.payload??emptyPayload());fn(p);queue.commit(date,p,r?.version??0);requestSync();}
$('#workHours').addEventListener('change',()=>{try{editPayload(p=>p.workCentiMinutes=decimal($('#workHours').value,4800)*60);}catch(e){error(e);$('#workHours').value=fmt((current()?.payload.workCentiMinutes??48000)/6000);}});
$('#otherCategory').innerHTML=DOWNTIME.map(p=>`<option value="${p.id}">${esc(p.label)}</option>`).join('');
$('#otherForm').addEventListener('submit',e=>{e.preventDefault();try{editPayload(p=>{const id=$('#otherCategory').value;p.downtime[id]=(p.downtime[id]??0)+decimal($('#otherMinutes').value);});notify('Az egyéb percek a telefonon mentve.');}catch(e){error(e);}});
$('#notesForm').addEventListener('submit',e=>{e.preventDefault();try{editPayload(p=>{p.brazilCount=count($('#brazil').value);p.note=$('#note').value;p.spoiler=$('#spoiler').value;});notify('A feljegyzés a telefonon mentve.');}catch(e){error(e);}});
$('#submitDay').addEventListener('click',()=>{if(!confirm('Beküldöd ezt a napot? A visszaigazolt beküldés után csak vezetői visszaadással javítható.'))return;try{queue.requestSubmit(date);requestSync();}catch(e){error(e);}});
$('#backup').onclick=()=>{if(queue){const url=URL.createObjectURL(new Blob([queue.exportBackup()],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Muszaknaplo_sajat_fuggo_sor_'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
$('#managerDays').addEventListener('click',async e=>{const b=e.target.closest('[data-decision]');if(!b)return;const row=remote.find(r=>r.employee_id===b.dataset.person&&r.work_date===b.dataset.date);if(!row)return;let reason='';if(b.dataset.decision==='reopen'){reason=prompt('Miért adod vissza javításra? (3–1000 karakter)');if(reason===null)return;if(reason.trim().length<3||reason.length>1000)return error(Error('3–1000 karakteres indok szükséges.'));}else if(!confirm('Jóváhagyod a kiválasztott napot?'))return;const n=epoch;b.disabled=true;try{await api.decide(row,b.dataset.decision,reason);assertEpoch(n);notify('A vezetői döntést a központ mentette.');}catch(err){if(n===epoch)error(err);}finally{if(n===epoch){b.disabled=false;await sync();}}});
$('#downloadBook').onclick=()=>{if(bookOutput&&actor?.role==='manager')saveXlsx(bookOutput.bytes,bookOutput.filename);};
$('#connectFile').onclick=async()=>{const out=bookOutput,n=epoch;if(!out||actor?.role!=='manager')return;try{const handle=await window.showSaveFilePicker({suggestedName:out.filename,types:[{description:'Közös havi Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});assertEpoch(n);await file.attach(handle,out);assertEpoch(n);$('#autoLabel').hidden=false;$('#autoSave').checked=true;}catch(e){if(e.name!=='AbortError'&&n===epoch)error(e);}};
$('#resumeFile').onclick=()=>{if(file&&bookOutput)file.resume(bookOutput).catch(error);};
$('#autoSave').onchange=()=>{if($('#autoSave').checked&&file?.connected&&bookOutput)file.write(bookOutput).catch(error);};
$('#showConflict').onclick=async()=>{try{const n=epoch,requested=date,rows=await api.month(date.slice(0,7));assertEpoch(n);if(date!==requested)return;const r=rows.find(r=>r.employee_id===actor.id&&r.work_date===date);if(!r)throw Error('Nincs lekérhető központi nap; a mentési sor exportjával kérj ellenőrzést.');conflict={date,remote:r};const local=current().payload;const list=PRODUCTS.filter(p=>(local.counts[p.id]??0)!==(r.payload.counts[p.id]??0));$('#conflictDetails').innerHTML=`<table><tr><th>Tétel</th><th>Helyi</th><th>Központi</th></tr>${list.map(p=>`<tr><td>${esc(p.code)}</td><td>${local.counts[p.id]??0}</td><td>${r.payload.counts[p.id]??0}</td></tr>`).join('')}<tr><td>Munkaóra</td><td>${hours(local.workCentiMinutes)}</td><td>${hours(r.payload.workCentiMinutes)}</td></tr></table><p>Egész napi változatot választasz: az egyéb idők és a megjegyzések is ebbe tartoznak.</p><details><summary>Teljes napi adatok összehasonlítása</summary><pre>${esc(JSON.stringify({helyi:local,kozponti:r.payload},null,2))}</pre></details>`;$('#useLocal').disabled=r.status!=='draft';$('#conflictDialog').showModal();}catch(e){error(e);}};
for(const [id,choice] of [['useRemote','remote'],['useLocal','local']])$('#'+id).onclick=()=>{try{if(!conflict||conflict.date!==date)throw Error('A nap megváltozott. Nyisd újra az összehasonlítást.');if(!confirm(choice==='remote'?'A helyi eltérő napot lecseréled a megjelenített központi változatra?':'Az egész helyi napot küldöd be a megjelenített központi nap helyett?'))return;queue.resolve(date,choice,conflict.remote);$('#conflictDialog').close();conflict=null;requestSync();}catch(e){error(e);}};
$('#cancelConflict').onclick=()=>{$('#conflictDialog').close();conflict=null;};
window.addEventListener('online',()=>{updateView();sync({force:true});});window.addEventListener('offline',updateView);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
window.addEventListener('pagehide',()=>session.clear());
const ready=pilotConfigValid(PILOT_CONFIG);$('#loginForm').hidden=!ready;$('#setupState').textContent=ready?'A Supabase-próbaháttér beállítva. Belépés csak külön létrehozott és aktivált tesztfiókkal. A próbafiókok még előkészítésre várnak.':'A közös próba még nincs csatlakoztatva a Supabase-háttérhez. Ez az oldal nem színlel bejelentkezést vagy kétkészülékes mentést.';
if('serviceWorker' in navigator&&location.protocol==='https:'&&ready&&location.pathname.includes('/kozos-proba/'))navigator.serviceWorker.register('./pilot-sw.js',{scope:'./'}).catch(()=>{});
