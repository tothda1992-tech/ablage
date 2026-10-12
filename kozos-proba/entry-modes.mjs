/** Three renderers, one controller and one saved workday. No network/account side effects. */
import {PRODUCTS} from '../team-core.mjs';
import {createCounterCards} from './counter-cards.mjs';
import {ENTRY_MODES,POSITIONS,entryProducts,loadPreferences,savePreferences} from './entry-modes-core.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('hu-HU',{maximumFractionDigits:2}).format(n);
const label=p=>p.id==='product_5174'?'5174 · új kód egyeztetendő':p.code+(p.secondaryCode?' (régi: '+p.secondaryCode+')':'');
let instances=0;
export function createEntryModes(host,{getContext,getRecord,controller,storage,scope='three-modes-demo',onNotice=()=>{}}){
 const instance=++instances,$=s=>host.querySelector(s),$$=s=>[...host.querySelectorAll(s)];
 let context=null,prefs=null,search='',category='all',favoritesOnly=false,bigFavorites=false,correcting=null;
 const drafts=new Map(),sessionPrefs=new Map();
 const positionLabel=id=>POSITIONS.find(p=>p.id===id)?.label||id;
 const quantity=id=>getRecord()?.payload.counts[id]??0;
 const rate=p=>getRecord()?.norms[p.id]??p.rate;
 const locked=()=>getContext().editable!==true||!!getRecord()&&getRecord().status!=='draft';
 const key=c=>c.employeeId+'|'+c.date;
 host.classList.add('entry-modes');
 host.innerHTML=`<div class="em-heading"><div><p class="eyebrow">AHOGY NEKED KÉNYELMES</p><h2>Rögzítési mód</h2></div><span class="em-local">Helyi próba</span></div>
 <div class="em-mode-switch" role="group" aria-label="Rögzítési mód">${ENTRY_MODES.map((m,i)=>`<button type="button" data-entry-mode="${m.id}" aria-pressed="false"><span aria-hidden="true">${['☷','▦','⊞'][i]}</span><strong>${m.label}</strong></button>`).join('')}</div>
 <p class="em-mode-help"></p><p class="em-pref-warning" role="status" hidden></p>
 <div class="em-actionline"><p class="em-context-status" role="status"></p><button type="button" data-entry-undo disabled>↶ Visszavonás</button></div>
 <p class="em-result" role="status" aria-live="polite" hidden></p>
 <section data-entry-pane="list" aria-label="Gyors lista"><div class="qe-panels">${POSITIONS.map(p=>`<form class="qe-panel" data-qe-position="${p.id}" novalidate aria-label="${p.label} rögzítése"><div class="qe-panel-heading"><div class="qe-titleblock"><span class="em-layer em-${p.id}" aria-hidden="true">${p.id==='upper'?'▤':p.id==='lower'?'▥':'◫'}</span><h3>${p.label}</h3></div><span class="qe-panel-total"></span></div><div class="qe-fields"><label class="qe-type">${p.label==='Kiegészítők'?'Kiegészítő':p.label} típusa<select name="qeProduct" aria-label="${p.label} típusa"><option value="">Válassz típust…</option>${[...new Set(PRODUCTS.filter(x=>x.position===p.id).map(x=>x.group))].map(g=>`<optgroup label="${esc(g)}">${PRODUCTS.filter(x=>x.position===p.id&&x.group===g).map(x=>`<option value="${x.id}">${esc(label(x))}</option>`).join('')}</optgroup>`).join('')}</select></label><label class="qe-amount">Hozzáadandó darab<span class="qe-stepper"><button type="button" data-qe-step="-1" aria-label="${p.label}: előkészített darabszám csökkentése">−</button><input name="qeAmount" type="text" inputmode="numeric" value="1" autocomplete="off" aria-label="${p.label}: hozzáadandó darabszám"><button type="button" data-qe-step="1" aria-label="${p.label}: előkészített darabszám növelése">+</button></span></label><button type="submit" class="qe-add">${p.label==='Kiegészítők'?'Kiegészítő':p.label} hozzáadása</button></div><p class="qe-hint"></p><p class="qe-result" role="status" hidden></p></form>`).join('')}</div></section>
 <section data-entry-pane="cards" aria-label="Kártyás számláló" hidden><p class="em-counter-help">Görgess a típushoz. A − / + azonnal rögzít, középen a napi összesen látható. Beírás után a Mentés vagy az Enter cseréli a napi mennyiséget.</p><div class="em-counter-cards"></div></section>
 <section data-entry-pane="big" aria-label="Nagygombos rögzítés" hidden><div class="em-big-categories" role="group" aria-label="Nagygombos kategória">${POSITIONS.map(p=>`<button type="button" data-big-category="${p.id}" aria-pressed="false">${p.label}</button>`).join('')}</div><div class="em-big-tools"><button type="button" data-big-favorites aria-pressed="false">☆ Csak kedvencek</button><span>A gombok sorrendje nem változik rögzítéskor.</span></div><div class="em-big-cards"></div></section>
 <dialog class="em-correction" aria-labelledby="em-correction-title-${instance}"><form class="em-correction-form" novalidate><h2 id="em-correction-title-${instance}">Napi összesen javítása</h2><p class="em-correction-desc"></p><label>Új napi összesen (db)<input type="text" inputmode="numeric" name="total" autocomplete="off" aria-label="Új napi összesen"></label><p class="em-correction-error" role="alert" hidden></p><div class="em-dialog-actions"><button type="button" data-close-correction>Mégse</button><button type="submit" class="primary">Napi összeg cseréje</button></div></form></dialog>`;
 function savePrefs(){
  sessionPrefs.set(context.employeeId,structuredClone(prefs));
  const result=savePreferences(storage,scope,context.employeeId,prefs);
  $('.em-pref-warning').hidden=result.saved;
  $('.em-pref-warning').textContent='A nézetet most csak ebben az ablakban tudjuk megjegyezni. A termékrögzítés továbbra is használható.';
 }
 function capture(){if(!context)return;const forms={};for(const p of POSITIONS){const f=$(`[data-qe-position="${p.id}"]`);forms[p.id]={product:f.elements.qeProduct.value,amount:f.elements.qeAmount.value};}drafts.set(key(context),{forms,search,category,favoritesOnly,bigFavorites});}
 function restore(next){
  if(context)capture();const changedWorker=context?.employeeId!==next.employeeId;context={...next};
  if(changedWorker){const read=loadPreferences(storage,scope,next.employeeId);prefs=sessionPrefs.get(next.employeeId)||read.value;$('.em-pref-warning').hidden=read.saved;}
  const d=drafts.get(key(next));
  for(const p of POSITIONS){const f=$(`[data-qe-position="${p.id}"]`);f.elements.qeProduct.value=d?.forms[p.id].product??prefs.lastTypes[p.id];f.elements.qeAmount.value=d?.forms[p.id].amount??'1';f.querySelector('.qe-result').hidden=true;}
  search=d?.search??'';category=d?.category??'all';favoritesOnly=d?.favoritesOnly??false;bigFavorites=d?.bigFavorites??false;
  // Card mode always shows every product; no search or hidden category filter.
  correcting=null;if($('.em-correction').open)$('.em-correction').close();$('.em-result').hidden=true;
  applyMode();buildCards();
 }
 function applyMode(){
  $$('[data-entry-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.entryMode===prefs.mode)));
  $$('[data-entry-pane]').forEach(n=>n.hidden=n.dataset.entryPane!==prefs.mode);
  $('.em-mode-help').textContent={list:'Válassz típust, add meg a hozzáadandó darabot. Csak a Hozzáadás ment.',cards:'Minden termék egymás után, keresés nélkül. A − / napi darabszám / + ugyanúgy működik, mint a korábbi kártyákon.',big:'Nagy +1 gombok, gépelés nélkül. A +5 külön gyorsgomb; a kártya háttere nem rögzít.'}[prefs.mode];
 }
 function card(p,big){const common=`<div class="em-card-top"><div><h3>${esc(p.code)}</h3><small>${esc(p.secondaryCode?p.secondaryCode:p.group)}</small></div><button type="button" class="em-favorite" data-favorite="${p.id}" aria-label="${esc(p.code)} kedvenc" aria-pressed="false">☆</button></div><p class="em-card-meta">${esc(positionLabel(p.position))} · <span data-rate="${p.id}"></span> perc/db</p>${p.id==='product_5174'?'<p class="em-code-warning">Papír: 7874 / Excel: 7877. Az 5174 normája érvényes.</p>':''}<p class="em-card-count">Napi összesen: <strong data-count="${p.id}">0</strong> db</p>`;
  return `<article class="em-product ${big?'em-product-big':''} em-${p.position}" data-entry-product="${p.id}">${common}${big?`<button type="button" class="em-big-add" data-entry-add="${p.id}" data-position="${p.position}" data-amount="1" aria-label="${esc(p.code)}: +1 darab"><strong>+1</strong> darab</button><div class="em-card-actions"><button type="button" data-entry-add="${p.id}" data-position="${p.position}" data-amount="5" aria-label="${esc(p.code)}: +5 darab">+5 darab</button><button type="button" data-correct="${p.id}">Javítás</button></div>`:`<div class="em-card-actions"><button type="button" data-entry-minus="${p.id}" data-position="${p.position}" aria-label="${esc(p.code)}: −1 darab">−1</button><button type="button" class="primary" data-entry-add="${p.id}" data-position="${p.position}" data-amount="1" aria-label="${esc(p.code)}: +1 darab">+1 darab</button></div><button type="button" class="em-correct" data-correct="${p.id}">Napi összesen javítása</button>`}</article>`;
 }
 function buildCards(){
  const cards=entryProducts({category,query:search,favoritesOnly,favorites:prefs.favorites}),big=entryProducts({category:prefs.bigCategory,favoritesOnly:bigFavorites,favorites:prefs.favorites});
  const empty='<p class="em-empty">Nincs találat. Kapcsold ki a kedvencszűrőt, vagy válassz másik kategóriát. A ☆ gombbal jelölhetsz kedvenceket.</p>';
  counter.refresh();
  $('.em-big-cards').innerHTML=big.map(p=>card(p,true)).join('')||empty;

  $$('[data-card-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cardCategory===category)));
  $$('[data-big-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bigCategory===prefs.bigCategory)));
$('[data-big-favorites]').setAttribute('aria-pressed',String(bigFavorites));
  update();
 }
 function result(receipt){const p=PRODUCTS.find(p=>p.id===receipt.productId),delta=receipt.after-receipt.before;$('.em-result').textContent=`${p.code}: ${delta>0?'+':''}${delta} db. Napi összesen: ${receipt.after} db.`;$('.em-result').hidden=false;$('.em-result').classList.remove('error');onNotice($('.em-result').textContent);}
 function error(e){$('.em-result').textContent=e.message;$('.em-result').hidden=false;$('.em-result').classList.add('error');}
 function update(){
  const isLocked=locked(),ctx=getContext(),record=getRecord();
  $('.em-context-status').textContent=`${ctx.workerCode??ctx.employeeId} · ${ctx.date} · ${isLocked?'Csak megtekintés':record?(ctx.storageSaved===false?'Csak ebben az ablakban':'Helyi piszkozat'):'Még nincs mentett tétel'}`;
  const undo=controller.undoState();$('[data-entry-undo]').disabled=!undo.available;
  $('[data-entry-undo]').title=undo.available?'Csak a legutóbbi saját termékmódosítás visszavonása':'Nincs visszavonható saját termékmódosítás ezen a napon.';
  for(const pos of POSITIONS){const f=$(`[data-qe-position="${pos.id}"]`),p=PRODUCTS.find(x=>x.id===f.elements.qeProduct.value&&x.position===pos.id);f.querySelector('.qe-panel-total').textContent='Napi: '+PRODUCTS.filter(x=>x.position===pos.id).reduce((s,x)=>s+quantity(x.id),0)+' db';f.elements.qeProduct.disabled=f.elements.qeAmount.disabled=isLocked;f.querySelector('button[type=submit]').disabled=isLocked||!p;f.querySelectorAll('[data-qe-step]').forEach(b=>b.disabled=isLocked||b.dataset.qeStep==='-1'&&Number(f.elements.qeAmount.value)<=1);f.querySelector('.qe-hint').textContent=isLocked?'Ez a nap csak megtekinthető.':p?`${fmt(rate(p)/100)} perc/db · Napi összesen: ${quantity(p.id)} db`+(p.id==='product_5174'?' · Papír: 7874 / Excel: 7877.':''):'A Felső / Alsó / Kiegészítők külön választható.';}
  $$('[data-count]').forEach(n=>n.textContent=quantity(n.dataset.count));$$('[data-rate]').forEach(n=>n.textContent=fmt(rate(PRODUCTS.find(p=>p.id===n.dataset.rate))/100));
  $$('[data-favorite]').forEach(b=>{const yes=prefs.favorites.includes(b.dataset.favorite);b.setAttribute('aria-pressed',String(yes));b.textContent=yes?'★':'☆';});
  $$('[data-entry-add]').forEach(b=>b.disabled=isLocked||quantity(b.dataset.entryAdd)+Number(b.dataset.amount)>99999);
  $$('[data-entry-minus]').forEach(b=>b.disabled=isLocked||quantity(b.dataset.entryMinus)===0);
  $$('[data-correct]').forEach(b=>b.disabled=isLocked);
  counter.refresh();
 }
 function refresh(){const next=getContext();if(!context||key(context)!==key(next))restore(next);update();}
 host.addEventListener('input',e=>{
  if(e.target.classList.contains('em-search')){search=e.target.value;buildCards();}
  capture();
 });
 host.addEventListener('change',e=>{
  if(e.target.name==='qeProduct'){const pos=e.target.closest('[data-qe-position]').dataset.qePosition;const p=PRODUCTS.find(x=>x.id===e.target.value&&x.position===pos);prefs.lastTypes[pos]=p?.id??'';savePrefs();update();capture();}
 });
 host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{
  if(b.dataset.entryMode){prefs.mode=b.dataset.entryMode;savePrefs();applyMode();return;}
  if(b.hasAttribute('data-entry-undo')){result(controller.undo());update();return;}
  if(b.dataset.cardCategory){category=b.dataset.cardCategory;buildCards();capture();return;}
  if(b.dataset.bigCategory){prefs.bigCategory=b.dataset.bigCategory;savePrefs();buildCards();return;}
  if(b.hasAttribute('data-card-favorites')){favoritesOnly=!favoritesOnly;buildCards();capture();return;}
  if(b.hasAttribute('data-big-favorites')){bigFavorites=!bigFavorites;buildCards();capture();return;}
  if(b.dataset.favorite){const id=b.dataset.favorite;if(!PRODUCTS.some(p=>p.id===id))throw Error('Ismeretlen termék.');prefs.favorites=prefs.favorites.includes(id)?prefs.favorites.filter(x=>x!==id):[...prefs.favorites,id];savePrefs();buildCards();return;}
  if(b.dataset.qeStep){const f=b.closest('form'),n=Number(f.elements.qeAmount.value);f.elements.qeAmount.value=String(Math.min(99999,Math.max(1,(Number.isSafeInteger(n)?n:1)+Number(b.dataset.qeStep))));update();capture();return;}
  if(b.dataset.entryAdd){result(controller.run({kind:'add',productId:b.dataset.entryAdd,position:b.dataset.position,amount:b.dataset.amount}));update();return;}
  if(b.dataset.entryMinus){result(controller.run({kind:'decrement',productId:b.dataset.entryMinus,position:b.dataset.position}));update();return;}
  if(b.dataset.correct){const p=PRODUCTS.find(p=>p.id===b.dataset.correct);if(!p||locked())throw Error('Ez a nap nem szerkeszthető.');correcting={employeeId:context.employeeId,date:context.date,productId:p.id,position:p.position,expectedVersion:getRecord()?.version??0};$('.em-correction-desc').textContent=`${p.code} · ${context.date}. Jelenleg ${quantity(p.id)} db. Ez cseréli a napi összesent, nem hozzáad.`;$('.em-correction-form').elements.total.value=quantity(p.id);$('.em-correction-error').hidden=true;$('.em-correction').showModal();$('.em-correction-form').elements.total.focus();return;}
  if(b.hasAttribute('data-close-correction')){$('.em-correction').close();correcting=null;}
 }catch(err){error(err);}});
 host.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
  try{
   if(f.matches('.em-correction-form')){
    if(!correcting||correcting.employeeId!==getContext().employeeId||correcting.date!==getContext().date)throw Error('A dolgozó vagy dátum megváltozott. Nyisd meg újra a javítást.');
    result(controller.run({...correcting,kind:'set',amount:f.elements.total.value}));$('.em-correction').close();correcting=null;update();return;
   }
   if(!f.dataset.qePosition)return;
   const receipt=controller.run({kind:'add',productId:f.elements.qeProduct.value,position:f.dataset.qePosition,amount:f.elements.qeAmount.value});
   f.elements.qeAmount.value='1';result(receipt);const message=f.querySelector('.qe-result');message.textContent=$('.em-result').textContent;message.hidden=false;message.classList.remove('qe-error');capture();update();
  }catch(err){if(f.matches('.em-correction-form')){$('.em-correction-error').textContent=err.message;$('.em-correction-error').hidden=false;}else{const message=f.querySelector('.qe-result');if(message){message.textContent=err.message;message.hidden=false;message.classList.add('qe-error');}error(err);}}
 });
 const counter=createCounterCards($('.em-counter-cards'),{getContext,getRecord,controller,onResult:r=>{result(r);update();},onError:error});
 refresh();return {refresh};
}
