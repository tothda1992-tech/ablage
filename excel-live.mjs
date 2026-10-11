import {localRecords,makeOriginalWorkbook,saveXlsx} from './excel-export.mjs';
const KEY='muszaknaplo.data.v1';
let last='',timer,busy=false,again=false,cache=null;
const panel=document.createElement('section');panel.className='excel-link-panel';
panel.innerHTML='<div><strong>A saját havi táblázatod</strong><p id="excelAutoStatus" role="status">A mentett napokból készül, a Toth.xlsx elrendezésében.</p></div><div><a class="button secondary" id="excelOpen" href="./excel.html">Havi táblázat / Excel</a><button class="button primary" id="excelDownload" type="button">Excel letöltése</button></div>';
const host=document.getElementById('viewHost');if(host)host.before(panel);
const style=document.createElement('style');style.textContent='.excel-link-panel{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;margin:0 0 22px;border:1px solid #b7cda5;border-radius:13px;background:#f2f7ec}.excel-link-panel strong{color:#174c3c}.excel-link-panel p{font-size:11px;margin:4px 0 0;color:#5d6d54}.excel-link-panel>div:last-child{display:flex;flex-wrap:wrap;gap:8px}@media print{.excel-link-panel{display:none}}';document.head.append(style);
function currentMonth(){return document.getElementById('historyMonth')?.value||document.getElementById('dayDate')?.value?.slice(0,7)||new Date().toISOString().slice(0,7);}
function snapshot(){const raw=localStorage.getItem(KEY);if(!raw)throw Error('Még nincs mentett munkanap. Előbb írj fel néhány darabot.');return {raw,...localRecords(JSON.parse(raw)),month:currentMonth()};}
function message(s){const n=document.getElementById('excelAutoStatus');if(n)n.textContent=s;}
async function synchronize(){
 if(busy){again=true;return;}busy=true;
 try{
  document.getElementById('excelOpen').href='./excel.html?month='+encodeURIComponent(currentMonth());
  const s=snapshot(),signature=s.month+'|'+s.raw;
  if(signature===last)return;
  message('A havi Excel kitöltése…');const bytes=await makeOriginalWorkbook(s.profile,s.month,s.records);
  cache={signature,bytes,name:`Muszaknaplo_${s.month}.xlsx`};last=signature;
  message('Excel elkészítve a mentett adatokból · Csak ezen az eszközön, még nincs a főnöknél.');
 }catch(e){cache=null;message(e.message);}finally{busy=false;if(again){again=false;schedule();}}
}
function schedule(){clearTimeout(timer);timer=setTimeout(synchronize,450);}
document.getElementById('excelDownload')?.addEventListener('click',async()=>{
 const b=document.getElementById('excelDownload');b.disabled=true;
 try{const s=snapshot(),signature=s.month+'|'+s.raw,bytes=cache?.signature===signature?cache.bytes:await makeOriginalWorkbook(s.profile,s.month,s.records);saveXlsx(bytes,`Muszaknaplo_${s.month}.xlsx`);message('A kitöltött Excel letöltése elindult. Ez a fájl a mostani mentések pillanatképe.');}catch(e){message(e.message);}finally{b.disabled=false;}
});
if(host)new MutationObserver(schedule).observe(host,{childList:true,subtree:true,characterData:true});
window.addEventListener('storage',e=>{if(e.key===KEY)schedule();});
document.addEventListener('change',e=>{if(['dayDate','historyMonth'].includes(e.target.id))schedule();});
window.addEventListener('hashchange',schedule);schedule();
