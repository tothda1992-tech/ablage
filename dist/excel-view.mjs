import {PRODUCTS,DOWNTIME} from './catalog.mjs';
import {localRecords,reportData,makeOriginalWorkbook,saveXlsx,XLSX_MIME} from './excel-export.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(n,d=2)=>new Intl.NumberFormat('hu-HU',{maximumFractionDigits:d}).format(n);
const date=new Date(),current=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`,param=new URLSearchParams(location.search).get('month');
$('#excelMonth').value=/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(param||'')?param:current;
let previous='',snapshot=null,bytes=null,generation=0,fileHandle=null,fileKey='',writeChain=Promise.resolve();
function status(s,error=false){$('#status').textContent=s;$('#status').classList.toggle('error',error);}
function disconnect(){fileHandle=null;fileKey='';$('#disconnectFile').hidden=true;$('#fileStatus').textContent='Nincs fájl összekötve.';}
async function writeAttached(content,key,version){
 if(!fileHandle||key!==fileKey)return;const handle=fileHandle;
 writeChain=writeChain.catch(()=>{}).then(async()=>{
  if(handle!==fileHandle||version!==generation)return;
  if(await handle.queryPermission({mode:'readwrite'})!=='granted')throw Error('A fájl írásához új engedély kell. Válaszd ki újra.');
  const writer=await handle.createWritable();try{await writer.write(content);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
  $('#fileStatus').textContent='A kiválasztott fájl frissítve: '+handle.name+' · '+new Date().toLocaleTimeString('hu-HU');
 }).catch(e=>{$('#fileStatus').textContent='A fájl frissítése nem sikerült: '+e.message;});
 return writeChain;
}
function render(data){
 const {profile,month,days,byDay,sum}=data;
 $('#sheetTitle').textContent=profile.display_name+' · '+month;
 $('#summary').innerHTML='<div class="metrics">'+[['Elszámolt idő',fmt(sum.credited/6000)+' óra','norma + egyéb idő'],['Rögzített munkanapok',data.records.length,`felső: ${sum.upper} · alsó: ${sum.lower}`],['Megadott munkaidő',fmt(sum.work/6000)+' óra',sum.missingWork?sum.missingWork+' napon nincs megadva':'csak a mentett napok']].map(([label,value,note])=>`<div class="metric"><small>${esc(label)}</small><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('')+'</div>';
 function row(label,rate,get,total,cls=''){return `<tr class="${cls}"><th scope="row">${esc(label)}</th><td>${rate===null?'':esc(fmt(rate))}</td>${Array.from({length:days},(_,i)=>{const r=byDay.get(i+1),v=r?get(r):null;return `<td class="${v?'filled':''}">${v===null?'':esc(fmt(v))}</td>`;}).join('')}<td>${esc(fmt(total))}</td></tr>`;}
 let rows=row('Munkaóra / Arb.std',null,r=>r.payload.workCentiMinutes===null?null:r.payload.workCentiMinutes/6000,sum.work/6000,'work'),group='';
 for(const p of PRODUCTS.slice().sort((a,b)=>Number(a.sourceCell.match(/\d+$/)[0])-Number(b.sourceCell.match(/\d+$/)[0]))){
  if(p.group!==group){group=p.group;rows+=`<tr class="group"><th>${esc(group)}</th><td colspan="${days+2}"></td></tr>`;}
  rows+=row(p.code,p.normCentiMinutes/100,r=>r.payload.counts[p.id]||0,data.records.reduce((s,r)=>s+(r.payload.counts[p.id]||0),0));
 }
 rows+=row('Darab / Nap (felső)',null,r=>PRODUCTS.filter(p=>p.position==='upper').reduce((s,p)=>s+(r.payload.counts[p.id]||0),0),sum.upper,'total');
 rows+=`<tr class="group"><th>Állás + egyéb – percben</th><td colspan="${days+2}"></td></tr>`;
 for(const p of DOWNTIME)rows+=row(p.label,null,r=>(r.payload.downtime[p.id]||0)/100,data.records.reduce((s,r)=>s+(r.payload.downtime[p.id]||0),0)/100);
 rows+=row('Brazil (külön jelölés)',null,r=>r.payload.brazilCount||0,sum.brazil);
 rows+=row('Elszámolt idő – óra',null,r=>data.daily.find(d=>d.date===r.work_date).credited/6000,sum.credited/6000,'total');
 $('#matrix').innerHTML=`<table><thead><tr><th>Termék / jogcím</th><th>Perc/db</th>${Array.from({length:days},(_,i)=>'<th>'+(i+1)+'.</th>').join('')}<th>Összesen</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function refresh(force=false){
 try{
  const month=$('#excelMonth').value,raw=localStorage.getItem('muszaknaplo.data.v1');
  if(!raw){status('Még nincs mentett munkanap. A napi rögzítésben adj hozzá néhány darabot.');$('#downloadExcel').disabled=true;return;}
  const key=month+'|'+raw;if(!force&&key===previous)return;previous=key;bytes=null;$('#downloadExcel').disabled=true;const v=++generation;
  const x=localRecords(JSON.parse(raw)),data=reportData(x.profile,month,x.records);snapshot={...x,month};
  if(fileHandle&&fileKey!==month+'|'+x.profile.display_name)disconnect();render(data);status('A táblázat frissült. A kitöltött Excel előkészítése…');
  const content=await makeOriginalWorkbook(x.profile,month,x.records);if(v!==generation)return;bytes=content;$('#downloadExcel').disabled=false;
  status('A kitöltött Excel elkészült az utolsó sikeresen mentett adatokból. Másik eszközre még nincs továbbítva.');await writeAttached(content,month+'|'+x.profile.display_name,v);
 }catch(e){previous='';bytes=null;$('#downloadExcel').disabled=true;status(e.message,true);}
}
$('#excelMonth').addEventListener('change',()=>{disconnect();refresh(true);});
$('#downloadExcel').addEventListener('click',()=>{if(bytes&&snapshot)saveXlsx(bytes,`Muszaknaplo_${snapshot.month}.xlsx`);});
$('#disconnectFile').addEventListener('click',disconnect);
if(typeof window.showSaveFilePicker==='function'){
 $('#directFilePanel').hidden=false;
 $('#connectFile').addEventListener('click',async()=>{
  if(!bytes||!snapshot)return;try{
   const h=await window.showSaveFilePicker({suggestedName:`Muszaknaplo_${snapshot.month}.xlsx`,types:[{description:'Excel-munkafüzet',accept:{[XLSX_MIME]:['.xlsx']}}]});
   fileHandle=h;fileKey=snapshot.month+'|'+snapshot.profile.display_name;$('#disconnectFile').hidden=false;await writeAttached(bytes,fileKey,generation);
  }catch(e){if(e.name!=='AbortError')$('#fileStatus').textContent=e.message;}
 });
}
window.addEventListener('storage',e=>{if(e.key==='muszaknaplo.data.v1')refresh();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},2000);refresh();
