// Adapter for the existing single-device app. Reuses its original input/save path;
// does not write workday data, change norms, or introduce any server connection.
import {PRODUCTS} from './catalog.mjs';
import {addedCount,createQuickEntry} from './quick-entry.mjs';
const view=document.querySelector('#viewHost');
let controller=null;
function quantityInput(id){return view.querySelector(`[data-quantity="${id}"]`);}
function currentCount(id){const input=quantityInput(id);if(!input)throw new Error('A termék most nem érhető el. Frissítsd az oldalt.');return Number(input.value);}
function locked(){return Boolean(view.querySelector('[data-action="reopen"]')) || !view.querySelector('.recording-section');}
function syncCards(){
  const cards=[...view.querySelectorAll('[data-product-card]')];
  for(const card of cards)card.hidden=Number(card.querySelector('[data-quantity]').value)===0;
  for(const section of view.querySelectorAll('.product-section'))section.hidden=![...section.querySelectorAll('[data-product-card]')].some(card=>!card.hidden);
  const empty=view.querySelector('.qe-empty');if(empty)empty.hidden=cards.some(card=>!card.hidden);
  controller?.refresh();
}
function mount(){
  const section=view.querySelector('.recording-section');
  if(section?.dataset.qeMounted==='true')return;
  controller=null;
  view.classList.toggle('qe-live-mode',Boolean(section));
  if(!section)return;
  section.dataset.qeMounted='true';
  const heading=section.querySelector('.section-header');
  heading.querySelector('h2').textContent='Ma felírt típusok';
  heading.querySelector('.muted').textContent='Csak a ma hozzáadott típusok. A darabszámok itt javíthatók.';
  const host=document.createElement('div');view.querySelector('#statsHost').before(host);
  const empty=document.createElement('p');empty.className='qe-empty';empty.textContent='A hozzáadott típusok itt jelennek meg. A + / − gombokkal később is javíthatod a darabokat.';
  section.querySelector('#productsHost').before(empty);
  controller=createQuickEntry(host,{products:PRODUCTS,getCount:currentCount,isLocked:locked,getRate(product){
    const value=quantityInput(product.id)?.closest('[data-product-card]')?.querySelector('.product-norm strong')?.textContent;
    return value?Math.round(Number(value.replace(/\s/g,'').replace(',','.'))*100):NaN;
  },onAdd(id,increment){
    if(locked())throw new Error('A nap le van zárva. Javításhoz előbb nyisd újra.');
    const input=quantityInput(id);if(!input||input.disabled)throw new Error('Ez a nap most nem szerkeszthető.');
    input.value=String(addedCount(currentCount(id),increment));
    input.dispatchEvent(new Event('input',{bubbles:true}));
    if(!input.validity.valid)throw new Error(input.validationMessage);
    syncCards();
  }});
  syncCards();
}
if(view){
  new MutationObserver(mount).observe(view,{childList:true});
  for(const event of ['input','click','focusout'])document.addEventListener(event,e=>{
    if(view.contains(e.target)&&!e.target.closest('.quick-entry'))queueMicrotask(()=>{if(view.querySelector('.recording-section'))syncCards();});
  });
  mount();
}
