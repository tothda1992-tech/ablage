import {PRODUCTS,GROUPS,DOWNTIME,SOURCE} from './catalog.mjs';
import {STORAGE_KEY,BACKUP_KEY,localDate,validDate,shiftDate,decimalHundredths,quantity,newState,newDay,getDay,dayHasData,totals,readState,persist,validateState,parseBackup,backupText,mergeBackup,matchProduct,monthTotals,csvText} from './model.mjs';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',report:'M7 3h10l3 3v15H4V3h3 M8 9h8 M8 13h8 M8 17h5',calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16 M8 15h2 M14 15h2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',check:'m5 12 4 4 10-10',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',plus:'M12 5v14 M5 12h14',minus:'M5 12h14',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',upload:'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5',print:'M7 8V3h10v5 M7 17H3V9h18v8h-4 M7 14h10v7H7z M17 11h1',lock:'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3',edit:'m4 16-1 5 5-1L20 8l-4-4z M14 6l4 4',close:'m6 6 12 12 M6 18 18 6',box:'m12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9',phone:'M7 2h10v20H7z M10 18h4',arrow:'M5 12h14 m-5-5 5 5-5 5'};
const icon=(name,extra='')=>`<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]??paths.box}"/></svg>`;
const num=(n,d=2)=>new Intl.NumberFormat('hu-HU',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const mins=c=>num(c/100);
const hours=c=>num(c/6000);
const dayLabel=date=>new Intl.DateTimeFormat('hu-HU',{month:'long',day:'numeric',weekday:'long'}).format(new Date(date+'T12:00:00'));
const dateText=date=>new Intl.DateTimeFormat('hu-HU',{year:'numeric',month:'long',day:'numeric'}).format(new Date(date+'T12:00:00'));
const views={today:['Napi rögzítés','EGYSZERŰBB MUNKANAPOK'],summary:['Napi elszámolás','A NAPOD SZÁMOKBAN'],history:['Előzmények','MINDEN MUNKANAP EGY HELYEN'],settings:['Beállítások','A SAJÁT MUNKANAPLÓD']};
let storage;
try{storage=window.localStorage;}catch{storage={getItem(){throw new Error('storage');},setItem(){throw new Error('storage');}};}
const initial=readState(storage);
let state=initial.state, storageWarning=initial.warning, writeAllowed=initial.writeAllowed, corruptRaw=initial.raw??null;
let selectedDate=localDate(),selectedMonth=selectedDate.slice(0,7),view=Object.hasOwn(views,location.hash.slice(1))?location.hash.slice(1):'today';
let query='',filter='all',undoState=null,undoRevision=null,toastTimer=null,dialogSubmit=null,pendingImport=null,installPrompt=null,offlineReady=false;

function day(){return getDay(state,selectedDate);}
function editDay(next){return next.days[selectedDate]??(next.days[selectedDate]=newDay(selectedDate,next.profile.name));}
function updateStorageStatus(){
  const status=$('#saveStatus');
  status.textContent=!writeAllowed?'Nincs helyi mentés':state.updatedAt?'Mentve az eszközön':'Mentésre kész';
  status.classList.toggle('error',!writeAllowed);
  $('#storageWarning').hidden=!storageWarning;
  $('#storageWarning').textContent=storageWarning??'';
  $('#connectionStatus').textContent=navigator.onLine?'Online':offlineReady?'Offline':'Nincs internet';
}
function commit(mutator,message='',mode='full',allowUndo=true){
  const old=structuredClone(state),next=structuredClone(state);
  mutator(next);
  next.revision=(state.revision??0)+1;
  next.updatedAt=new Date().toISOString();
  if(next.days[selectedDate])next.days[selectedDate].updatedAt=next.updatedAt;
  validateState(next);
  state=next;
  if(writeAllowed){
    try{persist(storage,state);storageWarning=null;}
    catch{writeAllowed=false;storageWarning='Nem sikerült a helyi mentés. Az új adatok most csak a megnyitott ablakban vannak. A Beállításoknál tölts le biztonsági mentést.';}
  }
  if(allowUndo){undoState=old;undoRevision=state.revision;}else{undoState=null;undoRevision=null;}
  if(mode==='counts')updateCounts();else if(mode==='full')render();else updateStorageStatus();
  if(message)toast(message,allowUndo);
  else {clearTimeout(toastTimer);$('#toast').hidden=true;$('#undoButton').hidden=true;}
}
function toast(message,undo=false){
  clearTimeout(toastTimer);
  $('#toastText').textContent=message;
  $('#undoButton').hidden=!undo;
  $('#toast').hidden=false;
  toastTimer=setTimeout(()=>{$('#toast').hidden=true;},6500);
}
function navigate(next){
  if(!Object.hasOwn(views,next))return;
  view=next;
  if(location.hash!=='#'+view)history.pushState(null,'','#'+view);
  render();
  window.scrollTo({top:0,behavior:'instant'});
}
function setDate(value){
  if(!validDate(value)){toast('Válassz érvényes dátumot.');return;}
  selectedDate=value;selectedMonth=value.slice(0,7);
  render();
}
function summaryHero(d){
  const t=totals(d),ratio=t.ratio;
  return `<section class="hero-grid" aria-label="A kiválasztott nap összesítése">
    <div class="hero-card"><div class="hero-label">${icon('clock')} Elszámolt idő</div><div><strong class="hero-number">${hours(t.creditedCentiMinutes)}</strong><span class="hero-unit">óra</span></div>
    <div class="hero-breakdown"><span>Normaidő <strong>${mins(t.normCentiMinutes)} perc</strong></span><span>Állás / egyéb <strong>${mins(t.downtimeCentiMinutes)} perc</strong></span></div>
    <div class="hero-progress"><div class="progress-caption"><span>${t.workCentiMinutes===null?'Add meg a napi munkaórát':`${hours(t.workCentiMinutes)} megadott munkaóra`}</span><strong>${ratio===null?'—':num(ratio,1)+'%'}</strong></div><div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${Math.min(100,ratio??0)}%"></div></div><small>Elszámolt idő / megadott munkaidő</small></div></div>
    <div class="pieces-card"><div class="pieces-title">${icon('box')} Rögzített darabok</div><div class="pieces-grid"><div class="piece-stat"><strong>${t.upper}</strong><span>Felső</span><small>Excel: Darab/Nap</small></div><div class="piece-stat"><strong>${t.lower}</strong><span>Alsó</span><small>külön összesítve</small></div><div class="piece-stat"><strong>${t.accessory}</strong><span>Kiegészítő</span><small>roló, polc, tükör</small></div></div><div class="pieces-footer">${t.rows.length?`${t.rows.length} különböző tétel rögzítve`:'Jöhet az első elkészült darab.'}</div></div>
  </section>`;
}
function renderToday(){
  const d=day(),disabled=d.closed?'disabled':'';
  return `<div id="statsHost">${summaryHero(d)}</div>
    <div class="day-meta-bar"><div class="person-line"><strong>${esc(d.name||'Név megadása')}</strong><span class="status-pill ${d.closed?'closed':''}">${d.closed?'Lezárt nap':'Nyitott nap'}</span></div><div class="action-row"><button class="text-button" type="button" data-action="day-details" ${disabled}>${icon('edit')} Nap adatai</button>${d.closed?'<button class="text-button" type="button" data-action="reopen">Újranyitás</button>':''}</div></div>
    ${!dayHasData(d)?`<div class="intro-note"><span>${icon('plus')}</span><div><strong>Elkészült egy termék? Egy érintés.</strong><p>Keresd meg a kódot, majd nyomd meg a + gombot. Több darabot közvetlenül a számmezőbe is beírhatsz.</p></div></div>`:''}
    ${d.closed?'<div class="notice">A nap le van zárva. Javításhoz válaszd az Újranyitás gombot.</div>':''}
    <section class="recording-section" aria-labelledby="productsTitle"><div class="section-header"><div><h2 id="productsTitle" class="section-title">Termékek</h2><p class="muted">A papírról ismert kódok, a táblázat normaidőivel.</p></div><button type="button" class="button secondary" data-action="downtime" ${disabled}>${icon('clock')} Állás / egyéb idő</button></div>
    <div class="toolbar"><div class="search-wrap"><span class="search-icon">${icon('search')}</span><input id="productSearch" type="search" autocomplete="off" placeholder="Termékkód vagy név, pl. 3243" aria-label="Termék keresése" value="${esc(query)}"><button type="button" class="search-clear" data-action="clear-search" aria-label="Keresés törlése" ${query?'':'hidden'}>${icon('close')}</button></div><button class="button ghost" type="button" data-action="special" ${disabled}>Brazil / Spoiler</button></div>
    <div class="filters" role="group" aria-label="Terméklista szűrése">${[['all','Összes'],['favorites','★ Kedvencek'],['used','Felírtak'],['upper','Felső'],['lower','Alsó'],['accessory','Kiegészítők']].map(([id,label])=>`<button type="button" class="filter-chip ${filter===id?'active':''}" data-filter="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div>
    <div id="productsHost"></div><p class="section-foot muted small">${SOURCE.normCount} normaidős tétel · A kijelzett darabidők tizedes percek.</p></section>`;
}
function productCard(p,d){
  const count=d.counts[p.id]??0,norm=d.norms[p.id],fav=state.favorites.includes(p.id),disabled=d.closed?'disabled':'';
  return `<article class="product-card ${count?'has-count':''}" data-product-card="${p.id}" aria-label="${esc(p.code)}">
    <div class="product-head"><div><h3 class="product-code">${esc(p.code)}</h3><span class="product-alias">${p.secondaryCode?esc(p.codeIssue?p.secondaryCode:'régi kód: '+p.secondaryCode):p.code.startsWith('GERM')?'Germersheim':p.position==='accessory'?esc(p.label):'&nbsp;'}</span></div><button type="button" class="favorite ${fav?'selected':''}" data-favorite="${p.id}" aria-label="${esc(p.code)} ${fav?'eltávolítása a kedvencekből':'kedvencekhez adása'}" aria-pressed="${fav}">${icon('star')}</button></div>
    <div class="product-norm"><strong>${mins(norm)}</strong> perc / db</div>
    ${p.codeIssue?'<p class="code-note">Az 5174 normájával számol. Az új kód egyeztetendő.</p>':''}
    <div class="quantity-control"><button type="button" class="minus" data-delta="-1" data-id="${p.id}" aria-label="${esc(p.code)} mínusz egy darab" ${count===0||d.closed?'disabled':''}>${icon('minus')}</button><input class="quantity-input" data-quantity="${p.id}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${count}" aria-label="${esc(p.code)} darabszáma" ${disabled}><button type="button" class="plus" data-delta="1" data-id="${p.id}" aria-label="${esc(p.code)} plusz egy darab" ${disabled}>${icon('plus')}</button></div><div class="product-subtotal"><span>${count?'Elszámolt idő':'Még nincs rögzítve'}</span><strong>${count?mins(count*norm)+' perc':'—'}</strong></div></article>`;
}
function renderProducts(){
  const host=$('#productsHost');if(!host)return;
  const d=day();
  const matched=PRODUCTS.filter(p=>matchProduct(p,query)&&(filter==='all'||(filter==='favorites'?state.favorites.includes(p.id):filter==='used'?(d.counts[p.id]??0)>0:p.position===filter)));
  if(!matched.length){host.innerHTML=`<div class="empty-state"><div class="empty-icon">${icon(filter==='favorites'?'star':'search')}</div><h3>${query?'Nincs ilyen találat':filter==='favorites'?'A gyakori termékeid helye':filter==='used'?'Erre a napra még nincs felírt termék':'Nincs megjeleníthető tétel'}</h3><p>${filter==='favorites'&&!query?'Az Összes listán a csillaggal jelöld meg, amit gyakran készítesz.':'Próbálj másik kódot, vagy mutasd az összes terméket.'}</p><button type="button" class="button secondary" data-action="show-all">Összes termék</button></div>`;return;}
  const ordered=[...GROUPS.filter(g=>g.position!=='accessory'),...GROUPS.filter(g=>g.position==='accessory')];
  host.innerHTML=ordered.map(g=>{
    const items=matched.filter(p=>p.groupId===g.id);
    return items.length?`<section class="product-section" aria-label="${esc(g.label)}"><h3 class="product-group">${esc(g.label)}<span>${items.length} tétel</span></h3><div class="product-grid">${items.map(p=>productCard(p,d)).join('')}</div></section>`:'';
  }).join('');
}
function updateCounts(){
  if(view!=='today'){render();return;}
  const d=day();$('#statsHost').innerHTML=summaryHero(d);
  $$('.product-card').forEach(card=>{
    const p=PRODUCTS.find(p=>p.id===card.dataset.productCard),count=d.counts[p.id]??0;
    card.classList.toggle('has-count',count>0);
    const input=card.querySelector('.quantity-input');
    if(document.activeElement!==input)input.value=count;
    card.querySelector('.minus').disabled=count===0||d.closed;
    card.querySelector('.product-subtotal').innerHTML=`<span>${count?'Elszámolt idő':'Még nincs rögzítve'}</span><strong>${count?mins(count*d.norms[p.id])+' perc':'—'}</strong>`;
  });
  if(dayHasData(d))$('.intro-note')?.remove();
  updateStorageStatus();
}
function detailTable(d,print=false){
  const t=totals(d);
  return `<div class="table-wrap"><table class="data-table"><caption class="sr-only">${dateText(d.date)} tételes elszámolása</caption><thead><tr><th scope="col">Termék / jogcím</th><th scope="col">Perc/db</th><th scope="col">Darab</th><th scope="col">Összes perc</th></tr></thead><tbody>
    ${t.rows.map(r=>`<tr><td><strong>${esc(r.code)}</strong>${r.secondaryCode?`<small>${esc(r.secondaryCode)}</small>`:''}<small>${esc(r.group)}</small></td><td>${mins(r.rate)}</td><td>${r.count}</td><td>${mins(r.centiMinutes)}</td></tr>`).join('')}
    ${t.downtimeRows.map(r=>`<tr><td><strong>${esc(r.label)}</strong><small>Állás / egyéb</small></td><td>—</td><td>—</td><td>${mins(r.centiMinutes)}</td></tr>`).join('')}
    ${!t.rows.length&&!t.downtimeRows.length?'<tr><td colspan="4" class="muted">Még nincs elszámolható tétel ezen a napon.</td></tr>':''}
    </tbody><tfoot><tr class="total-row"><th colspan="3" scope="row">Elszámolt idő összesen</th><td><strong>${mins(t.creditedCentiMinutes)} perc</strong><small>${hours(t.creditedCentiMinutes)} óra</small></td></tr></tfoot></table></div>`;
}
function specialNotes(d){
  return `${d.brazilCount?`<p><strong>Brazil: ${d.brazilCount} db.</strong> Külön darabjelölés, önálló normaidőt nem ad hozzá az elszámoláshoz.</p>`:''}${d.spoiler?`<p><strong>Spoiler:</strong> ${esc(d.spoiler).replaceAll('\n','<br>')}</p>`:''}${d.note?`<p><strong>Megjegyzés:</strong> ${esc(d.note).replaceAll('\n','<br>')}</p>`:''}`;
}
function renderSummary(){
  const d=day(),t=totals(d),signed=c=>(c>0?'+':'')+hours(c)+' óra';
  return `${summaryHero(d)}<div class="day-meta-bar"><strong>${esc(d.name||'Nincs megadott név')}</strong><span class="status-pill ${d.closed?'closed':''}">${d.closed?'Lezárt nap':'Nyitott nap'}</span></div>
    <section class="panel"><div class="panel-header"><div><h2>Tételes elszámolás</h2><p class="muted">${esc(dateText(selectedDate))}</p></div><button class="text-button" type="button" data-view="today">Vissza a rögzítéshez ${icon('arrow')}</button></div>${detailTable(d)}
    <div class="summary-notes">${specialNotes(d)}<dl class="definition-list"><div><dt>Megadott munkaidő</dt><dd>${t.workCentiMinutes===null?'Nincs megadva':hours(t.workCentiMinutes)+' óra'}</dd></div><div><dt>Eltérés, állás / egyéb idővel együtt</dt><dd>${t.totalGapCentiMinutes===null?'—':signed(t.totalGapCentiMinutes)}</dd></div><div><dt>Excel szerinti eltérés, egyéb idő nélkül</dt><dd>${t.normGapCentiMinutes===null?'—':signed(t.normGapCentiMinutes)}</dd></div></dl>
    <p class="small muted">Elszámolt óra = (darabszám × darabonkénti normaperc + állás / egyéb perc) ÷ 60. A számítás közben nincs kerekítés.</p></div></section>
    <div class="action-row"><button type="button" class="button secondary" data-action="export-day">${icon('download')} Napi CSV</button><button type="button" class="button secondary" data-action="print">${icon('print')} Nyomtatás / PDF</button><button type="button" class="button primary" data-action="${d.closed?'reopen':'close-day'}">${icon(d.closed?'edit':'lock')} ${d.closed?'Nap újranyitása':'Nap lezárása'}</button></div>
    <p class="small muted">A CSV Excelben is megnyitható. A PDF a böngésző nyomtatási ablakában menthető.</p>`;
}
function renderHistory(){
  const m=monthTotals(state,selectedMonth);
  return `<div class="month-toolbar"><label for="historyMonth">Hónap</label><input id="historyMonth" type="month" value="${selectedMonth}" min="2000-01" max="2199-12"><button type="button" class="button secondary" data-action="export-month" ${m.days.length?'':'disabled'}>${icon('download')} Havi CSV</button></div>
    <div class="metrics-grid"><div class="metric-card"><span>Elszámolt idő</span><strong>${hours(m.creditedCentiMinutes)} <small>óra</small></strong><p>${m.days.length} rögzített nap</p></div><div class="metric-card"><span>Megadott munkaidő</span><strong>${hours(m.workCentiMinutes)} <small>óra</small></strong><p>${m.missingWorkDays?`${m.missingWorkDays} napnál még hiányzik a munkaóra`:'A napi bejegyzések összege'}</p></div><div class="metric-card"><span>Időarány a hónapban</span><strong>${m.ratio===null?'—':num(m.ratio,1)+'%'}</strong><p>Összes elszámolt / összes munkaidő</p></div></div>
    <div class="section-header"><h2 class="section-title">Munkanapok</h2><span class="muted">${m.upper} felső · ${m.lower} alsó · ${m.accessory} kiegészítő</span></div>
    ${m.days.length?`<div class="history-list">${m.days.map(d=>{const t=totals(d);return `<button type="button" class="history-row" data-open-date="${d.date}"><span class="history-date"><strong>${Number(d.date.slice(-2))}</strong><small>${new Intl.DateTimeFormat('hu-HU',{weekday:'short'}).format(new Date(d.date+'T12:00:00'))}</small></span><span class="history-info"><strong>${esc(d.name||'Munkanap')}</strong><span>${t.upper} felső · ${t.lower} alsó · ${t.accessory} kiegészítő</span><small>${d.closed?'Lezárt':'Nyitott'}${d.workCentiMinutes===null?' · munkaóra nincs megadva':''}</small></span><span class="history-value"><strong>${hours(t.creditedCentiMinutes)} óra</strong><small>${mins(t.normCentiMinutes)} + ${mins(t.downtimeCentiMinutes)} perc</small></span>${icon('right')}</button>`;}).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('calendar')}</div><h2>Itt lesznek a korábbi napjaid.</h2><p>Ebben a hónapban még nincs bejegyzés. A rögzített napok automatikusan megjelennek itt.</p><button type="button" class="button primary" data-view="today">Napi rögzítés</button></div>`}`;
}
function renderSettings(){
  return `<div class="settings-grid"><section class="settings-card"><div class="panel-header"><span class="settings-icon">${icon('edit')}</span><h2>A napló neve</h2></div><form id="profileForm"><label class="field"><span class="field-label">Név az új munkanapokon</span><input class="input" name="profileName" maxlength="80" value="${esc(state.profile.name)}" autocomplete="name"></label><p class="field-help">A korábbi napokon rögzített név megmarad. Egy nap nevét a Nap adatai gombbal javíthatod.</p><button class="button primary" type="submit">Név mentése</button></form></section>
    <section class="settings-card"><div class="panel-header"><span class="settings-icon">${icon('download')}</span><h2>Biztonsági mentés</h2></div><p>A napló ezen az eszközön, ebben a böngészőben mentődik. Másik telefonra vagy böngészőbe a JSON-mentéssel viheted át.</p><p class="field-help">A böngészőadatok törlése a helyi naplót is törölheti. A letöltött JSON a teljes naplót tartalmazza, és visszatölthető.</p><div class="action-row"><button class="button primary" type="button" data-action="backup">${icon('download')} Mentés letöltése</button><button class="button secondary" type="button" data-action="import">${icon('upload')} Visszatöltés</button></div>${!writeAllowed?`<div class="notice warning">${esc(storageWarning)}<div class="action-row">${corruptRaw?'<button class="button secondary" type="button" data-action="raw-backup">Sérült mentés letöltése</button>':'<button class="button secondary" type="button" data-action="retry-save">Mentés újrapróbálása</button>'}</div></div>`:''}</section>
    <section class="settings-card"><div class="panel-header"><span class="settings-icon">${icon('phone')}</span><h2>Telefonos használat</h2></div><p>Tedd a kezdőképernyődre, hogy munka közben gyorsan megnyithasd.</p>${installPrompt?'<button type="button" class="button primary" data-action="install">App hozzáadása</button>':'<p class="field-help">Ha a böngésződ felajánlja a telepítést vagy a kezdőképernyőre helyezést, válaszd azt. Az app telepítés nélkül is használható.</p>'}<p id="offlineStatus" class="small muted">${offlineReady?'Az offline fájlok elkészültek ezen az eszközön.':'Az offline előkészítés az első online megnyitás után történik, ha a böngésző támogatja.'}</p></section>
    <section class="settings-card wide"><div class="panel-header"><span class="settings-icon">${icon('report')}</span><h2>Így készül az elszámolás</h2></div><dl class="definition-list"><div><dt>Normaidő</dt><dd>Darabszám × a termék perc/db értéke</dd></div><div><dt>Állás / egyéb</dt><dd>A hét eredeti kategóriában megadott percek</dd></div><div><dt>Elszámolt idő</dt><dd>(Normaperc + állás / egyéb perc) ÷ 60</dd></div><div><dt>Darab/Nap az Excelben</dt><dd>Csak a felső termékek darabszáma</dd></div></dl><p>Az óraszámot te adod meg. Az app nem von le automatikusan szünetet, és nem használ létszámszorzót. A százalék az elszámolt és a megadott munkaidő aránya.</p><p class="small muted">Forrás: ${esc(SOURCE.file)}, „${esc(SOURCE.sheet)}” lap. ${SOURCE.normCount} normás tétel, 7 állás / egyéb kategória. A korábbi napok a rögzítéskori normaidőt őrzik.</p>
    <details class="source-details"><summary>A források eltérései és a külön mezők</summary><ul><li><strong>5174:</strong> a papíron 7874, az Excelben 7877 az új kód. Az app az egyértelmű 5174 kódon, 14,67 perc/db normával rögzít; mindkét eltérő kódra kereshető.</li><li><strong>GERM:</strong> a felső 17,56 perc/db, az alsó 13,99 perc/db, ezért két külön tétel.</li><li><strong>Brazil:</strong> külön darabjelölés. Az Excel külön normaidőt nem számol hozzá; a Brazil dobozolás egy külön, percben megadott egyéb jogcím.</li><li><strong>Spoiler:</strong> a papírhoz hasonló szöveges feljegyzés. Nincs megadott normaidő, ezért önmagában nem ad hozzá perceket.</li><li><strong>Török:</strong> az Excelben szerepel, de mértékegység és norma nélkül. A Megjegyzés mezőben felírható, időt nem számolunk hozzá automatikusan.</li><li><strong>Polc / tükör:</strong> a normák helyes forrássorait használjuk: polc 0,26; tükör 0,40 perc/db. Az Excel egyik összesítőjében a feliratok fel vannak cserélve.</li><li><strong>4474:</strong> a papírról hiányzik, de az Excelben van hozzá 20,24 perc/db norma, ezért elérhető az appban.</li></ul></details></section></div>`;
}
function render(){
  $('#pageTitle').textContent=views[view][0];$('#pageEyebrow').textContent=views[view][1];
  document.title=`${views[view][0]} – Műszaknapló`;
  $('#sidebarName').textContent=state.profile.name||'Saját napló';
  $$('.sidebar .avatar').forEach(n=>n.textContent=(state.profile.name||'MN').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase());
  $('#dayDate').value=selectedDate;$('#weekday').textContent=dayLabel(selectedDate);
  $('#dateToolbar').hidden=view==='settings'||view==='history';
  $$('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('#viewHost').innerHTML=view==='today'?renderToday():view==='summary'?renderSummary():view==='history'?renderHistory():renderSettings();
  if(view==='today')renderProducts();
  updateStorageStatus();
}
function modal(title,body,onSubmit,button='Mentés'){
  dialogSubmit=onSubmit;
  $('#dialogContent').innerHTML=`<form id="modalForm" novalidate><div class="dialog-header"><h2 id="dialogTitle">${esc(title)}</h2><button class="dialog-close icon-button" type="button" data-action="close-dialog" aria-label="Ablak bezárása">${icon('close')}</button></div><div class="dialog-body">${body}<p id="formError" class="form-error" role="alert" tabindex="-1" hidden></p></div><div class="dialog-footer"><button class="button secondary" type="button" data-action="close-dialog">${onSubmit?'Mégse':'Bezárás'}</button>${onSubmit?`<button type="submit" class="button primary">${esc(button)}</button>`:''}</div></form>`;
  $('#dialog').showModal();
}
function detailsModal(special=false){
  const d=day();if(d.closed)return toast('A nap javításához előbb nyisd újra.');
  const body=`<p class="muted">${esc(dateText(selectedDate))}</p>${!special?`<div class="field-row"><label class="field"><span class="field-label">Név</span><input class="input" name="name" maxlength="80" value="${esc(d.name)}"></label><label class="field"><span class="field-label">Megadott munkaidő (óra)</span><input class="input" name="workHours" inputmode="decimal" type="text" placeholder="pl. 8 vagy 7,5" value="${d.workCentiMinutes===null?'':String(d.workCentiMinutes/6000).replace('.',',')}"></label></div><p class="field-help">Az elszámoláshoz beírandó óraszám. Az app nem von le automatikusan szünetet és nem szorozza létszámmal.</p>`:''}
    <label class="field"><span class="field-label">Brazil – külön darabjelölés</span><input class="input" name="brazil" type="text" inputmode="numeric" value="${d.brazilCount}"></label><p class="field-help">Nem ad hozzá külön normaidőt. A Brazil dobozolás perceit az Állás / egyéb idő között lehet megadni.</p>
    <label class="field"><span class="field-label">Spoiler</span><textarea class="textarea" name="spoiler" rows="2" maxlength="1000" placeholder="Kód, darab vagy megjegyzés, ahogy a papírra írnád">${esc(d.spoiler)}</textarea></label><p class="field-help">Szöveges feljegyzés; önálló időnormája nincs a táblázatban.</p>
    <label class="field"><span class="field-label">Megjegyzés</span><textarea class="textarea" name="note" maxlength="3000" rows="3" placeholder="Amit még szeretnél felírni a napról">${esc(d.note)}</textarea></label>`;
  modal(special?'Brazil és külön feljegyzések':'A nap adatai',body,form=>{
    if(day().closed)throw new Error('Ez a nap időközben le lett zárva. Nyisd újra a javításhoz.');
    const brazil=quantity(form.get('brazil')||'0');
    const work=special?d.workCentiMinutes:decimalHundredths(form.get('workHours'),{max:4800});
    commit(next=>{const target=editDay(next);if(!special){target.name=String(form.get('name')).trim();target.workCentiMinutes=work===null?null:work*60;}target.brazilCount=brazil;target.spoiler=String(form.get('spoiler')).trim();target.note=String(form.get('note')).trim();},'A nap adatai frissítve.');
  });
}
function downtimeModal(){
  const d=day();if(d.closed)return toast('A nap javításához előbb nyisd újra.');
  modal('Állás / egyéb idő',`<p class="muted">Az adott napra elszámolható perceket írd be. Ezek hozzáadódnak a termékek normaidőjéhez.</p><div class="downtime-grid">${DOWNTIME.map(c=>`<label class="downtime-field"><span>${esc(c.label)}</span><span class="input-suffix"><input class="input" name="${c.id}" type="text" inputmode="decimal" value="${d.downtime[c.id]?String(d.downtime[c.id]/100).replace('.',','):''}" placeholder="0" aria-label="${esc(c.label)} percek"><small>perc</small></span></label>`).join('')}</div>`,form=>{
    if(day().closed)throw new Error('Ez a nap időközben le lett zárva. Nyisd újra a javításhoz.');
    const values={};for(const c of DOWNTIME){const n=decimalHundredths(form.get(c.id),{empty:0});if(n)values[c.id]=n;}
    commit(next=>{editDay(next).downtime=values;},'Az állás / egyéb idő frissítve.');
  });
}
function help(){modal('Így használd a Műszaknaplót',`<ol class="help-steps"><li><strong>Válaszd ki a napot.</strong> A Nap adatai gombbal add meg a nevedet és az elszámoláshoz tartozó munkaórát.</li><li><strong>Rögzítsd a darabokat.</strong> Keress kódra vagy névre, majd használd a + / − gombot. A számmezőbe több darabot is beírhatsz.</li><li><strong>Írd fel az egyéb időt.</strong> Az Állás / egyéb idő gomb megnyitja a táblázat hét kategóriáját.</li><li><strong>Nézd át az elszámolást.</strong> A napi összesítést CSV-ben letöltheted, vagy nyomtatással PDF-be mentheted.</li><li><strong>Készíts mentést.</strong> A Beállítások között a teljes napló letölthető és később visszatölthető.</li></ol><p class="notice">A GERM felső és alsó külön tétel. Az 5174-nél a papír 7874-et, az Excel 7877-et ír; ezt a kártya külön jelzi.</p>`,null);}
function download(text,filename,type){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportDay(){download(csvText([day()]),`Muszaknaplo_${selectedDate}.csv`,'text/csv;charset=utf-8');toast('A napi CSV letöltése elindult.');}
function printDay(){
  const d=day(),t=totals(d);
  $('#printArea').innerHTML=`<header class="print-header"><h1>Napi elszámolás</h1><p><strong>${esc(d.name||'Név nincs megadva')}</strong> · ${esc(dateText(d.date))}</p><p>Megadott munkaidő: ${d.workCentiMinutes===null?'nincs megadva':hours(d.workCentiMinutes)+' óra'} · ${d.closed?'Lezárt nap':'Nyitott nap'}</p></header><div class="print-totals"><strong>Elszámolt idő: ${hours(t.creditedCentiMinutes)} óra</strong><p>${mins(t.normCentiMinutes)} normaperc + ${mins(t.downtimeCentiMinutes)} állás / egyéb perc</p><p>${t.upper} felső · ${t.lower} alsó · ${t.accessory} kiegészítő</p></div>${detailTable(d,true)}<div class="print-notes">${specialNotes(d)}</div><p class="print-footer">Műszaknapló · Normaidők: Toth.xlsx · Az időadatok tizedes percek.</p>`;
  window.print();
}
async function importFile(file){
  if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('Legfeljebb 10 MB-os mentés tölthető vissza.');
    const imported=parseBackup(await file.text());pendingImport=imported;
    const dates=Object.keys(imported.days),conflicts=dates.filter(date=>state.days[date]&&dayHasData(state.days[date]));
    modal('Biztonsági mentés visszatöltése',`<p>A fájl <strong>${dates.length} napot</strong> tartalmaz. ${conflicts.length?`Ebből <strong>${conflicts.length} nap</strong> már szerepel a naplódban.`:'A mentés napjai hozzáadhatók a naplóhoz.'}</p><label class="field"><span class="field-label">Azonos dátumú napok kezelése</span><select class="input" name="conflicts"><option value="keep">A meglévő napok maradjanak meg</option><option value="replace">A fájlban lévő napokkal cserélje le</option></select></label><p class="field-help">Az új napok mindkét esetben hozzáadódnak. A többi munkanap megmarad.</p>`,form=>{
      const incoming=pendingImport;
      // Explicit restore is also the supported recovery path for a corrupt local primary.
      if(corruptRaw){download(corruptRaw,`Muszaknaplo_serult_${localDate()}.json`,'application/json');corruptRaw=null;writeAllowed=true;}
      commit(next=>{const merged=mergeBackup(next,incoming,form.get('conflicts')==='replace');Object.assign(next,merged);},'A biztonsági mentés visszatöltve.');
      pendingImport=null;
    },'Visszatöltés');
  }catch(error){toast(error.message);}
  finally{$('#backupInput').value='';}
}
function closeDay(){
  const d=day();
  if(!dayHasData(d))return toast('Előbb rögzítsd a munkanap adatait.');
  if(d.workCentiMinutes===null)return detailsModal();
  modal('Nap lezárása',`<p>A <strong>${esc(dateText(selectedDate))}</strong> napi bejegyzés lezárása után a darabszámok védettek lesznek a véletlen átírástól. Javításhoz bármikor újranyithatod.</p><p>Elszámolt idő: <strong>${hours(totals(d).creditedCentiMinutes)} óra</strong>.</p>`,()=>commit(next=>{editDay(next).closed=true;},'A nap lezárva.'),'Nap lezárása');
}
const actions={
  'previous-day':()=>setDate(shiftDate(selectedDate,-1)), 'next-day':()=>setDate(shiftDate(selectedDate,1)), today:()=>setDate(localDate()),
  'day-details':()=>detailsModal(),special:()=>detailsModal(true),downtime:downtimeModal,help,
  'clear-search':()=>{query='';const input=$('#productSearch');if(input)input.value='';renderProducts();$('.search-clear').hidden=true;input?.focus();},
  'show-all':()=>{filter='all';query='';render();},
  'close-dialog':()=>$('#dialog').close(),
  'export-day':exportDay,'export-month':()=>{download(csvText(monthTotals(state,selectedMonth).days),`Muszaknaplo_${selectedMonth}.csv`,'text/csv;charset=utf-8');toast('A havi CSV letöltése elindult.');},
  print:printDay,'close-day':closeDay,reopen:()=>commit(next=>{editDay(next).closed=false;},'A nap újra szerkeszthető.'),
  backup:()=>{download(backupText(state),`Muszaknaplo_teljes_mentes_${localDate()}.json`,'application/json');toast('A teljes napló mentésének letöltése elindult.');},
  import:()=>$('#backupInput').click(),
  'raw-backup':()=>{if(corruptRaw)download(corruptRaw,`Muszaknaplo_serult_${localDate()}.json`,'application/json');},
  'retry-save':()=>{try{persist(storage,state);writeAllowed=true;storageWarning=null;render();toast('A helyi mentés sikerült.');}catch{toast('A böngésző továbbra sem engedi a mentést. Tölts le JSON-mentést.');}},
  install:async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;if(view==='settings')render();}
};
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try{
    if(button.dataset.view)return navigate(button.dataset.view);
    if(button.dataset.openDate){selectedDate=button.dataset.openDate;selectedMonth=selectedDate.slice(0,7);return navigate('summary');}
    if(button.dataset.action)return actions[button.dataset.action]?.();
    if(button.dataset.filter){filter=button.dataset.filter;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});return renderProducts();}
    if(button.dataset.favorite){const id=button.dataset.favorite;return commit(next=>{next.favorites=next.favorites.includes(id)?next.favorites.filter(x=>x!==id):[...next.favorites,id];},'Kedvencek frissítve.');}
    if(button.dataset.delta){
      if(day().closed)return;
      const id=button.dataset.id,p=PRODUCTS.find(p=>p.id===id),count=quantity((day().counts[id]??0)+Number(button.dataset.delta));
      commit(next=>{editDay(next).counts[id]=count;},`${p.code}: ${count} db`,'counts');
    }
  }catch(error){toast(error.message);}
});
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.id==='productSearch'){query=target.value;renderProducts();$('.search-clear').hidden=!query;}
  if(target.dataset.quantity){
    if(day().closed)return;
    try{
      if(target.value.trim()==='')return;
      const n=quantity(target.value),id=target.dataset.quantity;target.setCustomValidity('');
      if((day().counts[id]??0)!==n)commit(next=>{editDay(next).counts[id]=n;},'','counts');
    }catch(error){target.setCustomValidity(error.message);}
  }
});
document.addEventListener('focusout',event=>{
  if(event.target.dataset.quantity){const target=event.target,id=target.dataset.quantity;if(!target.validity.valid)toast(target.validationMessage);target.value=day().counts[id]??0;target.setCustomValidity('');}
});
document.addEventListener('change',event=>{
  if(event.target.id==='dayDate')setDate(event.target.value);
  if(event.target.id==='historyMonth'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)&&validDate(event.target.value+'-01')){selectedMonth=event.target.value;render();}
  if(event.target.id==='backupInput')importFile(event.target.files[0]);
});
document.addEventListener('submit',event=>{
  event.preventDefault();
  if(event.target.id==='modalForm'&&dialogSubmit){
    try{dialogSubmit(new FormData(event.target));$('#dialog').close();}
    catch(error){$('#formError').textContent=error.message;$('#formError').hidden=false;$('#formError').focus();}
  }
  if(event.target.id==='profileForm'){
    const name=String(new FormData(event.target).get('profileName')).trim();
    commit(next=>{next.profile.name=name;},'A név frissítve.');
  }
});
$('#undoButton').addEventListener('click',()=>{
  if(!undoState||state.revision!==undoRevision)return toast('Ez a művelet már nem vonható vissza.');
  const restored=structuredClone(undoState);
  commit(next=>{Object.assign(next,restored);},'Az utolsó módosítás visszavonva.','full',false);
  $('#undoButton').hidden=true;
});
$('#toastClose').addEventListener('click',()=>{$('#toast').hidden=true;});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(Object.hasOwn(views,next)){view=next;render();}});
window.addEventListener('online',updateStorageStatus);window.addEventListener('offline',updateStorageStatus);
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY)return;
  if(!writeAllowed)return; // Preserve this tab's unsaved state until the user exports or retries.
  const wasEditing=$('#dialog').open;
  if(wasEditing)$('#dialog').close();
  dialogSubmit=null;pendingImport=null;
  const loaded=readState(storage);state=loaded.state;writeAllowed=loaded.writeAllowed;storageWarning=loaded.warning;corruptRaw=loaded.raw??null;undoState=null;undoRevision=null;render();toast(wasEditing?'Másik ablakban változott a napló. Nyisd meg újra az adatlapot a friss adatokkal.':'A napló frissült egy másik megnyitott ablakból.');
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(view==='settings')render();});
window.addEventListener('appinstalled',()=>{installPrompt=null;if(view==='settings')render();});
$$('[data-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.icon);});
render();
if('serviceWorker' in navigator && location.protocol==='https:'){
  navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
    offlineReady=true;
    if($('#offlineStatus'))$('#offlineStatus').textContent='Az offline fájlok elkészültek ezen az eszközön.';
    updateStorageStatus();
  }).catch(()=>{if($('#offlineStatus'))$('#offlineStatus').textContent='Az offline előkészítés most nem sikerült. Online továbbra is használhatod a naplót.';});
}
