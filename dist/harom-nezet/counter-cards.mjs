/** Scrollable paper-like counters. Uses the existing operation controller and norm snapshots.
 * Unsaved typed totals stay local to employee + date + product, and require Save/Enter.
 * No search, filtering, automatic reordering, login, network calls or separate workday store.
 */
import {PRODUCTS} from '../team-core.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=new Intl.NumberFormat('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2});
export const COUNTER_PRODUCTS=[...PRODUCTS].sort((a,b)=>a.row-b.row);
export function createCounterCards(host,{getContext,getRecord,controller,onResult=()=>{},onError=()=>{}}){
 const drafts=new Map();
 const contextKey=()=>{const c=getContext();return c.employeeId+'|'+c.date;};
 const draftKey=id=>contextKey()+'|'+id;
 const total=id=>getRecord()?.payload.counts[id]??0;
 const version=()=>getRecord()?.version??0;
 const locked=()=>getContext().editable!==true||!!getRecord()&&getRecord().status!=='draft';
 let renderedContext='';
 host.innerHTML=COUNTER_PRODUCTS.map(p=>`<article class="em-counter em-${p.position}" data-counter-product="${p.id}">
  <h3>${esc(p.code)}</h3><p class="em-counter-group">${esc(p.group)}</p>
  ${p.secondaryCode?`<small class="em-counter-alias">${esc(p.secondaryCode)}</small>`:''}
  <p class="em-counter-rate"><span data-counter-rate="${p.id}"></span> perc / db</p>
  <form class="em-counter-form" data-counter-form="${p.id}" novalidate>
   <label class="em-counter-caption" for="counter-${p.id}">Napi darabszám</label>
   <div class="em-counter-stepper">
    <button type="button" data-counter-minus="${p.id}" aria-label="${esc(p.code)}: mínusz egy darab">−</button>
    <input id="counter-${p.id}" name="dailyTotal" data-counter-value="${p.id}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="0" aria-label="${esc(p.code)} napi darabszáma">
    <button type="button" class="em-counter-plus" data-counter-plus="${p.id}" aria-label="${esc(p.code)}: plusz egy darab">+</button>
   </div>
   <div class="em-counter-pending" hidden><small>A beírt szám még nincs mentve. Ez a teljes napi mennyiség.</small><div><button type="submit">Mentés</button><button type="button" data-counter-cancel="${p.id}">Mégse</button></div></div>
   <p class="em-counter-error" role="alert" hidden></p>
  </form>
 </article>`).join('');
 function elements(id){const card=host.querySelector(`[data-counter-product="${id}"]`);return {card,form:card.querySelector('form'),input:card.querySelector('input'),pending:card.querySelector('.em-counter-pending'),error:card.querySelector('.em-counter-error')};}
 function refresh(){
  const changed=renderedContext!==contextKey();renderedContext=contextKey();
  for(const p of COUNTER_PRODUCTS){
   const {card,input,pending,error}=elements(p.id),draft=drafts.get(draftKey(p.id)),n=total(p.id),readOnly=locked();
   card.classList.toggle('has-count',n>0);card.classList.toggle('has-draft',!!draft);
   card.querySelector('[data-counter-rate]').textContent=number.format((getRecord()?.norms[p.id]??p.rate)/100);
   const next=draft?draft.value:String(n);if(input.value!==next)input.value=next;
   input.disabled=readOnly;input.setAttribute('aria-invalid',String(!!draft?.error));pending.hidden=!draft;
   error.textContent=draft?.error??'';error.hidden=!draft?.error;
   // Avoid mixing an unconfirmed absolute total with an incremental +/− operation.
   card.querySelector('[data-counter-minus]').disabled=readOnly||!!draft||n===0;
   card.querySelector('[data-counter-plus]').disabled=readOnly||!!draft||n>=99999;
   card.querySelector('button[type=submit]').disabled=readOnly;
  }
 }
 function reportError(id,e){const d=drafts.get(draftKey(id));if(d){d.error=e.message;refresh();}onError(e);}
 host.addEventListener('input',e=>{
  const id=e.target.dataset.counterValue;if(!id)return;
  if(locked()){refresh();return;}
  const key=draftKey(id),previous=drafts.get(key);
  if(e.target.value===String(total(id)))drafts.delete(key);
  else drafts.set(key,{value:e.target.value,expectedVersion:previous?.expectedVersion??version(),error:''});
  refresh();
 });
 host.addEventListener('keydown',e=>{
  const id=e.target.dataset.counterValue;if(id&&e.key==='Escape'){e.preventDefault();drafts.delete(draftKey(id));refresh();}
 });
 host.addEventListener('submit',e=>{
  if(!e.target.dataset.counterForm)return;e.preventDefault();e.stopPropagation();
  const id=e.target.dataset.counterForm,p=PRODUCTS.find(p=>p.id===id),key=draftKey(id),draft=drafts.get(key);
  if(!draft)return;
  try{
   const receipt=controller.run({kind:'set',productId:id,position:p.position,amount:draft.value,expectedVersion:draft.expectedVersion});
   drafts.delete(key);refresh();onResult(receipt);
  }catch(error){reportError(id,error);}
 });
 host.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.counterCancel){drafts.delete(draftKey(button.dataset.counterCancel));refresh();return;}
  const id=button.dataset.counterPlus||button.dataset.counterMinus;if(!id)return;
  try{
   if(drafts.has(draftKey(id)))throw Error('Előbb mentsd vagy vesd el a beírt napi mennyiséget.');
   const p=PRODUCTS.find(p=>p.id===id);
   const receipt=controller.run({kind:button.dataset.counterPlus?'add':'decrement',productId:id,position:p.position,amount:'1'});
   refresh();onResult(receipt);
  }catch(error){reportError(id,error);}
 });
 refresh();return {refresh};
}
